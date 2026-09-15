import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { type Db, int } from "@/lib/db";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SEED = join(process.cwd(), "supabase", "seed.sql");

/** The seeded roster, in rotation order. */
export const THU_VU = "thu.vu@timeedit.com";
export const TIEN_LAI = "tien.lai@timeedit.com";
export const TUAN_TRAN = "tuan.tran@timeedit.com";
export const VIET_LAM = "viet.lam@timeedit.com";
export const VU_VUONG = "vu.vuong@timeedit.com";
export const YEN_VU = "yen.vu@timeedit.com";

/**
 * The Supabase-specific pieces a plain Postgres does not have: the
 * `authenticated` role the policies are granted to, `supabase_auth_admin` --
 * the role Supabase Auth calls the sign-in hook as -- the `auth.users` table a
 * Google sign-in lands in, and `auth.uid()`.
 */
const AUTH_STUB = `
  -- Supabase ships these roles; the policies and grants reference them.
  do $$
  declare r text;
  begin
    foreach r in array array['anon', 'authenticated', 'service_role', 'supabase_auth_admin'] loop
      if not exists (select 1 from pg_roles where rolname = r) then
        execute format('create role %I', r);
      end if;
    end loop;
  end $$;

  create schema if not exists auth;

  create table auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text not null unique
  );

  -- Mirrors Supabase's own auth.uid(): an unset or empty claim is null, not an
  -- error, so "signed out" behaves here the way it behaves in the real thing.
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
      ''
    )::uuid;
  $$;

  -- Supabase grants these itself. Without them current_member_id(), which calls
  -- auth.uid(), fails for the very role every signed-in request runs as.
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

export interface FundTestDb extends Db {
  /** Sign in as the Member with this address, the way a Google sign-in would. */
  signInAs(email: string): Promise<string>;
  /**
   * Attempt a sign-in without assuming it will be allowed: runs the
   * `before_user_created_hook` first, exactly as Supabase Auth does, and
   * rejects with the hook's own message when it refuses.
   */
  attemptSignIn(email: string): Promise<string>;
  signOut(): Promise<void>;

  /**
   * Run a query the way a signed-in request does -- as the `authenticated`
   * role, carrying this auth user's claims. The fixture's own connection is
   * superuser and bypasses row level security; this is the only way to see
   * what a Member is actually allowed to read. Pass null for a visitor with no
   * session at all.
   */
  asAuthenticated<T = Record<string, unknown>>(
    authUserId: string | null,
    text: string,
    params?: unknown[],
  ): Promise<T[]>;

  /** The same thing shaped as the `Db` the app passes around. */
  dbFor(authUserId: string | null): Db;

  memberId(email: string): Promise<string>;
  /** The one Balance figure: accepted Contributions less non-voided Expenses. */
  balance(): Promise<number>;
  /** The full name of whoever holds the cash that Month, or null. */
  holderOf(month: string): Promise<string | null>;
  /** Override a Month's Holder, as the Members screen will. */
  setHolder(month: string, email: string | null): Promise<void>;
  /** Put accepted cash in the envelope without going through the Acceptance rules. */
  fundWith(amountVnd: number, month?: string): Promise<void>;
  raiseClaim(
    claimant: string,
    amountVnd: number,
    description: string,
    spentOn?: string | null,
  ): Promise<string>;

  close(): Promise<void>;
}

/** An in-process Postgres with the real migrations and the real seed applied. */
export async function createFundDb(): Promise<FundTestDb> {
  const pg = new PGlite();
  await pg.exec(AUTH_STUB);

  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  await pg.exec(readFileSync(SEED, "utf8"));

  const query = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };

  const setClaims = (authUserId: string | null) =>
    query(`select set_config('request.jwt.claims', $1, false)`, [
      authUserId === null ? "" : JSON.stringify({ sub: authUserId }),
    ]);

  const memberId = async (email: string): Promise<string> => {
    const [row] = await query<{ id: string }>(`select id from members where email = $1`, [email]);
    if (!row) throw new Error(`No Member on the roster has the address ${email}`);
    return row.id;
  };

  const asAuthenticated = async <T>(
    authUserId: string | null,
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> => {
    await query(`begin`);
    try {
      await query(`select set_config('request.jwt.claims', $1, true)`, [
        authUserId === null ? "" : JSON.stringify({ sub: authUserId, role: "authenticated" }),
      ]);
      await query(`set local role authenticated`);
      const rows = await query<T>(text, params);
      await query(`commit`);
      return rows;
    } catch (error) {
      await query(`rollback`);
      throw error;
    }
  };

  const attemptSignIn = async (email: string) => {
    const [decision] = await query<{ result: { error?: { message: string } } }>(
      `select before_user_created_hook($1::jsonb) as result`,
      [JSON.stringify({ user: { email } })],
    );
    const refusal = decision!.result.error;
    if (refusal) throw new Error(refusal.message);

    const [user] = await query<{ id: string }>(
      `insert into auth.users (email) values (lower($1)) returning id`,
      [email],
    );
    await setClaims(user!.id);
    return user!.id;
  };

  return {
    query,
    attemptSignIn,
    memberId,

    async signInAs(email) {
      const [existing] = await query<{ id: string }>(
        `select id from auth.users where email = lower($1)`,
        [email],
      );
      if (existing) {
        await setClaims(existing.id);
        return existing.id;
      }
      return attemptSignIn(email);
    },

    async signOut() {
      await setClaims(null);
    },

    asAuthenticated,

    dbFor(authUserId) {
      return { query: (text, params) => asAuthenticated(authUserId, text, params) };
    },

    async balance() {
      const [row] = await query<{ v: string | number }>(`select fund_balance() as v`);
      return int(row!.v);
    },

    async holderOf(month) {
      const [row] = await query<{ full_name: string }>(
        `select m.full_name from members m where m.id = holder_for($1::date)`,
        [month],
      );
      return row?.full_name ?? null;
    },

    async setHolder(month, email) {
      const holder = email === null ? null : await memberId(email);
      await query(`select ensure_month($1::date)`, [month]);
      await query(
        `update months set holder_id = $1::uuid
          where month_start = date_trunc('month', $2::date)::date`,
        [holder, month],
      );
    },

    async fundWith(amountVnd, month = "2026-09-01") {
      const tuan = await memberId(TUAN_TRAN);
      await query(
        `insert into contributions (month_start, amount_vnd, source, status, accepted_by, accepted_at, created_by)
         values (ensure_month($1::date), $2, 'company', 'accepted', $3::uuid, now(), $3::uuid)`,
        [month, amountVnd, tuan],
      );
    },

    async raiseClaim(claimant, amountVnd, description, spentOn = null) {
      const id = await memberId(claimant);
      const [row] = await query<{ id: string }>(
        `insert into claims (claimant_id, amount_vnd, description, spent_on, created_by)
         values ($1::uuid, $2, $3, $4::date, $1::uuid) returning id`,
        [id, amountVnd, description, spentOn],
      );
      return row!.id;
    },

    async close() {
      await pg.close();
    },
  };
}
