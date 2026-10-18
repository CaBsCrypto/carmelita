import { existingNativeLinkPersistence, linkExistingBazaarAgent } from "./native-link";

const origin = "https://carmelita.browns.studio";
const path = "/api/connections/bazaar-native/link";
const codes = new Set(["bazaar_native_link_auth_required", "bazaar_native_link_input_invalid", "bazaar_native_existing_owner_mismatch",
  "bazaar_native_stale_identity", "bazaar_native_link_changed_retry_manually", "bazaar_native_link_auth_changed",
  "bazaar_native_link_encryption_required", "bazaar_native_link_clock_invalid", "bazaar_native_contract_mismatch",
  "bazaar_native_identity_mismatch", "bazaar_native_capabilities_invalid", "bazaar_native_access_denied", "bazaar_native_capacity_limited",
  "bazaar_native_unavailable", "bazaar_native_read_unconfirmed", "bazaar_native_rpc_invalid", "bazaar_native_tools_missing",
  "bazaar_native_protocol_mismatch", "bazaar_native_redirect_forbidden", "bazaar_native_response_invalid", "bazaar_native_response_too_large",
  "bazaar_native_tool_rejected", "bazaar_native_result_conflict", "bazaar_native_binding_changed"]);
type HandlerDependencies = {
  verifyUser(accessToken: string): Promise<string>;
  link(userId: string, input: unknown): Promise<unknown>;
};
const defaults: HandlerDependencies = {
  async verifyUser(accessToken) {
    const { verifyPrivyAccessToken } = await import("@/app/privy-stellar");
    const claims = await verifyPrivyAccessToken(accessToken);
    return claims.user_id;
  },
  async link(userId, input) {
    const { encryptConnectorSecret } = await import("@/app/connectors/notion-oauth");
    return linkExistingBazaarAgent(input, { authenticatedUserId: async () => userId,
      persistence: existingNativeLinkPersistence(), encrypt: encryptConnectorSecret, fetcher: globalThis.fetch });
  },
};
function response(value: unknown, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } }); }
async function body(request: Request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "") || !request.body
    || request.headers.has("content-encoding")) throw Error("bazaar_native_link_input_invalid");
  const announced = request.headers.get("content-length");
  if (announced && (!/^\d+$/.test(announced) || Number(announced) > 4096)) throw Error("bazaar_native_link_input_invalid");
  const reader = request.body.getReader(), parts: Uint8Array[] = []; let bytes = 0;
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 10000);
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 4096) throw Error("bazaar_native_link_input_invalid"); parts.push(part.value); }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
  } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); parts.forEach(part => part.fill(0)); }
}
/** Credential-bearing operation is intentionally a web-owner action, never an
 * MCP tool argument or URL. Dependencies are server-only test seams. */
export function createBazaarNativeLinkHandler(deps: HandlerDependencies = defaults) {
  return async (request: Request) => {
    let url: URL;
    try { url = new URL(request.url); } catch { return response({ error: "invalid_request" }, 400); }
    if (request.method !== "POST" || url.origin !== origin || url.pathname !== path || url.search || url.hash
      || request.headers.get("origin") !== origin) return response({ error: "invalid_origin_or_target" }, 403);
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9._~-]{1,4096}$/.test(authorization)) return response({ error: "bazaar_native_link_auth_required" }, 401);
    let userId: string;
    try { userId = await deps.verifyUser(authorization.slice(7)); if (!userId || userId.length > 200) throw Error(); }
    catch { return response({ error: "bazaar_native_link_auth_required" }, 401); }
    let input: unknown;
    try { input = await body(request); } catch { return response({ error: "bazaar_native_link_input_invalid" }, 400); }
    try { return response(await deps.link(userId, input)); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = codes.has(message) ? message : "bazaar_native_link_unconfirmed";
      const status = code === "bazaar_native_link_input_invalid" ? 400
        : ["bazaar_native_existing_owner_mismatch", "bazaar_native_stale_identity", "bazaar_native_link_changed_retry_manually"].includes(code) ? 409
        : code === "bazaar_native_access_denied" ? 422 : code === "bazaar_native_capacity_limited" ? 429 : 503;
      // A database acknowledgement can be lost after a successful write. Never
      // claim that no link exists or automatically replay an uncertain commit.
      return response({ error: code, connectionState: "unconfirmed", automaticRetry: false }, status);
    }
  };
}
