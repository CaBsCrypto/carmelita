import { z } from "zod";

const privyDid = z.string().max(128).regex(/^did:privy:[A-Za-z0-9]+$/);
const recoveryRequest = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("inspect"), privyDid }).strict(),
  z.object({
    operation: z.literal("prepare"),
    privyDid,
    expectedEmail: z.string().max(254).email(),
    confirmed: z.literal(true),
  }).strict(),
]);

const errorStatuses = new Map<string, number>([
  ["admin_auth_required", 401],
  ["invalid_origin", 403],
  ["invalid_request", 400],
  ["registered_user_not_found", 404],
  ["registered_user_inactive", 409],
  ["privy_identity_mismatch", 409],
  ["verified_email_required", 409],
  ["recovery_inspection_changed", 409],
  ["wallet_identity_conflict", 409],
  ["oauth_wallet_preparation_incomplete", 503],
  ["wallet_persistence_unavailable", 503],
  ["privy_not_configured", 503],
  ["provider_identity_unavailable", 503],
]);

const privateHeaders = { "Cache-Control": "no-store", Pragma: "no-cache" };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    return (supplied.protocol === "https:" || supplied.protocol === "http:")
      && supplied.origin === origin
      && supplied.origin === new URL(request.url).origin;
  } catch { return false; }
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status = errorStatuses.get(message);
  return Response.json({ error: status ? message : "recovery_failed" }, {
    status: status ?? 503,
    headers: privateHeaders,
  });
}

export function createWalletRecoveryHandler(dependencies: {
  admin: () => Promise<unknown | null>;
  inspect: (privyDid: string) => Promise<unknown>;
  prepare: (privyDid: string, expectedEmail: string) => Promise<unknown>;
}) {
  return async (request: Request): Promise<Response> => {
    try {
      // Check the administrator before reading input or probing any target identity.
      if (!await dependencies.admin()) throw new Error("admin_auth_required");
      if (request.method !== "POST") {
        return Response.json({ error: "method_not_allowed" }, {
          status: 405, headers: { ...privateHeaders, Allow: "POST" },
        });
      }
      if (!sameOrigin(request)) throw new Error("invalid_origin");
      const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (mediaType !== "application/json") throw new Error("invalid_request");
      const parsed = recoveryRequest.safeParse(await request.json().catch(() => null));
      if (!parsed.success) throw new Error("invalid_request");
      const input = parsed.data;
      const result = input.operation === "inspect"
        ? await dependencies.inspect(input.privyDid)
        : await dependencies.prepare(input.privyDid, input.expectedEmail);
      return Response.json(result, { headers: privateHeaders });
    } catch (error) { return failure(error); }
  };
}
