import { readDashboard } from "@/lib/dashboard";
import { fundDb } from "@/lib/db.server";
import { formatMonth, formatVnd } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The Dashboard, read-only.
 *
 * VN-2 stands this up as the walking skeleton: it reads the Balance, the
 * pending Claims beside it and this Month's Holder straight out of the
 * database, so a deploy proves the whole toolchain end to end. It is not yet
 * behind a sign-in — that is VN-3 — so do not point it at a database holding
 * real money until that lands.
 */
export default async function DashboardPage() {
  const db = fundDb();
  if (!db) return <NotConnected />;

  const { balanceVnd, pendingClaimsVnd, pendingClaimsCount, currentMonth, holderName, roster } =
    await readDashboard(db);

  return (
    <Shell month={currentMonth}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Figure
          label="Balance"
          value={formatVnd(balanceVnd)}
          note="What the envelope should hold right now."
        />
        <Figure
          label="Pending Claims"
          value={formatVnd(pendingClaimsVnd)}
          note={
            pendingClaimsCount === 1
              ? "1 Member waiting to be paid back."
              : `${pendingClaimsCount} Members waiting to be paid back.`
          }
        />
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
          Holding the cash
        </h2>
        <p className="mt-2 text-lg">
          {holderName ? (
            <>
              <span className="font-semibold">{holderName}</span> holds the Fund&apos;s cash in{" "}
              {formatMonth(currentMonth)}.
            </>
          ) : (
            <span className="text-stone-500">
              No Member is recorded as holding the cash in {formatMonth(currentMonth)}.
            </span>
          )}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase">The roster</h2>
        <ul className="mt-2 divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {roster.map((member) => (
            <li key={member.email} className="flex items-center justify-between gap-3 px-4 py-3">
              <span>{member.fullName}</span>
              {member.isHolder && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  Holder
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-stone-500">
          The rotation runs alphabetically by given name and advances by itself each Month.
        </p>
      </section>
    </Shell>
  );
}

function Shell({ month, children }: { month?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">TE Fund</h1>
        <p className="mt-1 text-sm text-stone-500">
          The Vietnam team&apos;s shared Fund
          {month ? ` — ${formatMonth(month)}` : ""}.
        </p>
      </header>
      {children}
    </main>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4">
      <p className="text-sm font-semibold tracking-wide text-stone-500 uppercase">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-stone-500">{note}</p>
    </div>
  );
}

function NotConnected() {
  return (
    <Shell>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="font-semibold text-amber-900">No database connected yet</h2>
        <p className="mt-2 text-sm text-amber-900/80">
          The schema and the seeded roster live in <code>supabase/</code>, and the test suite runs
          them against an in-process Postgres. To point this page at the real Fund, link a Supabase
          project, apply the migrations and the seed, then set <code>DATABASE_URL</code>.
        </p>
      </div>
    </Shell>
  );
}
