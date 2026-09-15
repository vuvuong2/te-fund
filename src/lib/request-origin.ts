import "server-only";
import { headers } from "next/headers";

/**
 * The origin to send a Member back to.
 *
 * Google has to be handed an absolute URL, and every redirect in the sign-in
 * flow is built from one. `x-forwarded-host` is whatever the last proxy said,
 * so it is a fact about the deployment rather than about the request: on Vercel
 * the platform sets it from a host it has already accepted, but nothing here
 * can tell that from a header an attacker chose. `NEXT_PUBLIC_SITE_URL` settles
 * it where it is set, and the header is the fallback for local work and preview
 * deployments, whose hostnames nobody can know in advance.
 */
export async function requestOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = incoming.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocol}://${host}`;
}
