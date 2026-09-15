import "server-only";
import postgres from "postgres";
import { BECOME_MEMBER, CLAIM_MEMBER, type Db, memberClaims } from "./db";

/**
 * The Supabase Postgres, reached over a plain connection string as the Member
 * the request belongs to.
 *
 * There is deliberately no way to reach the Fund without an identity. Every
 * statement runs as `authenticated` carrying the Member's claim, so
 * `current_member_id()` resolves and the row level security policies decide
 * what comes back — a screen that forgets to ask who is looking gets nothing
 * rather than everything.
 *
 * Null until the Supabase project is linked and `DATABASE_URL` is set.
 */
let client: postgres.Sql | null = null;

/** Whether the Fund has a database behind it at all. */
export function fundDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function fundDbAs(authUserId: string): Db | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  client ??= postgres(url, { prepare: false, max: 4 });
  const sql = client;
  const claims = memberClaims(authUserId);

  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      // One transaction per query: `set local` is how the claim and the role
      // are scoped to this statement rather than left on a pooled connection
      // for whoever picks it up next.
      const rows = await sql.begin(async (tx) => {
        await tx.unsafe(CLAIM_MEMBER, [claims]);
        await tx.unsafe(BECOME_MEMBER);
        return tx.unsafe(text, params as never[]);
      });
      return rows as unknown as T[];
    },
  };
}
