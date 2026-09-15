import { afterEach, beforeEach, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { createFundDb, type FundTestDb, TUAN_TRAN, VU_VUONG } from "@/test/fund-db";
import { readDashboard } from "./dashboard";

let db: FundTestDb;
/** The Dashboard as a Member actually meets it: through the policies. */
let asMember: Db;
let thisMonth: string;

beforeEach(async () => {
  db = await createFundDb();
  // The Dashboard reads whichever Month is current, so these tests pin that
  // Month's Holder rather than leaning on the seed's September 2026 — which
  // would quietly start failing the moment the calendar moved on.
  const [row] = await db.query<{ month: string }>(
    `select date_trunc('month', current_date)::date::text as month`,
  );
  thisMonth = row!.month;
  await db.setHolder(thisMonth, TUAN_TRAN);
  asMember = db.dbFor(await db.signInAs(VU_VUONG));
});

afterEach(async () => {
  await db.close();
});

it("reads the figures the Dashboard shows", async () => {
  await db.fundWith(1_000_000, thisMonth);
  await db.raiseClaim(VU_VUONG, 130_900, "Taxi to the venue");

  const dashboard = await readDashboard(asMember);

  expect(dashboard.balanceVnd).toBe(1_000_000);
  expect(dashboard.pendingClaimsVnd).toBe(130_900);
  expect(dashboard.pendingClaimsCount).toBe(1);
  expect(dashboard.holderName).toBe("Tuan Tran");
  expect(dashboard.currentMonth).toBe(thisMonth);
});

it("keeps pending Claims beside the Balance, never subtracted from it", async () => {
  await db.fundWith(1_000_000, thisMonth);
  await db.raiseClaim(VU_VUONG, 130_900, "Taxi to the venue");

  const dashboard = await readDashboard(asMember);

  expect(dashboard.balanceVnd).toBe(1_000_000);
});

it("shows the roster in rotation order, marking who holds the cash", async () => {
  const { roster } = await readDashboard(asMember);

  expect(roster.map((m) => m.fullName)).toEqual([
    "Thu Vu",
    "Tien Lai",
    "Tuan Tran",
    "Viet Lam",
    "Vu Vuong",
    "Yen Vu",
  ]);
  expect(roster.filter((m) => m.isHolder).map((m) => m.fullName)).toEqual(["Tuan Tran"]);
});

it("reports no Holder rather than guessing one for a Month that has none", async () => {
  await db.setHolder(thisMonth, null);

  const dashboard = await readDashboard(asMember);

  expect(dashboard.holderName).toBeNull();
  expect(dashboard.roster.every((m) => !m.isHolder)).toBe(true);
});
