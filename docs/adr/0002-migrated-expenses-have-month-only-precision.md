# Migrated Expenses carry a Month, not a date

The 2025 and 2026 spreadsheet tabs contain no dates at all. A row's only
temporal anchor is the `Tháng N` divider above it, and rows within a month are
not in date order. We import those rows with a Month and a null date, rather
than backfilling a plausible date such as the first of the month.

Expenses created in the app going forward do carry a real date. The migrated
rows are therefore honestly imprecise instead of precisely wrong: a null says
"we never knew", whereas a synthesised date would be indistinguishable from a
real one and would quietly corrupt any future analysis that trusted it.

## Consequences

Roughly 120 historical Expenses have no date, so anything date-based must
tolerate nulls and fall back to Month. This is irreversible in the sense that
matters — the dates were never recorded anywhere, so they cannot be recovered
later if we change our minds.
