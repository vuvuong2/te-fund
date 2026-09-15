# Every request runs as the Member it belongs to

A signed-in request reaches Postgres as the `authenticated` role, carrying the
Member's claim, so `current_member_id()` resolves and the row level security
policies decide what comes back. There is no way to read the Fund without an
identity: `fundDbAs()` takes an auth user id, and nothing else opens a
connection.

The alternative was to keep VN-2's single privileged connection and let the
application decide who may see what. It is less plumbing, and it is what most of
this app's screens would do correctly. We rejected it because "most" is the
problem: six people share one pot and any of them may record anything, so the
protection that matters is the one that does not depend on every future screen
remembering to ask who is looking.

## Consequences

Grants are written out (`20260915120700_member_grants.sql`) rather than left to
Supabase's expose-new-tables default, because policies are only half of the
answer — Postgres asks first whether the role may touch the table at all. The
grants are doing more of the work than the policies are: every policy in
`20260915120200_rls.sql` reads `current_member_id() is not null`, which is the
flat-roles design talking — any Member may record and correct anything, and the
audit log is what makes that safe. So what a role may reach is a question of
grants, and what a Member may do once inside is a question of the audit trail,
not of the policies.

A table added later is unreachable until someone says otherwise — but only if
`auto_expose_new_tables` is off, which this repo sets in `config.toml` and the
hosted project must be set to separately. The anonymous role is granted
nothing, which took two migrations: `EXECUTE` is granted to `PUBLIC` on every
new function, and `anon` inherits it, so revoking from `anon` alone took
nothing away (`20260915121000`).

`current_member_id()` reads the roster with the definer's rights. As an
invoker's-rights function it recursed: every policy calls it, and it reads
`members`, whose policy calls it again. That defect sat in the schema from VN-2
until sign-in made anything run as `authenticated`.

Definer's rights then have to say which `members` they mean. `search_path =
public` is not enough, because `pg_temp` is searched ahead of it and every
signed-in Member may create a temporary table; an empty search path with
schema-qualified names is the fix (`20260915121100`). The money functions from
VN-2 still have no search path set at all.

Each query runs inside its own transaction, because `set local` is what keeps
the claim and the role from outliving the statement on a pooled connection.

The test suite can now exercise the policies rather than describe them: the
fixture re-enters as `authenticated` through `asAuthenticated`, and proves a
signed-out visitor and a Google account with no Member behind it see nothing.
What it still cannot prove is that the connection string's role is allowed to
`set role authenticated` — Supabase's `postgres` role is, but that is a fact
about the hosted project, not about this repository.
