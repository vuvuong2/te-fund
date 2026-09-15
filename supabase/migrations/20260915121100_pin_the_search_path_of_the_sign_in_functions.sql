-- TE Fund: say which `members` these functions mean.
--
-- `set search_path = public` is not the guard it looks like. Postgres searches
-- `pg_temp` ahead of it, so any caller who may create a temporary table -- which
-- is every signed-in Member -- can put a `members` table in front of the real
-- one and have a security definer function read theirs instead. Verified: a
-- Member could make current_member_id() answer with another Member's id, and
-- every policy in 20260915120200_rls.sql hangs off that one answer.
--
-- Nothing in the app can be made to do it today: every statement it sends is a
-- literal with bound parameters. It is the reachability that is wrong.
--
-- An empty search path plus schema-qualified names is the fix Postgres
-- documents: pg_catalog is still searched implicitly, so format() and friends
-- keep working, and `public.members` can no longer be anything but itself.
--
-- Still outstanding, and deliberately not in this ticket: the money functions
-- from 20260915120100 (accept_claim, accept_contribution, void_expense,
-- void_contribution, write_audit_log) have no search_path at all. VN-3 is what
-- first made them reachable as `authenticated`, so they want the same treatment.

create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where auth_user_id = auth.uid() and left_on is null;
$$;

create or replace function before_user_created_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   'Only @timeedit.com accounts may sign in. Google sent no address at all.'
      )
    );
  end if;

  if split_part(v_email, '@', 2) <> 'timeedit.com' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   format('Only @timeedit.com accounts may sign in. %s is not one.', v_email)
      )
    );
  end if;

  if not exists (select 1 from public.members where email = v_email and left_on is null) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   format('No Member on the roster has the address %s', v_email)
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

create or replace function link_auth_user_to_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.members set auth_user_id = new.id where email = lower(new.email);
  return new;
end;
$$;
