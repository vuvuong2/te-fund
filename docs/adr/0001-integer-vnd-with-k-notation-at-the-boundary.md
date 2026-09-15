# Amounts are whole VND integers; k-notation lives only at the boundary

The team writes money in thousands (`100k`, and even `130.9`), and the source
spreadsheet is denominated that way throughout. We store amounts as whole VND
integers instead — `130.9` becomes `130900` — and treat `k` purely as an input
and display convention, parsed on the way in and rendered on the way out.

Storing the displayed value would mean a decimal or float amount, and rounding
drift across a few hundred rows would eventually make the Balance disagree with
the cash in the envelope. Since reconciling against the envelope is the app's
one job, that trade is not worth making for the convenience of matching the
spreadsheet's units.

## Consequences

k-notation must never reach the database. Every entry point — the web form, and
later the Slack command — parses `130.9k`, `130k` and `130900` to the same
integer. Anything that persists a `k` value is a bug.
