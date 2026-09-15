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
