# AGENTS.md

Guidance for coding agents working in this repository.

## Agent skills

### Issue tracker

Issues live in Jira, project **VN** ("Vietnam Team") on [board 364](https://timeedit.atlassian.net/jira/software/projects/VN/boards/364), accessed through the Atlassian MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, applied as free-form Jira labels under their own names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), with the Jira
issue key as the scope:

```
<type>(VN-123): <summary, imperative, lowercase, no full stop>

<body: why, not what>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`,
`chore`, `revert`.

- **The scope is the issue key** the work belongs to — `feat(VN-5): …`. That
  keeps the ticket in `git log --oneline` and greppable by key. It departs
  from the Conventional Commits spec, which reserves the scope for a part of
  the codebase; here the ticket is the more useful thing to carry.
- **Work with no ticket takes no scope** — `chore: pin the Supabase CLI as a
  devDependency`. If a change is big enough to want a scope, it is big enough
  to want a ticket.
- **One type per commit.** A commit that is both a `feat` and a `fix` is
  usually two commits.
- A breaking change takes `!` before the colon and a `BREAKING CHANGE:`
  footer.
- Keep the summary within 72 characters.
- The body says why, and names things as `CONTEXT.md` names them: a reader
  should meet the Fund, the Holder, a Claim and Acceptance — not a pot, a
  treasurer or a reimbursement.

Pull request titles follow the same format, so that a squash merge lands a
valid commit message.

## Quality gate

Lint and format run before every commit, and the slow checks run before every
push. Both are mechanical — `lefthook.yml` installs them, and `npm install`
installs the hooks. Do not rely on remembering to run them.

| When | Runs | Roughly |
| --- | --- | --- |
| `pre-commit` | Biome format + lint, staged files only, auto-fixing and re-staging | under a second |
| `pre-push` | `npm run typecheck`, `npm test`, `npm run build` | tens of seconds |
| CI (`pull_request`, `push` to `main`) | all of the above, check-only | a couple of minutes |

Run them by hand with `npm run lint` (check) or `npm run lint:fix` (rewrite).

The commit hook **rewrites your staged files and re-stages them**. If you have
staged part of a file with `git add -p`, the rest of that file's formatting
comes along with it.

### Deliberately outside the gate

**SQL and Markdown are not checked, and this is a decision, not an oversight —
do not "fix" it by adding tooling.**

`supabase/migrations/` is the highest-consequence code here, but both defects
found in it so far were semantic, not stylistic: an audit trigger reading a
column that does not exist on `months`, and views missing `security_invoker`
that leaked the Fund's Balance to anonymous callers. No formatter catches
either. The test suite is the real gate on SQL behaviour, and it runs at push.
A SQL linter would also mean Python tooling in a Node repository, against the
repo-local-tooling pattern followed everywhere else here.

Markdown — `CONTEXT.md`, the ADRs, this file — is hand-wrapped prose. A
formatter would fight the author.

Biome's `style/noNonNullAssertion` is off for the reason recorded in
`biome.jsonc`: its only offered fix is unsafe, and would turn a hard failure
into a silent `undefined` in the suite that guards the Fund's money.

### Bypassing

`git commit --no-verify` and `git push --no-verify` work, and sometimes they
are the right call. **Say so in the commit body or the pull request
description when you use one**, naming what you skipped and why.

The rule is disclosure rather than prohibition: a flat ban gets broken quietly
at the end of a long day, and then nobody knows which commits were checked.

A bypass delays the finding rather than hiding it. `main` is protected and the
CI `check` job is a required status check, so work that skipped the hooks and
fails them cannot merge — it just fails later, in public, instead of on your
machine in twenty seconds.

## Pull Request convention

PR title with conventional commit, also for branch name
