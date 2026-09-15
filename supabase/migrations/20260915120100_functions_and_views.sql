-- TE Fund: invariants, derived figures, and the operations that move money.
--
-- Acceptance is the only way money enters or leaves the ledger, so it lives in
-- functions rather than in application code: accepting a Claim must update the
-- Claim and create the Expense atomically, or neither.

create or replace function current_member_id() returns uuid
language sql stable as $$
  select id from members where auth_user_id = auth.uid();
$$;


-- Derived figures -------------------------------------------------------------

-- There is exactly one Balance, and it must equal the cash in the envelope.
create or replace function fund_balance() returns bigint
language sql stable as $$
  select (
      coalesce((select sum(amount_vnd) from contributions
                 where status = 'accepted' and voided_at is null), 0)
    - coalesce((select sum(amount_vnd) from expenses
                 where voided_at is null), 0)
  )::bigint;
$$;

-- Shown *beside* the Balance, never subtracted from it: the Balance is a fact
-- about the envelope, pending Claims are a pipeline.
create or replace function pending_claims_total() returns bigint
language sql stable as $$
  select coalesce(sum(amount_vnd), 0)::bigint from claims where status = 'pending';
$$;

create or replace function holder_for(p_month date) returns uuid
language sql stable as $$
  select holder_id from months where month_start = date_trunc('month', p_month)::date;
$$;


-- Housekeeping triggers -------------------------------------------------------

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Free-text tags survive six people typing on phones only if they are
-- normalised: lowercased, trimmed, de-duplicated, sorted.
create or replace function normalise_tags() returns trigger
language plpgsql as $$
begin
  select coalesce(array_agg(distinct s.v order by s.v), '{}')
    into new.tags
    from (select nullif(btrim(lower(t)), '') as v from unnest(new.tags) as t) s
   where s.v is not null;
  return new;
end;
$$;

create or replace function write_audit_log() returns trigger
language plpgsql security definer as $$
declare
  v_row_id  uuid;
  v_changed jsonb;
begin
  if tg_op = 'DELETE' then
    v_row_id := old.id;
    v_changed := to_jsonb(old);
  elsif tg_op = 'INSERT' then
    v_row_id := new.id;
    v_changed := to_jsonb(new);
  else
    v_row_id := new.id;
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value))
      into v_changed
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value;
    if v_changed is null then
      return null;
    end if;
  end if;

  insert into audit_log (table_name, row_id, action, actor_id, changed)
  values (tg_table_name, v_row_id, lower(tg_op), current_member_id(), v_changed);
  return null;
end;
$$;

create trigger members_touch       before update on members       for each row execute function touch_updated_at();
create trigger claims_touch        before update on claims        for each row execute function touch_updated_at();
create trigger expenses_touch      before update on expenses      for each row execute function touch_updated_at();
create trigger contributions_touch before update on contributions for each row execute function touch_updated_at();

create trigger expenses_normalise_tags
  before insert or update of tags on expenses
  for each row execute function normalise_tags();

create trigger claims_audit        after insert or update or delete on claims        for each row execute function write_audit_log();
create trigger expenses_audit      after insert or update or delete on expenses      for each row execute function write_audit_log();
create trigger contributions_audit after insert or update or delete on contributions for each row execute function write_audit_log();
create trigger months_audit_holder after update on months                            for each row execute function write_audit_log();


-- Rotation --------------------------------------------------------------------

-- Alphabetical by given name, cycling. Only a suggestion: months.holder_id is
-- set explicitly, so leave and absence are handled by simply overriding it.
create or replace function suggested_holder_for(p_month date) returns uuid
language plpgsql stable as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_prev  uuid;
  v_count int;
  v_idx   int;
begin
  select count(*) into v_count
    from members where in_rotation and left_on is null;
  if v_count = 0 then
    return null;
  end if;

  select holder_id into v_prev
    from months
   where month_start < v_month and holder_id is not null
   order by month_start desc
   limit 1;

  select s.rn into v_idx
    from (select id, row_number() over (order by given_name, family_name) as rn
            from members where in_rotation and left_on is null) s
   where s.id = v_prev;

  if v_idx is null then
    return (select id from members where in_rotation and left_on is null
             order by given_name, family_name limit 1);
  end if;

  return (select s.id
            from (select id, row_number() over (order by given_name, family_name) as rn
                    from members where in_rotation and left_on is null) s
           where s.rn = (v_idx % v_count) + 1);
end;
$$;


-- Creating a Month advances the rotation, so nobody has to remember to. The
-- suggestion is only a default: months.holder_id can be overridden at any time,
-- which is how leave and absence are handled.
create or replace function ensure_month(p_month date) returns date
language plpgsql as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not exists (select 1 from months where month_start = v_month) then
    insert into months (month_start, holder_id)
    values (v_month, suggested_holder_for(v_month))
    on conflict (month_start) do nothing;
  end if;
  return v_month;
end;
$$;


-- Moving money ----------------------------------------------------------------

-- Accepting a Claim is what creates the Expense (ADR-0003). The Expense is
-- filed under the month it was accepted in, which may not be the month the
-- money was spent -- that date is kept on the Claim.
create or replace function accept_claim(p_claim_id uuid, p_accepted_on date default current_date)
returns uuid
language plpgsql security definer as $$
declare
  v_claim   claims%rowtype;
  v_month   date;
  v_actor   uuid := current_member_id();
  v_holder  uuid;
  v_expense uuid;
begin
  select * into v_claim from claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim % does not exist', p_claim_id;
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'Claim % is already %', p_claim_id, v_claim.status;
  end if;

  v_month  := ensure_month(p_accepted_on);
  v_holder := holder_for(v_month);

  if v_holder is null then
    raise exception 'No Holder is set for %, so nobody can accept this Claim', v_month;
  end if;
  if v_actor is null or v_actor <> v_holder then
    raise exception 'Only the Holder of % may accept a Claim', v_month;
  end if;
  -- A Claim can be raised against an empty Fund; it simply waits for
  -- Contributions. Better an unpayable Claim than a Balance that lies.
  if fund_balance() < v_claim.amount_vnd then
    raise exception 'The Fund holds % VND, less than the % VND claimed',
      fund_balance(), v_claim.amount_vnd;
  end if;

  update claims
     set status = 'accepted', accepted_by = v_actor, accepted_at = now()
   where id = p_claim_id;

  insert into expenses (month_start, occurred_on, amount_vnd, description,
                        paid_by_id, claim_id, created_by)
  values (v_month, p_accepted_on, v_claim.amount_vnd, v_claim.description,
          v_claim.claimant_id, v_claim.id, v_actor)
  returning id into v_expense;

  return v_expense;
end;
$$;

-- The only other way a Claim ends. No 'rejected': a wrong Claim is a Slack
-- message and an edit by the person who raised it.
create or replace function cancel_claim(p_claim_id uuid) returns void
language plpgsql security definer as $$
declare
  v_claim claims%rowtype;
  v_actor uuid := current_member_id();
begin
  select * into v_claim from claims where id = p_claim_id for update;
  if not found then
    raise exception 'Claim % does not exist', p_claim_id;
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'Claim % is already %', p_claim_id, v_claim.status;
  end if;
  if v_actor is null or v_actor <> v_claim.claimant_id then
    raise exception 'Only the Member who raised a Claim may cancel it';
  end if;

  update claims set status = 'cancelled', cancelled_at = now() where id = p_claim_id;
end;
$$;

-- The Holder confirms the cash physically arrived. Until then it is not in the
-- Balance.
create or replace function accept_contribution(p_contribution_id uuid) returns void
language plpgsql security definer as $$
declare
  v_row    contributions%rowtype;
  v_actor  uuid := current_member_id();
  v_holder uuid;
begin
  select * into v_row from contributions where id = p_contribution_id for update;
  if not found then
    raise exception 'Contribution % does not exist', p_contribution_id;
  end if;
  if v_row.status = 'accepted' then
    raise exception 'Contribution % has already been accepted', p_contribution_id;
  end if;
  if v_row.voided_at is not null then
    raise exception 'Contribution % has been voided', p_contribution_id;
  end if;

  v_holder := holder_for(v_row.month_start);
  if v_holder is null then
    raise exception 'No Holder is set for %', v_row.month_start;
  end if;
  if v_actor is null or v_actor <> v_holder then
    raise exception 'Only the Holder of % may accept a Contribution', v_row.month_start;
  end if;

  update contributions
     set status = 'accepted', accepted_by = v_actor, accepted_at = now()
   where id = p_contribution_id;
end;
$$;

-- Soft delete. Permitted even after the money moved: the mistake is real and
-- the correction should be visible. Six colleagues settle the cash themselves.
create or replace function void_expense(p_expense_id uuid, p_reason text) returns void
language plpgsql security definer as $$
declare
  v_actor uuid := current_member_id();
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Voiding requires a reason';
  end if;

  update expenses
     set voided_at = now(), voided_by = v_actor, void_reason = p_reason
   where id = p_expense_id and voided_at is null;

  if not found then
    raise exception 'Expense % does not exist or is already voided', p_expense_id;
  end if;
end;
$$;

create or replace function void_contribution(p_contribution_id uuid, p_reason text) returns void
language plpgsql security definer as $$
declare
  v_actor uuid := current_member_id();
begin
  if v_actor is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Voiding requires a reason';
  end if;

  update contributions
     set voided_at = now(), voided_by = v_actor, void_reason = p_reason
   where id = p_contribution_id and voided_at is null;

  if not found then
    raise exception 'Contribution % does not exist or is already voided', p_contribution_id;
  end if;
end;
$$;


-- Views -----------------------------------------------------------------------

create view fund_overview as
  select
    fund_balance()                                             as balance_vnd,
    pending_claims_total()                                     as pending_claims_vnd,
    (select count(*) from claims where status = 'pending')     as pending_claims_count,
    date_trunc('month', current_date)::date                    as current_month,
    holder_for(current_date)                                   as current_holder_id;

-- The Ledger screen deliberately mirrors the spreadsheet: one list, grouped by
-- Month. Only accepted Contributions appear, because only they are cash.
create view ledger as
  select e.id,
         'expense'::text            as kind,
         e.month_start,
         e.occurred_on              as on_date,
         (- e.amount_vnd)           as signed_amount_vnd,
         e.amount_vnd,
         e.description,
         e.tags,
         (e.voided_at is not null)  as voided
    from expenses e
  union all
  select c.id,
         'contribution'::text,
         c.month_start,
         c.received_on,
         c.amount_vnd,
         c.amount_vnd,
         coalesce(c.note, ''),
         '{}'::text[],
         (c.voided_at is not null)
    from contributions c
   where c.status = 'accepted';
