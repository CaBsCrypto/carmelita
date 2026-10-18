import type { NativeLinkIdentity } from "./native-link";

const origin = "https://bazaar.browns.studio", protocol = "2024-11-05";
const tools = ["get_bazaar_identity", "get_bazaar_capabilities", "list_market_orders"];
type Json = Record<string, unknown>;
const fail = (code: string): never => { throw new Error(code); };
function object(value: unknown): Json { return value && typeof value === "object" && !Array.isArray(value) ? value as Json : fail("bazaar_native_response_invalid"); }
/** Generic native-agent owner-link verification. Only fixed public discovery,
 * MCP handshake, identity and capabilities are available. No arbitrary tool,
 * URL, history request or financial operation can be supplied by the owner. */
export async function verifyExistingBazaarAgent(agentAccess: string, fetcher: typeof fetch): Promise<NativeLinkIdentity> {
  if (typeof window !== "undefined" || !/^[A-Za-z0-9_-]{43}$/.test(agentAccess) || typeof fetcher !== "function") fail("bazaar_native_link_input_invalid");
  const deadline = AbortSignal.timeout(45000);
  let sequence = 0, requests = 0;
  async function request(path: "/api/integration" | "/api/mcp", packet?: Json) {
    if (++requests > 6 || deadline.aborted) fail("bazaar_native_read_unconfirmed");
    const target = origin + path, signal = AbortSignal.any([deadline, AbortSignal.timeout(12000)]);
    let response: Response | undefined;
    try {
      response = await fetcher(target, { method: packet ? "POST" : "GET", headers: { Accept: packet ? "application/json, text/event-stream" : "application/json",
        ...(packet ? { "Content-Type": "application/json", "MCP-Protocol-Version": protocol, Authorization: `Bearer ${agentAccess}` } : {}) },
        ...(packet ? { body: JSON.stringify(packet) } : {}), redirect: "error", credentials: "omit", cache: "no-store", signal });
      if (response.redirected || response.url && response.url !== target || response.headers.has("location")) fail("bazaar_native_redirect_forbidden");
      if (!response.ok) fail(response.status === 401 || response.status === 403 ? "bazaar_native_access_denied" : response.status === 429 ? "bazaar_native_capacity_limited" : "bazaar_native_unavailable");
      if ((response.status === 202 || response.status === 204) && packet?.method === "notifications/initialized") return undefined;
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") || Buffer.byteLength(JSON.stringify([...response.headers])) > 8192) fail("bazaar_native_response_invalid");
      const reader = response.body?.getReader(); if (!reader) return fail("bazaar_native_response_invalid");
      const parts: Uint8Array[] = []; let count = 0;
      try { for (;;) { const part = await reader.read(); signal.throwIfAborted(); if (part.done) break; count += part.value.byteLength; if (count > 131072) fail("bazaar_native_response_too_large"); parts.push(part.value); }
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts))) as unknown;
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); parts.forEach(part => part.fill(0)); }
    } catch (error) {
      if (error instanceof Error && /^bazaar_native_[a-z_]+$/.test(error.message)) throw error;
      return fail("bazaar_native_read_unconfirmed");
    } finally { await response?.body?.cancel().catch(() => {}); }
  }
  async function rpc(method: string, params: Json) {
    const id = ++sequence, packet = object(await request("/api/mcp", { jsonrpc: "2.0", id, method, params }));
    if (packet.jsonrpc !== "2.0" || packet.id !== id || packet.error) fail("bazaar_native_rpc_invalid");
    return object(packet.result);
  }
  async function call(name: "get_bazaar_identity" | "get_bazaar_capabilities") {
    const result = await rpc("tools/call", { name, arguments: {} });
    if (result.isError || !Array.isArray(result.content) || result.content.length !== 1) fail("bazaar_native_tool_rejected");
    const part = object((result.content as unknown[])[0]);
    if (part.type !== "text" || typeof part.text !== "string" || Buffer.byteLength(part.text) > 131072) fail("bazaar_native_response_invalid");
    let value: Json; try { value = object(JSON.parse(part.text as string)); } catch { return fail("bazaar_native_response_invalid"); }
    if (value.httpStatus !== undefined && value.httpStatus !== 200) fail("bazaar_native_tool_rejected");
    if (result.structuredContent !== undefined && JSON.stringify(result.structuredContent) !== JSON.stringify(value)) fail("bazaar_native_result_conflict");
    return value;
  }
  // Validate the canonical public contract before transmitting any credential.
  const contract = object(await request("/api/integration")), endpoints = object(contract.endpoints), identityContract = object(contract.identity), transport = object(contract.transport);
  if (contract.version !== "bazaar.integration/v1" || object(endpoints.mcp).path !== "/api/mcp" || object(endpoints.catalogue).path !== "/api/market/catalog"
    || object(endpoints.orders).path !== "/api/market/orders" || transport.testedMcpProtocolVersion !== protocol || identityContract.ownerAssignedByServer !== true || identityContract.authenticatedRoleField !== "role") fail("bazaar_native_contract_mismatch");
  const initialized = await rpc("initialize", { protocolVersion: protocol, capabilities: {}, clientInfo: { name: "bazaar-native-owner-link", version: "1" } });
  if (initialized.protocolVersion !== protocol) fail("bazaar_native_protocol_mismatch");
  await request("/api/mcp", { jsonrpc: "2.0", method: "notifications/initialized" });
  const listing = await rpc("tools/list", {});
  if (!Array.isArray(listing.tools) || !tools.every(name => (listing.tools as unknown[]).some(tool => object(tool).name === name))) fail("bazaar_native_tools_missing");
  const i = await call("get_bazaar_identity");
  if (i.role !== "agent" || i.network !== "stellar:testnet" || typeof i.ownerId !== "string" || !/^ow_[a-f0-9]{32}$/.test(i.ownerId)
    || typeof i.workspaceId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(i.workspaceId)
    || typeof i.agentId !== "string" || !/^agent_[a-f0-9]{32}$/.test(i.agentId) || !Number.isSafeInteger(i.generation) || Number(i.generation) < 1
    || i.origin !== undefined && i.origin !== origin) fail("bazaar_native_identity_mismatch");
  const capabilities = await call("get_bazaar_capabilities"), features = object(capabilities.effectiveFeatures), purchases = object(features.purchases);
  if (typeof purchases.enabled !== "boolean") fail("bazaar_native_capabilities_invalid");
  return { ownerId: i.ownerId as string, workspaceId: i.workspaceId as string, agentId: i.agentId as string, generation: i.generation as number };
}
