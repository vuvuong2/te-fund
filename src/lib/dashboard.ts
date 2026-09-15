import { type Db, day, int } from "./db";

/**
 * What the Dashboard reads.
 *
 * VN-2 keeps this deliberately thin — one Balance, the pending Claims beside
 * it, this Month's Holder and the roster — so the walking skeleton has
 * something real to render. The full Dashboard and Ledger are VN-4.
 */
export interface Dashboard {
  balanceVnd: number;
  pendingClaimsVnd: number;
  pendingClaimsCount: number;
  currentMonth: string;
  /** Null for a Month with no recorded Holder, which is honest, not an error. */
  holderName: string | null;
  roster: RosterEntry[];
}

export interface RosterEntry {
  fullName: string;
  email: string;
  isHolder: boolean;
}

export async function readDashboard(db: Db): Promise<Dashboard> {
  const [overview] = await db.query<{
    balance_vnd: string | number;
    pending_claims_vnd: string | number;
    pending_claims_count: string | number;
    current_month: string;
    holder_full_name: string | null;
  }>(
    `select o.balance_vnd, o.pending_claims_vnd, o.pending_claims_count,
            o.current_month, m.full_name as holder_full_name
       from fund_overview o
       left join members m on m.id = o.current_holder_id`,
  );

  const roster = await db.query<{ full_name: string; email: string; is_holder: boolean }>(
    `select m.full_name, m.email, (m.id = holder_for(current_date)) as is_holder
       from members m
      where m.left_on is null
      order by m.given_name, m.family_name`,
  );

  return {
    balanceVnd: int(overview!.balance_vnd),
    pendingClaimsVnd: int(overview!.pending_claims_vnd),
    pendingClaimsCount: int(overview!.pending_claims_count),
    currentMonth: day(overview!.current_month),
    holderName: overview!.holder_full_name,
    roster: roster.map((m) => ({
      fullName: m.full_name,
      email: m.email,
      isHolder: m.is_holder,
    })),
  };
}
