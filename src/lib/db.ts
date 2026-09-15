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
