import "server-only";
import { redirect } from "next/navigation";
import type { Db } from "./db";
import { fundDbAs } from "./db.server";
import { readSignedInMember, type SignedInMember } from "./member";
import { supabaseForRequest } from "./supabase/server";

/**
 * Where every Fund screen starts.
 *
 * Signing in is two questions, and the second is the one that matters: Google
 * says who you are, and the roster says whether you are a Member of this team.
 * Both are asked again here, on the server, on every request — the sign-in
 * hook refused the sign-up, but a session outlives the roster it was issued
 * against, and a Member who leaves should stop seeing the Fund's money the
 * next time they load a screen rather than the next time their token expires.
 */
export interface MemberSession {
  member: SignedInMember;
  /** Scoped to the Member: what it returns is what the policies allow them. */
  db: Db;
}

export async function requireMember(): Promise<MemberSession> {
  const supabase = await supabaseForRequest();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // Without a database nobody can be checked against the roster, so nobody is
  // let in. The sign-in screen explains that state rather than this one.
  const db = fundDbAs(user.id);
  if (!db) redirect("/sign-in");

  const member = await readSignedInMember(db);
  // Signing out first, because a session whose Member has gone would otherwise
  // bounce between the gate and the screen for as long as the cookie lives.
  if (!member) redirect("/auth/sign-out?refused=not-on-roster");

  return { member, db };
}
