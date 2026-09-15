/**
 * The one thing this app needs from a database: run SQL, get rows.
 *
 * Deliberately this small so the same code runs against the Supabase Postgres
 * in production and against an in-process Postgres in the tests, with nothing
 * mocked in either case.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Postgres hands `bigint` back as a string over some drivers, a number over others. */
export function int(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/** Dates here are days, not instants: keep them `YYYY-MM-DD` whatever the driver returns. */
export function day(value: string | Date): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return value.slice(0, 10);
}

/**
 * What makes a connection the Member's, in the two statements Postgres needs.
 *
 * Both are transaction-local, which is what keeps the claim and the role from
 * outliving the statement on a pooled connection. They live here rather than in
 * db.server.ts because the test fixture sends the same preamble to its own
 * Postgres: one copy means the suite cannot quietly stop proving what
 * production does.
 */
export const CLAIM_MEMBER = `select set_config('request.jwt.claims', $1, true)`;
export const BECOME_MEMBER = `set local role authenticated`;

/** The claim itself. Null is a visitor with no session, and claims nothing. */
export function memberClaims(authUserId: string | null): string {
  return authUserId === null ? "" : JSON.stringify({ sub: authUserId, role: "authenticated" });
}
