import { readDashboard } from "@/lib/dashboard";
import { formatMonth, formatVnd } from "@/lib/format";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The Dashboard, read-only.
 *
 * VN-2 stood this up as the walking skeleton; VN-3 put it behind the roster.
 * Everything below is read as the signed-in Member, so what the page can show
 * is what the policies allow them — there is no privileged read behind it.
 */
export default async function DashboardPage() {
  const { member, db } = await requireMember();

  const { balanceVnd, pendingClaimsVnd, pendingClaimsCount, currentMonth, holderName, roster } =
    await readDashboard(db);

  return (
    <Shell month={currentMonth} signedInAs={member.fullName}>
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

function Shell({
  month,
  signedInAs,
  children,
}: {
  month?: string;
  signedInAs: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">TE Fund</h1>
        <p className="mt-1 text-sm text-stone-500">
          The Vietnam team&apos;s shared Fund
          {month ? ` — ${formatMonth(month)}` : ""}.
        </p>
        {/* In full, always: three of the six Members answer to "Vu". */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-stone-500">
            Signed in as <span className="font-medium text-stone-900">{signedInAs}</span>
          </span>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="rounded-sm text-stone-500 underline underline-offset-4 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            >
              Sign out
            </button>
          </form>
        </div>
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
