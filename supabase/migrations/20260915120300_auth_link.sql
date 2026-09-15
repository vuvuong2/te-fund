-- TE Fund: bind a Google sign-in to a Member.
--
-- The @timeedit.com check has to happen on the server, not in the browser --
-- this app knows who owes whom money. Google's `hd` hint is a convenience, not
-- a control.
--
-- Note: this creates a trigger on auth.users. Apply it with the Supabase SQL
-- editor or the CLI; it needs rights a plain anon connection does not have. If
-- your project forbids it, move the same logic into an auth hook instead.

create or replace function link_auth_user_to_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_member_id uuid;
begin
  if split_part(lower(new.email), '@', 2) <> 'timeedit.com' then
    raise exception 'Only @timeedit.com accounts may sign in';
  end if;

  select id into v_member_id from members where email = lower(new.email);
  if v_member_id is null then
    raise exception 'No Member on the roster has the address %', new.email;
  end if;

  update members set auth_user_id = new.id where id = v_member_id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function link_auth_user_to_member();
