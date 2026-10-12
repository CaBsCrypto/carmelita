import { z } from "zod";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { hasSameRequestOrigin } from "@/app/stytch/request-security";

export const appChangeInput = z.object({ appId: z.literal("bazaar"), action: z.enum(["add", "remove"]), idempotencyKey: z.string().min(8).max(128) }).strict();
export const appConfirmInput = z.object({ changeId: z.string().min(1).max(128), confirmationToken: z.string().min(20).max(256) }).strict();
export const appCancelInput = z.object({ changeId: z.string().min(1).max(128) }).strict();

export function hasSameAppRequestOrigin(request: Request) {
  if (hasSameRequestOrigin(request)) return true;
  // Next canonicalizes 127.0.0.1 to localhost in development. Only accept the
  // exact loopback Host authority and port; proxy headers never grant trust.
  try {
    const url = new URL(request.url), host = request.headers.get("host"), rawOrigin = request.headers.get("origin");
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || !host || !rawOrigin) return false;
    const authority = new URL(`http://${host}`), origin = new URL(rawOrigin);
    return !authority.username && !authority.password && authority.pathname === "/" && !authority.search && !authority.hash && ["localhost", "127.0.0.1"].includes(authority.hostname) && authority.port === url.port && origin.origin === authority.origin && origin.href === `${origin.origin}/`;
  } catch { return false; }
}

/** Web routes accept only a direct Privy login. MCP claims cannot choose this channel. */
export async function ownAppWebUser(request: Request, mutation = false) {
  if (mutation && !hasSameAppRequestOrigin(request)) throw new Error("apps_invalid_origin");
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new Error("apps_authentication_required");
  try { return (await verifyPrivyAccessToken(match[1])).user_id; }
  catch { throw new Error("apps_authentication_required"); }
}

export function appResponse(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
export function appFailure(error: unknown) {
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "";
  const code = error instanceof z.ZodError ? "apps_invalid_input" : /^(?:apps?|bazaar|x402)_[a-z0-9_]+$/.test(raw) ? raw : "apps_request_unavailable";
  const status = code.includes("authentication") ? 401 : code.includes("origin") || code.includes("scope") ? 403 : code.includes("not_found") ? 404 : code.includes("expired") || code.includes("changed") || code.includes("conflict") || code.includes("approval") ? 409 : code.includes("invalid") ? 400 : 503;
  return appResponse({ error: code }, status);
}
