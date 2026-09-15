-- TE Fund: what the `authenticated` role may touch.
--
-- Every signed-in request runs as `authenticated` carrying the Member's claims
-- (see src/lib/db.server.ts), which is what makes the policies in
-- 20260915120200_rls.sql load-bearing rather than decorative. Those policies
-- decide which rows; these grants decide which tables, and Postgres needs both.
--
-- Written out rather than left to Supabase's "expose new tables automatically"
-- default, so the test suite runs against the same privileges production does
-- and a new table is not reachable until someone says so.

grant select, insert, update on
  members, months, claims, expenses, contributions
  to authenticated;

-- Append-only, and only through the trigger: readable by everyone, which is the
-- entire point of having it.
grant select on audit_log to authenticated;

-- No delete on anything, at any level: correction here is voiding, not erasing.

grant select on fund_overview, ledger to authenticated;

grant execute on all functions in schema public to authenticated;

-- ...except the sign-in hook, which decides who becomes a user at all and is
-- called by Supabase Auth alone. The blanket grant above would otherwise hand it
-- to every Member.
revoke execute on function before_user_created_hook(jsonb) from anon, authenticated, public;

-- The anonymous role reaches nothing. A signed-out visitor has no business with
-- the Fund's money, and the views leaked it once already
-- (20260915120500_views_respect_rls.sql).
revoke all on
  members, months, claims, expenses, contributions, audit_log, fund_overview, ledger
  from anon;
revoke execute on all functions in schema public from anon;
