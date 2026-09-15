-- TE Fund: let current_member_id() read the roster without asking itself.
--
-- Every policy in 20260915120200_rls.sql hangs off current_member_id(), and
-- current_member_id() reads `members`. As an invoker's-rights function that is
-- a loop: selecting from members applies members_read, which calls
-- current_member_id(), which selects from members. Postgres unwinds it as
-- "infinite recursion detected in policy for relation members", and a Member
-- signed in perfectly correctly sees nothing at all.
--
-- It went unnoticed because nothing ran as `authenticated` until sign-in landed
-- (VN-3); the test fixture connected as superuser, which bypasses RLS entirely.
--
-- security definer breaks the loop the way Supabase's own examples do: the
-- function reads the roster with the owner's rights, and still answers only
-- with the Member belonging to the current auth.uid(). It is a lookup of who
-- you are, not a decision about what you may see.
create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where auth_user_id = auth.uid();
$$;
