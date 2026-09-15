-- TE Fund: leaving the team leaves the Fund.
--
-- `left_on` has been on `members` since VN-2 and the Dashboard has always
-- filtered on it, but the sign-in path did not: a Member recorded as having
-- left could still sign in, still read the Balance and the Ledger, and -- while
-- a Month still named them -- still accept Claims. The roster is the whole of
-- who may reach the Fund (CONTEXT.md), so a departure has to be the same
-- refusal as never having been on it.
--
-- Recorded rather than removed, deliberately: their Contributions and Expenses
-- stay in the ledger, and the audit log still names them. What ends is access.

create or replace function before_user_created_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  -- No address at all is not a TimeEdit address. Said plainly, because falling
  -- through to the roster check would refuse it in the roster's words.
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

  if not exists (select 1 from members where email = v_email and left_on is null) then
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

-- The same rule on every request after the first, and in one place: every
-- policy in 20260915120200_rls.sql hangs off this, so a Member who leaves stops
-- resolving the moment the row says so rather than when their session expires.
create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where auth_user_id = auth.uid() and left_on is null;
$$;
