import { NextResponse } from "next/server";
import { COMPANY_DOMAIN, classifyRefusal, type RefusalCode } from "@/lib/auth/refusal";
import { fundDbAs } from "@/lib/db.server";
import { readSignedInMember } from "@/lib/member";
import { requestOrigin } from "@/lib/request-origin";
import { clearSessionCookies, supabaseForRequest } from "@/lib/supabase/server";

/**
 * Where Google sends a Member back to.
 *
 * Arriving here is not the same as being let in. The database has already
 * turned away everyone it refuses — an address outside the company domain, and
 * a company address with no Member on the roster — and this asks both
 * questions again against the roster as it stands right now, because a hook
 * that was never registered in the project would otherwise fail open.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = await requestOrigin();
  const refuse = (code: RefusalCode) => NextResponse.redirect(`${origin}/sign-in?refused=${code}`);

  const refused = classifyRefusal(searchParams);
  if (refused) return refuse(refused);

  const code = searchParams.get("code");
  if (!code) return refuse("unknown");

  const supabase = await supabaseForRequest();

  // A refusal after the session exists has to take the session away again, or
  // the gate and the sign-in screen send the visitor back and forth.
  const refuseAndSignOut = async (code: RefusalCode) => {
    await supabase.auth.signOut();
    return clearSessionCookies(refuse(code));
  };

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    // A refusal can also arrive as a failed exchange rather than as an error on
    // the URL, and it is still the hook's sentence that says which rule broke.
    const said = new URLSearchParams({
      error: "server_error",
      error_description: error?.message ?? "",
    });
    return refuse(classifyRefusal(said) ?? "unknown");
  }

  const email = data.user.email?.toLowerCase() ?? "";
  if (email.split("@")[1] !== COMPANY_DOMAIN) return refuseAndSignOut("outside-domain");

  const db = fundDbAs(data.user.id);
  if (!db) {
    await supabase.auth.signOut();
    return clearSessionCookies(NextResponse.redirect(`${origin}/sign-in`));
  }

  if (!(await readSignedInMember(db))) return refuseAndSignOut("not-on-roster");

  return NextResponse.redirect(`${origin}/`);
}
