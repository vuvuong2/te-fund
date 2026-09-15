import { refusalFor } from "@/lib/auth/refusal";
import { fundDbConfigured } from "@/lib/db.server";
import { supabaseConfig } from "@/lib/supabase/server";
import { startGoogleSignIn } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The only screen a signed-out visitor can reach.
 *
 * It says what was refused and why, in the words of src/lib/auth/refusal.ts —
 * the refusal itself was decided in the database, and travels here as a code
 * on the URL rather than as prose anyone could put there.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ refused?: string }>;
}) {
  const refusal = refusalFor((await searchParams).refused);
  // Both halves or neither: Supabase Auth says who you are, the database says
  // whether you are on the roster, and a sign-in that cannot ask the second
  // question is not a sign-in.
  const connected = supabaseConfig() !== null && fundDbConfigured();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">TE Fund</h1>
      <p className="mt-1 text-sm text-stone-500">The Vietnam team&apos;s shared Fund.</p>

      {refusal && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">{refusal.headline}</h2>
          <p className="mt-2 text-sm text-amber-900/80">{refusal.detail}</p>
        </div>
      )}

      {connected ? (
        <form action={startGoogleSignIn} className="mt-6">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-stone-300 bg-white px-4 py-3 font-medium shadow-xs transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            <GoogleMark />
            Continue with Google
          </button>
        </form>
      ) : (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Not connected yet</h2>
          <p className="mt-2 text-sm text-amber-900/80">
            Signing in needs both halves of the project: Supabase Auth to say who you are, and the
            database to say whether you are on the roster. Link a Supabase project, apply the
            migrations and the seed, then set <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and <code>DATABASE_URL</code>.
          </p>
        </div>
      )}

      {/* Who may sign in, for a Member who has not just been told. */}
      {!refusal && (
        <p className="mt-6 text-sm text-stone-500">
          The Fund belongs to the six Members of the Vietnam team. Sign in with the{" "}
          <span className="whitespace-nowrap">@timeedit.com</span> account you already use.
        </p>
      )}
    </main>
  );
}

/** Google's mark, in Google's colours, as their branding terms require. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-5">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
