-- TE Fund: close the gap the last grants migration left open.
--
-- 20260915120700 says the anonymous role reaches nothing, and for tables that
-- is true. For functions it was not: Postgres grants EXECUTE to PUBLIC on every
-- function it creates, `anon` inherits that, and revoking from `anon` alone
-- takes nothing away. Every function in this schema -- including
-- accept_claim(), void_expense() and the rest of the money -- was callable by
-- an unauthenticated PostgREST caller. They refuse to do anything useful,
-- because each one checks current_member_id() or the Holder first, but a
-- refusal inside a function the caller should never have reached is a thinner
-- defence than not reaching it.
--
-- The grants to `authenticated` in 20260915120700 are explicit, so they survive
-- this.

revoke execute on all functions in schema public from public;

-- And the same for whatever a later migration adds, so this does not have to be
-- remembered each time.
alter default privileges in schema public revoke execute on functions from public;

-- The service role stays whole: it is the escape hatch for server-side work
-- with no Member behind it, and it was never the role this is about.
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant execute on functions to service_role;
