-- TE Fund: row level security.
--
-- Roles are flat by design: six people share one pot, so anyone may record and
-- correct anything, and the audit_log is what makes that safe. The only
-- privileged operation is Acceptance, and that is enforced inside
-- accept_claim() and accept_contribution() rather than here, because it depends
-- on who holds the cash this month rather than on a role.

alter table members       enable row level security;
alter table months        enable row level security;
alter table claims        enable row level security;
alter table expenses      enable row level security;
alter table contributions enable row level security;
alter table audit_log     enable row level security;

-- Every policy hangs off this: you must be a signed-in Member of the roster.
-- A Google account outside @timeedit.com never gets a members row, so it can
-- see nothing.
create policy members_read   on members for select to authenticated using (current_member_id() is not null);
create policy members_write  on members for update to authenticated using (current_member_id() is not null) with check (current_member_id() is not null);
create policy members_insert on members for insert to authenticated with check (current_member_id() is not null);

create policy months_read   on months for select to authenticated using (current_member_id() is not null);
create policy months_insert on months for insert to authenticated with check (current_member_id() is not null);
create policy months_write  on months for update to authenticated using (current_member_id() is not null) with check (current_member_id() is not null);

create policy claims_read   on claims for select to authenticated using (current_member_id() is not null);
create policy claims_insert on claims for insert to authenticated with check (created_by = current_member_id());
create policy claims_write  on claims for update to authenticated using (current_member_id() is not null) with check (current_member_id() is not null);

create policy expenses_read   on expenses for select to authenticated using (current_member_id() is not null);
create policy expenses_insert on expenses for insert to authenticated with check (created_by = current_member_id());
create policy expenses_write  on expenses for update to authenticated using (current_member_id() is not null) with check (current_member_id() is not null);

create policy contributions_read   on contributions for select to authenticated using (current_member_id() is not null);
create policy contributions_insert on contributions for insert to authenticated with check (created_by = current_member_id());
create policy contributions_write  on contributions for update to authenticated using (current_member_id() is not null) with check (current_member_id() is not null);

-- Append-only, and only through the trigger. Readable by everyone, which is
-- the entire point of having it.
create policy audit_log_read on audit_log for select to authenticated using (current_member_id() is not null);

-- No delete policy on any table: soft delete only.
