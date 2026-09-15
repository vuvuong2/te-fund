/**
 * Why a sign-in was turned away.
 *
 * Both refusals are decided in the database, by `before_user_created_hook`:
 * an address outside the company domain, and a company address with no Member
 * on the roster. Supabase Auth hands the hook's message back to us as
 * `error_description` on the callback URL.
 *
 * That query string is part of a URL anyone can type, so nothing in it reaches
 * the screen. The callback recognises which of our own two sentences came
 * back, and the sign-in screen renders copy from here.
 */

/** The exact sentences the hook returns. `schema.test.ts` holds the SQL to them. */
export const OUTSIDE_DOMAIN = "Only @timeedit.com accounts may sign in";
export const NOT_ON_ROSTER = "No Member on the roster has the address";

export type RefusalCode = "outside-domain" | "not-on-roster" | "cancelled" | "unknown";

export interface Refusal {
  headline: string;
  detail: string;
}

const REFUSALS: Record<RefusalCode, Refusal> = {
  "outside-domain": {
    headline: "That account is not a TimeEdit one",
    detail:
      "The Fund is signed into with your @timeedit.com Google account. A personal address cannot reach it.",
  },
  "not-on-roster": {
    headline: "That address is not on the roster",
    detail:
      "The Fund belongs to the six Members of the Vietnam team, and only the roster may sign in. If you have just joined, ask the Holder to add you.",
  },
  cancelled: {
    headline: "Sign-in was cancelled",
    detail: "Nothing happened. Try again when you are ready.",
  },
  unknown: {
    headline: "Sign-in did not complete",
    detail: "Google sent us back without a session. Try again, and tell the team if it persists.",
  },
};

/**
 * Which refusal arrived on the callback URL, or null when the sign-in was not
 * refused at all.
 */
export function classifyRefusal(params: URLSearchParams): RefusalCode | null {
  const description = params.get("error_description") ?? "";
  const error = params.get("error") ?? params.get("error_code");

  // The database's own words first: a refused Member reaches us as an OAuth
  // error, and which OAuth error it is says less than what the hook said.
  if (description.includes(OUTSIDE_DOMAIN)) return "outside-domain";
  if (description.includes(NOT_ON_ROSTER)) return "not-on-roster";

  if (error === null) return null;
  if (error === "access_denied") return "cancelled";
  return "unknown";
}

/** The copy for a refusal code that has been round-tripped through a URL. */
export function refusalFor(code: string | undefined | null): Refusal | null {
  if (!code) return null;
  return REFUSALS[code as RefusalCode] ?? REFUSALS.unknown;
}
