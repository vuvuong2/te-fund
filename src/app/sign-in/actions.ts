"use server";

import { redirect } from "next/navigation";
import { COMPANY_DOMAIN } from "@/lib/auth/refusal";
import { requestOrigin } from "@/lib/request-origin";
import { supabaseForRequest } from "@/lib/supabase/server";

/**
 * Hand the Member to Google, asking for the account the Fund expects.
 *
 * `hd` narrows Google's own account chooser to TimeEdit addresses and
 * `prompt=select_account` stops it silently reusing a personal one. Neither is
 * a control: anyone can take them back off the URL, which is why the refusal
 * lives in the database.
 */
export async function startGoogleSignIn() {
  const supabase = await supabaseForRequest();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await requestOrigin()}/auth/callback`,
      queryParams: { hd: COMPANY_DOMAIN, prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect("/sign-in?refused=unknown");

  // Google's consent screen, which is the one redirect here that leaves the app.
  redirect(data.url as `https://${string}`);
}
