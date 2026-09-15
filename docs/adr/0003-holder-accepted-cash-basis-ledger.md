# The ledger is cash-basis, gated by Holder acceptance

The Fund is physical cash held by a rotating Holder. We record only movements
of that cash: an Expense exists when the Holder spends the Fund's money or
accepts a Claim, and a Contribution counts once the Holder has accepted it. A
Claim that is never accepted never reaches the ledger.

The alternative was an accrual model, where an Expense is recorded when the team
consumes something and an unpaid reimbursement is carried as a liability. We
rejected it because the Holder is the only person who can see the cash, so
making their acceptance the gate keeps the Balance equal to the envelope at all
times. Only the Holder spends the Fund directly; when anyone else pays, their
spending enters the ledger through a Claim.

## Consequences

A Month's totals mean "cash that moved this Month", not "what the team consumed
this Month". A taxi paid on 28 March and reimbursed on 2 April is an April
Expense, accepted by April's Holder, not March's — so Month totals are stable
once passed, but they are not a record of consumption. The Claim stores the
original spend date so that information is not lost.

There is exactly one Balance figure. Pending Claims are displayed next to it and
never subtracted from it: the Balance is a fact about the envelope, and pending
Claims are a pipeline.
