# TE Fund

The shared money pot of the TimeEdit Vietnam team. Members and the company put
money in; the team spends it on team-building, meals, and gifts. This app
replaces the spreadsheet the fund has been tracked in since 2023.

## Language

**Fund**:
The single, undifferentiated pot of money belonging to the Vietnam team. There
is exactly one, and money in it is unrestricted — no part of it is reserved for
a stated purpose.
_Avoid_: pot, wallet, account, budget

**Member**:
A person on the Vietnam team who may contribute to and spend from the Fund.
Always named in full: "Vu" is a given name (Vu Vuong) and a family name (Thu Vu,
Yen Vu), so a short name is ambiguous across three of the six Members.
_Avoid_: user, employee, participant

**Holder**:
The Member who physically holds the Fund's cash for a given Month. The role
rotates. A Holder holding the cash does not change the Fund's balance — only
where the money sits.
_Avoid_: treasurer, keeper, custodian, owner, organiser

**Acceptance**:
The Holder's confirmation that cash physically moved — into the Fund for a
Contribution, out of it for a Claim. Every movement of the Fund's money passes
through it, because the Holder is the only person who can see the cash.

**Month**:
The unit the Fund is organised by: Expenses are grouped by Month, and each
Month has one Holder. Inherited from the spreadsheet, where a `Tháng N` row
divides the ledger.
_Avoid_: period, cycle

**Contribution**:
Money entering the Fund, whether from a Member or from the company. It counts
once the Holder has accepted it.
_Avoid_: top-up, deposit, income, credit

**Source**:
Where a Contribution came from: the company, a Member, or other.
_Avoid_: origin, type, kind

**Expense**:
Money leaving the Fund. Created either when the Holder spends the Fund's cash
directly, or when the Holder accepts a Claim.
_Avoid_: spend, cost, purchase, debit

**Tag**:
A free-text label on an Expense, used for grouping and reporting. An Expense
may carry tags such as `taxi` or `lunch`.
_Avoid_: category, label, type

**Claim**:
A Member's request to be reimbursed for money they spent on the team's behalf.
The Holder accepts it by transferring the money, and that acceptance is what
creates the Expense — a Claim that is never accepted never reaches the ledger.
_Avoid_: reimbursement, refund, payback, request

**k-notation**:
The team's habit of writing amounts in thousands of VND — `100k` means 100,000
VND. A display and input convention only; amounts are stored as whole VND.
_Avoid_: shorthand, thousands notation
