import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * The session, refreshed, and the front door.
 *
 * Two jobs, and only the first one is unique to this file: Server Components
 * cannot write cookies, so a session that needs refreshing has to be refreshed
 * here or not at all. The second — turning signed-out visitors away from the
 * Fund's screens — is repeated on every screen by requireMember(), because a
 * proxy is a convenience for the visitor rather than a boundary around the
 * money.
 */

/** Reachable with no session: the sign-in screen, and the routes that make one. */
const OPEN = ["/sign-in", "/auth/"];

const isOpen = (path: string) => OPEN.some((open) => path === open || path.startsWith(open));

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const signIn = new URL("/sign-in", request.url);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Without Supabase nobody can be signed in, so nobody may pass. The sign-in
  // screen is where that state is explained.
  if (!url || !publishableKey)
    return isOpen(path) ? NextResponse.next() : NextResponse.redirect(signIn);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(written) {
        for (const { name, value } of written) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of written) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isOpen(path)) return NextResponse.redirect(signIn);
  if (user && path === "/sign-in") return NextResponse.redirect(new URL("/", request.url));

  return response;
}

export const config = {
  // Everything but Next's own static output: the Fund has no public pages.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
