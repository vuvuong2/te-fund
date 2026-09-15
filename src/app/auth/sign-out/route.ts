import { NextResponse } from "next/server";
import { isRefusalCode } from "@/lib/auth/refusal";
import { requestOrigin } from "@/lib/request-origin";
import { clearSessionCookies, supabaseForRequest } from "@/lib/supabase/server";

/**
 * Ending a session.
 *
 * A route rather than a Server Action because both callers need it: the Sign
 * out button, and the gate in src/lib/session.ts when the Member behind a
 * still-valid session has left the roster. Only a route handler may clear the
 * cookies, and leaving them in place would bounce that session between the
 * gate and the screen until it expired.
 */
async function signOut(request: Request) {
  const supabase = await supabaseForRequest();
  await supabase.auth.signOut();

  // Only a refusal this app wrote is carried on to the sign-in screen.
  const refused = new URL(request.url).searchParams.get("refused");
  const query = isRefusalCode(refused) ? `?refused=${refused}` : "";
  const origin = await requestOrigin();
  return clearSessionCookies(NextResponse.redirect(`${origin}/sign-in${query}`, { status: 303 }));
}

export const GET = signOut;
export const POST = signOut;
