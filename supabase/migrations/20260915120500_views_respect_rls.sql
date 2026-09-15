-- TE Fund: make the views obey row level security.
--
-- A Postgres view executes with its owner's privileges unless security_invoker
-- is set, so fund_overview and ledger read the underlying tables as the view
-- owner and bypass every policy in 20260915120200_rls.sql.
--
-- Found against the linked project, not in theory: an anonymous caller holding
-- only the publishable key -- which ships in the browser bundle, so this means
-- anyone who opens devtools -- got the Fund's Balance, its pending Claims and
-- the current Holder's id back from fund_overview. ledger returned nothing
-- only because expenses and contributions were still empty; the same hole
-- would have opened with the first real entry.
--
-- With security_invoker on, the querying Member's policies apply as written,
-- and a Member is the only thing anyone can sign in as.

alter view fund_overview set (security_invoker = on);
alter view ledger set (security_invoker = on);

-- Nothing anonymous has any business reading the Fund.
revoke all on fund_overview from anon;
revoke all on ledger from anon;
