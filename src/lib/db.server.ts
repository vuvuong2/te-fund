import postgres from "postgres";
import type { Db } from "./db";

/**
 * The Supabase Postgres, reached over a plain connection string.
 *
 * Null until the Supabase project is linked and `DATABASE_URL` is set, so the
 * app can render and deploy before the database behind it exists. Sign-in and
 * the per-Member session context arrive with VN-3; until then this connection
 * carries no identity and `current_member_id()` is null.
 */
let client: postgres.Sql | null = null;

export function fundDb(): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  client ??= postgres(url, { prepare: false, max: 4 });
  const sql = client;

  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
  };
}
