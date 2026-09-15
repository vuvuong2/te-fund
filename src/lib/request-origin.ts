import "server-only";
import { headers } from "next/headers";

/**
 * The origin the browser is actually on.
 *
 * Google has to be handed an absolute URL to come back to, and behind Vercel's
 * proxy the request arrives on an internal host that is not the one the Member
 * typed. The forwarded headers carry the real one.
 */
export async function requestOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const protocol = incoming.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${protocol}://${host}`;
}
