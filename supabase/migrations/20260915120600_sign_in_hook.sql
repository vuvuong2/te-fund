-- TE Fund: who may sign in, decided by the database.
--
-- Two refusals matter and they are not the same check: an address outside the
-- company domain, and a company address with no Member on the roster. The
-- second is what stops a TimeEdit colleague from elsewhere in the company
-- wandering into the Vietnam team's Fund. Google's `hd` hint is a convenience
-- for the sign-in screen, not a control.
--
-- Both live in a `before_user_created` auth hook rather than in a trigger that
-- raises. A trigger can only abort the insert, and Supabase Auth turns that
-- into "Database error saving new user" -- true, and no use to the person
-- reading it. A hook returns its own message, which Supabase hands back on the
-- callback URL, so the sign-in screen can say which rule was broken.
-- src/lib/auth/refusal.ts recognises these two sentences; the schema test holds
-- both ends together.
--
-- Register it with the project as well as applying this migration:
--   [auth.hook.before_user_created]
--   enabled = true
--   uri = "pg-functions://postgres/public/before_user_created_hook"
-- (supabase/config.toml for local, Authentication -> Hooks in the dashboard for
-- the hosted project). An unregistered hook is not a refusal that fails open
-- quietly: nobody can sign in at all, because no Member is ever linked.

create or replace function before_user_created_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if split_part(v_email, '@', 2) <> 'timeedit.com' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   format('Only @timeedit.com accounts may sign in. %s is not one.', v_email)
      )
    );
  end if;

  if not exists (select 1 from members where email = v_email) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message',   format('No Member on the roster has the address %s', v_email)
      )
    );
  end if;

  -- Anything but an error object lets the sign-in through.
  return '{}'::jsonb;
end;
$$;

-- Supabase Auth calls the hook as supabase_auth_admin, and nobody else calls it
-- at all: it is a decision about a user who does not exist yet, and it reads the
-- roster with the definer's rights.
grant execute on function before_user_created_hook(jsonb) to supabase_auth_admin;
revoke execute on function before_user_created_hook(jsonb) from anon, authenticated, public;


-- The trigger no longer refuses anything -- the hook above has already turned
-- away everyone it would have. What is left is the binding the rest of the app
-- depends on: auth.users.id onto the Member, so current_member_id() can resolve
-- the signed-in Member on every request.
create or replace function link_auth_user_to_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update members set auth_user_id = new.id where email = lower(new.email);
  return new;
end;
$$;
