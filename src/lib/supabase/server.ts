import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

/**
 * Supabase Auth for this request.
 *
 * Auth is the whole of what Supabase does here: who is signing in, and the
 * session cookies that remember it. The Fund's own rows are read over
 * `DATABASE_URL` as the Member (src/lib/db.server.ts), because the policies
 * they pass through are the point.
 */

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

/** Null until the project is linked, which the sign-in screen says out loud. */
export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export async function supabaseForRequest() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL is unset");

  const jar = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(written) {
        try {
          for (const { name, value, options } of written) jar.set(name, value, options);
        } catch {
          // A Server Component may not write cookies. Every request passes
          // through src/proxy.ts first, which refreshes the session where it
          // still can, so there is nothing to recover from here.
        }
      },
    },
  });
}

/**
 * Take the session off a response, whatever Supabase managed.
 *
 * `signOut()` writes through the cookie jar and can fail -- an auth server
 * having a bad minute is enough. A session that survives its own sign-out
 * bounces between the gate and the screen until it expires, so the cookies come
 * off the response we are already holding rather than on the strength of a call
 * that may not have happened.
 */
export async function clearSessionCookies(response: NextResponse): Promise<NextResponse> {
  for (const { name } of (await cookies()).getAll()) {
    if (name.startsWith("sb-")) response.cookies.delete(name);
  }
  return response;
}
