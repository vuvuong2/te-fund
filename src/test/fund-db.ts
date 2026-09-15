import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { int, type Db } from "@/lib/db";

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
 * `authenticated` role the policies are granted to, the `auth.users` table a
 * Google sign-in lands in, and `auth.uid()`.
 */
const AUTH_STUB = `
  -- Supabase ships these roles; the RLS policies are granted to them.
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated;
    end if;
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
`;

export interface FundTestDb extends Db {
  /** Sign in as the Member with this address, the way a Google sign-in would. */
  signInAs(email: string): Promise<string>;
  /** Attempt a sign-in without assuming it will be allowed. */
  attemptSignIn(email: string): Promise<string>;
  signOut(): Promise<void>;

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

  const attemptSignIn = async (email: string) => {
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
