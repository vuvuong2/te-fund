import type { Db } from "./db";

/**
 * The Member a request belongs to.
 *
 * `current_member_id()` is the binding a Google sign-in leaves behind, so this
 * is a question the database answers rather than something the app carries
 * around: no session, or a Google account with no Member behind it, and the
 * answer is nobody.
 */
export interface SignedInMember {
  id: string;
  /** Always the full name: "Vu" belongs to three of the six Members. */
  fullName: string;
  email: string;
}

export async function readSignedInMember(db: Db): Promise<SignedInMember | null> {
  const [row] = await db.query<{ id: string; full_name: string; email: string }>(
    `select id, full_name, email from members where id = current_member_id()`,
  );
  if (!row) return null;
  return { id: row.id, fullName: row.full_name, email: row.email };
}
