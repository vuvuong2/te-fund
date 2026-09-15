-- TE Fund: core schema.
--
-- The model is recorded in /CONTEXT.md and docs/adr/. Two rules drive almost
-- everything here:
--   * The ledger is cash-basis and gated by Holder acceptance (ADR-0003), so an
--     Expense row exists only for money that has actually left the envelope.
--   * Amounts are whole VND integers (ADR-0001). k-notation is parsed at the
--     application boundary and must never reach this database.

-- Where a Contribution came from.
create type contribution_source as enum ('company', 'member', 'other');

-- A Claim ends exactly two ways: accepted by the Holder, or cancelled by the
-- person who raised it. There is deliberately no 'rejected' state.
create type claim_status as enum ('pending', 'accepted', 'cancelled');

-- A Contribution counts only once the Holder has confirmed the cash arrived.
create type contribution_status as enum ('pending', 'accepted');


-- Members ---------------------------------------------------------------------

create table members (
  id           uuid primary key default gen_random_uuid(),
  -- Linked to auth.users on first sign-in. Intentionally not a foreign key:
  -- the roster is seeded before anyone logs in.
  auth_user_id uuid unique,
  email        text not null unique,
  full_name    text not null,
  -- Rotation is alphabetical by given name; Vietnamese names put it last.
  given_name   text not null,
  family_name  text not null,
  in_rotation  boolean not null default true,
  joined_on    date not null default current_date,
  left_on      date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Stored lowercase so the address is a reliable key, and restricted to the
  -- company domain. The domain check must live on the server, not the browser.
  constraint members_email_lowercase
    check (email = lower(email)),
  constraint members_email_domain
    check (split_part(email, '@', 2) = 'timeedit.com')
);

comment on column members.full_name is
  'Always display this, never a short name: "Vu" is both a given name (Vu Vuong) and a family name (Thu Vu, Yen Vu).';


-- Months ----------------------------------------------------------------------

-- The Fund is organised by Month, and each Month has one Holder. Months
-- migrated from the spreadsheet have no Holder: only one is evidenced, and a
-- null is more honest than a guess.
create table months (
  month_start date primary key,
  holder_id   uuid references members (id),
  created_at  timestamptz not null default now(),

  constraint months_is_first_of_month
    check (month_start = date_trunc('month', month_start)::date)
);


-- Claims ----------------------------------------------------------------------

-- A Member's request to be reimbursed. Accepting it is what creates the
-- Expense; a Claim that is never accepted never reaches the ledger.
create table claims (
  id           uuid primary key default gen_random_uuid(),
  claimant_id  uuid not null references members (id),
  amount_vnd   bigint not null check (amount_vnd > 0),
  description  text not null,
  -- When the money was actually spent. Preserved because the resulting Expense
  -- is filed under the month it was *accepted* in (ADR-0003).
  spent_on     date,
  status       claim_status not null default 'pending',
  accepted_by  uuid references members (id),
  accepted_at  timestamptz,
  cancelled_at timestamptz,
  created_by   uuid references members (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint claims_accepted_fields
    check ((status = 'accepted') = (accepted_by is not null and accepted_at is not null)),
  constraint claims_cancelled_fields
    check ((status = 'cancelled') = (cancelled_at is not null))
);


-- Expenses --------------------------------------------------------------------

-- Money that has left the Fund: either the Holder spent its cash directly, or
-- the Holder accepted a Claim. Never negative -- refunds are recorded as a
-- Contribution with source 'other'.
create table expenses (
  id           uuid primary key default gen_random_uuid(),
  month_start  date not null references months (month_start),
  -- Null for the ~120 rows migrated from the spreadsheet, which carry no date
  -- at all (ADR-0002). Anything date-based must tolerate this.
  occurred_on  date,
  amount_vnd   bigint not null check (amount_vnd > 0),
  description  text not null default '',
  tags         text[] not null default '{}',
  paid_by_id   uuid references members (id),
  -- Set when this Expense was created by accepting a Claim.
  claim_id     uuid unique references claims (id),
  note         text,
  created_by   uuid references members (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Soft delete only: the audit trail stands in for permissions, so rows are
  -- voided with a reason, never removed.
  voided_at    timestamptz,
  voided_by    uuid references members (id),
  void_reason  text,

  constraint expenses_void_fields
    check (num_nonnulls(voided_at, voided_by, void_reason) in (0, 3)),
  constraint expenses_date_in_month
    check (occurred_on is null or date_trunc('month', occurred_on)::date = month_start)
);


-- Contributions ---------------------------------------------------------------

create table contributions (
  id           uuid primary key default gen_random_uuid(),
  month_start  date not null references months (month_start),
  received_on  date,
  amount_vnd   bigint not null check (amount_vnd > 0),
  source       contribution_source not null,
  -- Who gave it, for member contributions. Deliberately NOT the seed of a
  -- per-member balance: there is no dues tracking.
  member_id    uuid references members (id),
  note         text,
  status       contribution_status not null default 'pending',
  accepted_by  uuid references members (id),
  accepted_at  timestamptz,
  created_by   uuid references members (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  voided_at    timestamptz,
  voided_by    uuid references members (id),
  void_reason  text,

  constraint contributions_member_named
    check (source <> 'member' or member_id is not null),
  constraint contributions_accepted_fields
    check ((status = 'accepted') = (accepted_by is not null and accepted_at is not null)),
  constraint contributions_void_fields
    check (num_nonnulls(voided_at, voided_by, void_reason) in (0, 3)),
  constraint contributions_date_in_month
    check (received_on is null or date_trunc('month', received_on)::date = month_start)
);


-- Audit log -------------------------------------------------------------------

-- Flat permissions are backed by this: anyone may change anything, and every
-- change is visible.
create table audit_log (
  id         bigserial primary key,
  table_name text not null,
  row_id     uuid not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  actor_id   uuid references members (id),
  changed    jsonb,
  at         timestamptz not null default now()
);


-- Indexes ---------------------------------------------------------------------

create index expenses_month_idx        on expenses (month_start) where voided_at is null;
create index expenses_tags_idx         on expenses using gin (tags);
create index expenses_paid_by_idx      on expenses (paid_by_id);
create index contributions_month_idx   on contributions (month_start) where voided_at is null;
create index contributions_member_idx  on contributions (member_id);
create index claims_pending_idx        on claims (status) where status = 'pending';
create index claims_claimant_idx       on claims (claimant_id);
create index audit_log_row_idx         on audit_log (table_name, row_id, at desc);
