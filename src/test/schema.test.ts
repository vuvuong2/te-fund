import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { int } from "@/lib/db";
import {
  createFundDb,
  type FundTestDb,
  THU_VU,
  TIEN_LAI,
  TUAN_TRAN,
  VIET_LAM,
  VU_VUONG,
  YEN_VU,
} from "./fund-db";

/**
 * The schema, exercised against a real Postgres.
 *
 * These assertions drive the SQL directly: the migrations, the security
 * definer functions and the constraints are what VN-2 stands up, and every
 * later ticket builds on them. When the fund operations module arrives (VN-5
 * onwards) its tests point at that module instead; these stay as the proof
 * that the substrate underneath it behaves.
 *
 * Not covered here: the RLS policies. This fixture connects as superuser, so
 * row level security is bypassed — proving it blocks a non-Member needs a real
 * Supabase instance (VN-6).
 */

const SEPTEMBER = "2026-09-01"; // Tuan Tran holds it, per the seed
/** Acceptance dates are always explicit: accept_claim() otherwise defaults to
 *  current_date, which would hand the Fund to a different Holder each Month
 *  and quietly break this suite once the calendar moved past September 2026. */
const IN_SEPTEMBER = "2026-09-14";
const OCTOBER = "2026-10-01";

let db: FundTestDb;

beforeEach(async () => {
  db = await createFundDb();
});

afterEach(async () => {
  await db.close();
});

describe("the roster", () => {
  it("seeds the six Members of the Vietnam team", async () => {
    const [row] = await db.query<{ n: string }>(`select count(*) as n from members`);
    expect(int(row!.n)).toBe(6);
  });

  it("has Tuan Tran holding the cash in September 2026", async () => {
    expect(await db.holderOf(SEPTEMBER)).toBe("Tuan Tran");
  });

  it("stores addresses lowercase", async () => {
    await expect(
      db.query(`insert into members (email, full_name, given_name, family_name)
                values ('Nguyen@timeedit.com', 'Nguyen Test', 'Nguyen', 'Test')`),
    ).rejects.toThrow(/members_email_lowercase/);
  });

  it("refuses an address outside the company domain", async () => {
    await expect(
      db.query(`insert into members (email, full_name, given_name, family_name)
                values ('someone@gmail.com', 'Someone Else', 'Someone', 'Else')`),
    ).rejects.toThrow(/members_email_domain/);
  });
});

describe("signing in", () => {
  it("links a Google account to the Member on the roster", async () => {
    await db.signInAs(THU_VU);
    const [row] = await db.query<{ full_name: string }>(
      `select full_name from members where id = current_member_id()`,
    );
    expect(row!.full_name).toBe("Thu Vu");
  });

  it("refuses a sign-in from outside @timeedit.com", async () => {
    await expect(db.attemptSignIn("outsider@gmail.com")).rejects.toThrow(
      /Only @timeedit.com accounts may sign in/,
    );
  });

  it("refuses a company address that is not on the roster", async () => {
    await expect(db.attemptSignIn("ceo@timeedit.com")).rejects.toThrow(
      /No Member on the roster has the address/,
    );
  });

  it("leaves current_member_id null when nobody is signed in", async () => {
    await db.signOut();
    const [row] = await db.query<{ id: string | null }>(`select current_member_id() as id`);
    expect(row!.id).toBeNull();
  });
});

describe("the Holder rotation", () => {
  it("advances alphabetically by given name when a Month is created", async () => {
    await db.query(`select ensure_month($1::date)`, [OCTOBER]);
    expect(await db.holderOf(OCTOBER)).toBe("Viet Lam");
  });

  it("wraps from the last given name back to the first", async () => {
    const yen = await db.memberId(YEN_VU);
    await db.query(
      `insert into months (month_start, holder_id) values (date '2026-12-01', $1::uuid)`,
      [yen],
    );

    await db.query(`select ensure_month(date '2027-01-01')`);
    expect(await db.holderOf("2027-01-01")).toBe("Thu Vu");
  });

  it("keeps an override rather than recomputing it", async () => {
    await db.query(`select ensure_month($1::date)`, [OCTOBER]);
    const thu = await db.memberId(THU_VU);
    await db.query(`update months set holder_id = $1::uuid where month_start = $2::date`, [
      thu,
      OCTOBER,
    ]);

    await db.query(`select ensure_month($1::date)`, [OCTOBER]);
    expect(await db.holderOf(OCTOBER)).toBe("Thu Vu");
  });

  it("carries the rotation on from an override", async () => {
    await db.query(`select ensure_month($1::date)`, [OCTOBER]);
    const thu = await db.memberId(THU_VU);
    await db.query(`update months set holder_id = $1::uuid where month_start = $2::date`, [
      thu,
      OCTOBER,
    ]);

    await db.query(`select ensure_month(date '2026-11-01')`);
    expect(await db.holderOf("2026-11-01")).toBe("Tien Lai");
  });

  it("refuses a Month that is not the first of a month", async () => {
    await expect(
      db.query(`insert into months (month_start) values (date '2026-10-15')`),
    ).rejects.toThrow(/months_is_first_of_month/);
  });
});

describe("the Balance", () => {
  it("leaves an unaccepted Contribution out", async () => {
    await db.signInAs(VU_VUONG);
    await db.query(
      `insert into contributions (month_start, amount_vnd, source, created_by)
       values (ensure_month($1::date), 1000000, 'company', current_member_id())`,
      [SEPTEMBER],
    );
    expect(await db.balance()).toBe(0);
  });

  it("counts a Contribution the Holder has accepted", async () => {
    await db.signInAs(VU_VUONG);
    const [row] = await db.query<{ id: string }>(
      `insert into contributions (month_start, amount_vnd, source, created_by)
       values (ensure_month($1::date), 1000000, 'company', current_member_id()) returning id`,
      [SEPTEMBER],
    );

    await db.signInAs(TUAN_TRAN);
    await db.query(`select accept_contribution($1::uuid)`, [row!.id]);

    expect(await db.balance()).toBe(1_000_000);
  });

  it("falls when the Fund's cash is spent", async () => {
    await db.fundWith(1_000_000);
    await db.signInAs(TUAN_TRAN);
    await db.query(
      `insert into expenses (month_start, occurred_on, amount_vnd, description, created_by)
       values (ensure_month($1::date), $1::date, 130900, 'Team lunch', current_member_id())`,
      ["2026-09-14"],
    );
    expect(await db.balance()).toBe(869_100);
  });
});

describe("Acceptance", () => {
  it("lets only the Holder accept a Contribution", async () => {
    await db.signInAs(VU_VUONG);
    const [row] = await db.query<{ id: string }>(
      `insert into contributions (month_start, amount_vnd, source, created_by)
       values (ensure_month($1::date), 500000, 'other', current_member_id()) returning id`,
      [SEPTEMBER],
    );

    await expect(db.query(`select accept_contribution($1::uuid)`, [row!.id])).rejects.toThrow(
      /Only the Holder of 2026-09-01 may accept a Contribution/,
    );
    expect(await db.balance()).toBe(0);
  });

  it("lets only the Holder accept a Claim", async () => {
    await db.fundWith(1_000_000);
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi to the venue");

    await db.signInAs(VU_VUONG);
    await expect(
      db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]),
    ).rejects.toThrow(/Only the Holder of 2026-09-01 may accept a Claim/);
  });

  it("refuses a Claim the Fund cannot cover, and says by how much", async () => {
    await db.fundWith(100_000);
    const claim = await db.raiseClaim(VU_VUONG, 500_000, "Dinner for the team");

    await db.signInAs(TUAN_TRAN);
    await expect(
      db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]),
    ).rejects.toThrow(/The Fund holds 100000 VND, less than the 500000 VND claimed/);
    expect(await db.balance()).toBe(100_000);
  });

  it("creates exactly one Expense, linked to the Claim", async () => {
    await db.fundWith(1_000_000);
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi to the venue");

    await db.signInAs(TUAN_TRAN);
    await db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]);

    const expenses = await db.query<{
      amount_vnd: string;
      paid_by_id: string;
      description: string;
    }>(`select amount_vnd, paid_by_id, description from expenses where claim_id = $1::uuid`, [
      claim,
    ]);
    expect(expenses).toHaveLength(1);
    expect(int(expenses[0]!.amount_vnd)).toBe(130900);
    expect(expenses[0]!.paid_by_id).toBe(await db.memberId(VU_VUONG));
    expect(await db.balance()).toBe(869_100);
  });

  it("cannot accept the same Claim twice", async () => {
    await db.fundWith(1_000_000);
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi to the venue");

    await db.signInAs(TUAN_TRAN);
    await db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]);

    await expect(
      db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]),
    ).rejects.toThrow(/is already accepted/);
  });

  it("lets a Holder raise and settle their own Claim", async () => {
    await db.fundWith(1_000_000);
    const claim = await db.raiseClaim(TUAN_TRAN, 200_000, "Gift for a leaver");

    await db.signInAs(TUAN_TRAN);
    await db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]);

    expect(await db.balance()).toBe(800_000);
  });

  it("lets only the Member who raised a Claim cancel it", async () => {
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi to the venue");

    await db.signInAs(TUAN_TRAN);
    await expect(db.query(`select cancel_claim($1::uuid)`, [claim])).rejects.toThrow(
      /Only the Member who raised a Claim may cancel it/,
    );

    await db.signInAs(VU_VUONG);
    await db.query(`select cancel_claim($1::uuid)`, [claim]);
    const [row] = await db.query<{ status: string }>(
      `select status from claims where id = $1::uuid`,
      [claim],
    );
    expect(row!.status).toBe("cancelled");
  });

  it("cannot accept a cancelled Claim", async () => {
    await db.fundWith(1_000_000);
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi to the venue");

    await db.signInAs(VU_VUONG);
    await db.query(`select cancel_claim($1::uuid)`, [claim]);

    await db.signInAs(TUAN_TRAN);
    await expect(
      db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]),
    ).rejects.toThrow(/is already cancelled/);
  });
});

describe("a Claim spent in one Month and accepted in the next", () => {
  it("lands in the Month it was accepted, under that Month's Holder", async () => {
    await db.fundWith(2_000_000);
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi on the 28th", "2026-09-28");

    // October's Holder is Viet Lam, and accept_claim creates the Month.
    await db.signInAs(VIET_LAM);
    await db.query(`select accept_claim($1::uuid, date '2026-10-02')`, [claim]);

    const [expense] = await db.query<{ month_start: string; occurred_on: string }>(
      `select month_start::text, occurred_on::text from expenses where claim_id = $1::uuid`,
      [claim],
    );
    expect(expense!.month_start).toBe(OCTOBER);
    expect(expense!.occurred_on).toBe("2026-10-02");

    const [row] = await db.query<{ spent_on: string; accepted_by: string }>(
      `select spent_on::text, accepted_by from claims where id = $1::uuid`,
      [claim],
    );
    expect(row!.spent_on).toBe("2026-09-28");
    expect(row!.accepted_by).toBe(await db.memberId(VIET_LAM));
  });
});

describe("Tags", () => {
  it("lowercases, trims, de-duplicates and sorts them", async () => {
    await db.signInAs(TUAN_TRAN);
    const [row] = await db.query<{ tags: string[] }>(
      `insert into expenses (month_start, amount_vnd, description, tags, created_by)
       values (ensure_month($1::date), 40000, 'Taxi', array['Taxi', 'taxi', '  taxi  ', 'Lunch', ''], current_member_id())
       returning tags`,
      [SEPTEMBER],
    );
    expect(row!.tags).toEqual(["lunch", "taxi"]);
  });
});

describe("voiding", () => {
  it("takes the Expense out of the Balance but leaves it visible", async () => {
    await db.fundWith(1_000_000);
    await db.signInAs(TUAN_TRAN);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Taxi', current_member_id()) returning id`,
      [SEPTEMBER],
    );
    expect(await db.balance()).toBe(869_100);

    await db.query(`select void_expense($1::uuid, 'Recorded twice')`, [expense!.id]);

    expect(await db.balance()).toBe(1_000_000);
    const [row] = await db.query<{ voided: boolean; void_reason: string }>(
      `select l.voided, e.void_reason from ledger l join expenses e on e.id = l.id where l.id = $1::uuid`,
      [expense!.id],
    );
    expect(row!.voided).toBe(true);
    expect(row!.void_reason).toBe("Recorded twice");
  });

  it("refuses to void without a reason", async () => {
    await db.signInAs(TUAN_TRAN);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Taxi', current_member_id()) returning id`,
      [SEPTEMBER],
    );

    await expect(db.query(`select void_expense($1::uuid, '   ')`, [expense!.id])).rejects.toThrow(
      /Voiding requires a reason/,
    );
  });

  it("refuses to void when nobody is signed in", async () => {
    await db.signInAs(TUAN_TRAN);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Taxi', current_member_id()) returning id`,
      [SEPTEMBER],
    );
    await db.signOut();

    await expect(
      db.query(`select void_expense($1::uuid, 'Recorded twice')`, [expense!.id]),
    ).rejects.toThrow(/Not signed in/);
  });

  it("takes a voided Contribution out of the Balance", async () => {
    await db.fundWith(1_000_000);
    await db.signInAs(TUAN_TRAN);
    const [row] = await db.query<{ id: string }>(`select id from contributions limit 1`);

    await db.query(`select void_contribution($1::uuid, 'Never arrived')`, [row!.id]);

    expect(await db.balance()).toBe(0);
  });

  it("cannot void the same Expense twice", async () => {
    await db.signInAs(TUAN_TRAN);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Taxi', current_member_id()) returning id`,
      [SEPTEMBER],
    );
    await db.query(`select void_expense($1::uuid, 'Recorded twice')`, [expense!.id]);

    await expect(db.query(`select void_expense($1::uuid, 'Again')`, [expense!.id])).rejects.toThrow(
      /does not exist or is already voided/,
    );
  });
});

describe("the Ledger", () => {
  it("shows Expenses and accepted Contributions in one list, with signed amounts", async () => {
    await db.fundWith(1_000_000);
    await db.signInAs(TUAN_TRAN);
    await db.query(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Team lunch', current_member_id())`,
      [SEPTEMBER],
    );

    const rows = await db.query<{ kind: string; signed_amount_vnd: string }>(
      `select kind, signed_amount_vnd from ledger order by kind`,
    );
    expect(rows.map((r) => [r.kind, int(r.signed_amount_vnd)])).toEqual([
      ["contribution", 1_000_000],
      ["expense", -130900],
    ]);
  });

  it("leaves a pending Contribution out entirely", async () => {
    await db.signInAs(VU_VUONG);
    await db.query(
      `insert into contributions (month_start, amount_vnd, source, created_by)
       values (ensure_month($1::date), 1000000, 'company', current_member_id())`,
      [SEPTEMBER],
    );

    const rows = await db.query(`select 1 from ledger`);
    expect(rows).toHaveLength(0);
  });
});

describe("the constraints that keep the record honest", () => {
  it("rejects an amount of zero", async () => {
    await expect(
      db.query(
        `insert into contributions (month_start, amount_vnd, source)
                values (ensure_month($1::date), 0, 'company')`,
        [SEPTEMBER],
      ),
    ).rejects.toThrow(/amount_vnd_check|violates check constraint/);
  });

  it("rejects a negative amount", async () => {
    await expect(
      db.query(
        `insert into expenses (month_start, amount_vnd, description)
                values (ensure_month($1::date), -1000, 'Refund')`,
        [SEPTEMBER],
      ),
    ).rejects.toThrow(/violates check constraint/);
  });

  it("makes a Member Contribution name the Member", async () => {
    await expect(
      db.query(
        `insert into contributions (month_start, amount_vnd, source)
                values (ensure_month($1::date), 1000000, 'member')`,
        [SEPTEMBER],
      ),
    ).rejects.toThrow(/contributions_member_named/);
  });

  it("keeps an Expense's date inside its Month", async () => {
    await expect(
      db.query(
        `insert into expenses (month_start, occurred_on, amount_vnd, description)
                values (ensure_month($1::date), date '2026-10-05', 130900, 'Taxi')`,
        [SEPTEMBER],
      ),
    ).rejects.toThrow(/expenses_date_in_month/);
  });

  it("requires all three void fields together", async () => {
    await db.signInAs(TUAN_TRAN);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Taxi', current_member_id()) returning id`,
      [SEPTEMBER],
    );

    await expect(
      db.query(`update expenses set voided_at = now() where id = $1::uuid`, [expense!.id]),
    ).rejects.toThrow(/expenses_void_fields/);
  });

  it("allows only one Expense per Claim", async () => {
    await db.fundWith(1_000_000);
    const claim = await db.raiseClaim(VU_VUONG, 130900, "Taxi");
    await db.signInAs(TUAN_TRAN);
    await db.query(`select accept_claim($1::uuid, $2::date)`, [claim, IN_SEPTEMBER]);

    await expect(
      db.query(
        `insert into expenses (month_start, amount_vnd, description, claim_id)
                values (ensure_month($1::date), 130900, 'Taxi again', $2::uuid)`,
        [SEPTEMBER, claim],
      ),
    ).rejects.toThrow(/expenses_claim_id_key|duplicate key/);
  });
});

describe("the audit trail", () => {
  it("records who created a row", async () => {
    await db.signInAs(TIEN_LAI);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Team lunch', current_member_id()) returning id`,
      [SEPTEMBER],
    );

    const [entry] = await db.query<{ action: string; actor_id: string }>(
      `select action, actor_id from audit_log
        where table_name = 'expenses' and row_id = $1::text order by at desc limit 1`,
      [expense!.id],
    );
    expect(entry!.action).toBe("insert");
    expect(entry!.actor_id).toBe(await db.memberId(TIEN_LAI));
  });

  it("records who changed it, and what changed", async () => {
    await db.signInAs(TUAN_TRAN);
    const [expense] = await db.query<{ id: string }>(
      `insert into expenses (month_start, amount_vnd, description, created_by)
       values (ensure_month($1::date), 130900, 'Taxi', current_member_id()) returning id`,
      [SEPTEMBER],
    );

    await db.signInAs(YEN_VU);
    await db.query(`select void_expense($1::uuid, 'Recorded twice')`, [expense!.id]);

    const [entry] = await db.query<{
      action: string;
      actor_id: string;
      changed: Record<string, unknown>;
    }>(
      `select action, actor_id, changed from audit_log
        where table_name = 'expenses' and row_id = $1::text and action = 'update' order by at desc limit 1`,
      [expense!.id],
    );
    expect(entry!.actor_id).toBe(await db.memberId(YEN_VU));
    expect(entry!.changed).toHaveProperty("void_reason");
  });

  it("records a Holder override, on a table keyed by Month rather than by id", async () => {
    await db.signInAs(VU_VUONG);
    const thu = await db.memberId(THU_VU);

    await db.query(`update months set holder_id = $1::uuid where month_start = $2::date`, [
      thu,
      SEPTEMBER,
    ]);

    const [entry] = await db.query<{ actor_id: string; changed: Record<string, unknown> }>(
      `select actor_id, changed from audit_log
        where table_name = 'months' and row_id = $1::text order by at desc limit 1`,
      [SEPTEMBER],
    );
    expect(entry!.actor_id).toBe(await db.memberId(VU_VUONG));
    expect(entry!.changed).toHaveProperty("holder_id");
    expect(await db.holderOf(SEPTEMBER)).toBe("Thu Vu");
  });
});

describe("row level security", () => {
  /**
   * This fixture connects as superuser, so it cannot prove a policy blocks a
   * non-Member — that is VN-6, against a real Supabase instance. What it can
   * hold onto is the property the policies depend on: a view without
   * security_invoker runs as its owner and bypasses them entirely, which is
   * how fund_overview came to hand the Fund's Balance to an anonymous caller.
   */
  it("makes the views read as the Member querying them, not as their owner", async () => {
    const rows = await db.query<{ viewname: string; security_invoker: string | null }>(
      `select c.relname as viewname,
              (select o.option_value
                 from pg_options_to_table(c.reloptions) o
                where o.option_name = 'security_invoker') as security_invoker
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'v' and n.nspname = 'public'
        order by c.relname`,
    );

    expect(rows).toEqual([
      { viewname: "fund_overview", security_invoker: "on" },
      { viewname: "ledger", security_invoker: "on" },
    ]);
  });
});
