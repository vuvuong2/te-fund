-- TE Fund: let the audit trail cover rows that are not keyed on `id`.
--
-- `months` is keyed on `month_start`, but write_audit_log() read `new.id`, so
-- the months_audit_holder trigger raised `record "new" has no field "id"` and
-- *every* update to months failed -- including setting the Month's Holder,
-- which is the one override the rotation depends on.
--
-- Only a first-ever run of the schema dodged it: seed.sql ends in an upsert
-- whose `do update set holder_id` is itself an update, so re-applying the seed
-- hit this too.
--
-- row_id becomes text so a Month can be logged under its month_start, and the
-- key is read out of the row's jsonb, which covers both ways this schema keys
-- a table -- `id` everywhere else, `month_start` on months.

alter table audit_log alter column row_id type text using row_id::text;

create or replace function write_audit_log() returns trigger
language plpgsql security definer as $$
declare
  v_row     jsonb;
  v_row_id  text;
  v_changed jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
    v_changed := v_row;
  elsif tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    v_changed := v_row;
  else
    v_row := to_jsonb(new);
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changed
      from jsonb_each(v_row) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value;
    if v_changed is null then
      return null;
    end if;
  end if;

  v_row_id := coalesce(v_row ->> 'id', v_row ->> 'month_start');

  insert into audit_log (table_name, row_id, action, actor_id, changed)
  values (tg_table_name, v_row_id, lower(tg_op), current_member_id(), v_changed);
  return null;
end;
$$;
