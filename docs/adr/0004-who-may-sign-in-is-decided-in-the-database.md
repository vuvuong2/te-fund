# Who may sign in is decided in the database

Two checks stand between a Google account and the Fund: the address must be at
`@timeedit.com`, and it must belong to a Member on the roster. Both are made by
a `before_user_created` auth hook — a Postgres function Supabase Auth calls
before it creates the user — and the message it returns is what the sign-in
screen shows.

The first alternative was Google's `hd` parameter, which we use but do not
count: it narrows Google's account chooser and comes straight back off the URL
if anyone edits it. The second was the trigger VN-2 shipped, which raised on
`auth.users` and so refused correctly but anonymously — Supabase Auth can only
turn an aborted insert into "Database error saving new user", which tells a
colleague from elsewhere in the company nothing about why the Fund will not
have them. The third was to let the user be created and refuse in the
application, which gives a good message but leaves the roster check outside the
database, and leaves a trail of accounts for people who were never let in.

The hook keeps the decision next to the data it is about — the roster is a
table — while still producing a sentence a person can act on.

## Consequences

The hook must be registered with the project as well as applied as a migration:
`supabase/config.toml` for a local stack, Authentication → Hooks in the hosted
one. An unregistered hook does not fail open in a dangerous direction — nobody
is linked to a Member, so nobody gets in — but it does mean the application's
own checks in `/auth/callback` are the only thing left refusing a personal
address, which is why they are there.

The refusal travels from Postgres to the browser as prose, so two sentences are
load-bearing strings. `src/lib/auth/refusal.ts` recognises them and maps them to
copy; the schema test asserts the SQL still says them. Nothing from the callback
URL is rendered, because anyone can type one.

The trigger on `auth.users` still exists and still binds the account to the
Member — that half was never a refusal.

A Member who leaves is not signed out. `left_on` takes them off the roster, and
`current_member_id()` stops resolving them, so they are refused the next time a
screen loads by the gate in `src/lib/session.ts` rather than by this hook, which
only ever sees a first sign-in. Their rows stay in the ledger and the audit log
still names them: recorded as having left, not removed.
