# Issue tracker: Jira

Issues for this repo live in Jira, in the **VN** project ("Vietnam Team") on
[board 364](https://timeedit.atlassian.net/jira/software/projects/VN/boards/364).

- Site: `https://timeedit.atlassian.net`
- `cloudId`: `timeedit.atlassian.net` (the site hostname works directly; the UUID
  form is `aacfd027-13f0-4b10-9359-03ce2267fa06`)
- Project key: `VN` (team-managed software project, id `10165`)
- Issue URLs look like `https://timeedit.atlassian.net/browse/VN-123`

## Access

Use the **Atlassian MCP tools**, not a CLI. Tool names below omit the
`mcp__claude_ai_Atlassian__` prefix. Every call takes `cloudId`.

| Need                  | Tool                                                |
| --------------------- | --------------------------------------------------- |
| Create an issue       | `createJiraIssue`                                    |
| Read an issue         | `getJiraIssue`                                       |
| Update fields         | `editJiraIssue`                                      |
| Find issues           | `searchJiraIssuesUsingJql`                           |
| Comment               | `addCommentToJiraIssue`                              |
| Move across the board | `getTransitionsForJiraIssue`, `transitionJiraIssue`  |
| Link issues           | `getIssueLinkTypes`, `createIssueLink`               |
| Required-field check  | `getJiraIssueTypeMetaWithFields`                     |
| Resolve a person      | `lookupJiraAccountId`                                |

If an MCP call fails auth, say so and stop — do not fall back to scraping the
web UI or guessing issue keys.

## Issue types

`Epic` (hierarchy level 1) · `Feature`, `Story`, `Task`, `Bug` (level 0) ·
`Subtask` (level -1).

- A **feature** gets one `Epic`. Implementation tickets are `Task` (or `Bug`,
  or `Story` when written from the user's perspective) with the Epic set as
  their `parent`.
- Reach for `Subtask` only to split a single ticket that's already in progress.

## When a skill says "publish to the issue tracker"

1. Create or identify the Epic for the feature.
2. Create one issue per ticket via `createJiraIssue` with
   `projectKey: "VN"`, the chosen issue type, and `parent` set to the Epic key.
3. Apply the `needs-triage` label (see `triage-labels.md`) unless the skill
   says the ticket is already triaged.
4. Report the created keys back to the user as `VN-123` links.

Ticket **body** goes in the description. Keep it markdown; the MCP tools accept
`responseContentFormat: "markdown"` for reading it back.

## When a skill says "fetch the relevant ticket"

The user will normally pass an issue key (`VN-123`) or a Jira URL — call
`getJiraIssue` with it. To find work without a key, use
`searchJiraIssuesUsingJql`, e.g.:

- Everything on the board: `project = VN ORDER BY updated DESC`
- A feature's tickets: `project = VN AND parent = VN-100`
- The triage queue: `project = VN AND labels = "needs-triage"`
- AFK-ready work: `project = VN AND labels = "ready-for-agent" AND statusCategory != Done`

## Specs

Specs are longer than a ticket. Draft one at `.scratch/<feature-slug>/spec.md`
in this repo, then publish the agreed version as the **Epic description** so
it sits alongside the tickets it spawned.

## PRs as a request surface

**Off.** Pull requests are not part of the triage queue; only Jira issues are.
