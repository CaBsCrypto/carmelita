import { sessionAbortable, withSessionDeadline } from "@/app/agent/session-request";
import type { WorkspaceCatalog, WorkspaceHistory, WorkspaceIdentity, WorkspaceReview, WorkspaceReadInput } from "@/app/bazaar/workspace-read-web";
export type WorkspaceValues = {catalog: WorkspaceCatalog; history: WorkspaceHistory; identity: WorkspaceIdentity; review: WorkspaceReview};
type Action = WorkspaceReadInput["action"];
const path = "/api/connections/bazaar-native/read", origin = "https://carmelita.browns.studio";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const errors = new Set(["authentication_required", "bazaar_native_link_required", "bazaar_native_capacity_limited", "bazaar_native_card_changed", "bazaar_native_commission_disabled"]);
function valid(action: Action, value: unknown): boolean {
  if (!object(value) || value.readOnly !== true) return false;
  if (action === "identity") return value.identityVerified === true && value.role === "agent" && Number.isSafeInteger(value.generation) && value.adapterFinancialOperations === false;
  if (action === "catalog") return Array.isArray(value.services) && value.services.length <= 5 && value.services.every(v => object(v) && ["id", "name", "description", "provider", "cardHash"].every(k => typeof v[k] === "string")) && typeof value.partialResults === "boolean" && typeof value.paused === "boolean" && (value.nextCursor === null || typeof value.nextCursor === "string");
  if (action === "history") return Array.isArray(value.orders) && value.orders.length <= 1 && value.orders.every(v => object(v) && ["operationId", "serviceId", "perspective", "phase"].every(k => typeof v[k] === "string") && typeof v.paymentVerifiedByBazaar === "boolean" && typeof v.delivered === "boolean") && typeof value.partialResults === "boolean" && (value.nextCursor === null || object(value.nextCursor) && typeof value.nextCursor.ownerId === "string" && Number.isSafeInteger(value.nextCursor.generation) && typeof value.nextCursor.value === "string") && value.independentlyVerifiedChainPayment === false;
  return value.protocol === "x402-stellar-exact-v2" && value.network === "stellar:testnet" && value.asset === "USDC" && value.feeBps === 0 && value.feeAtoms === "0" && value.commissionEnabled === false && value.orderCreated === false && value.signatureRequested === false && value.paymentSubmitted === false && value.purchaseAuthorized === false && value.budgetVerified === false && value.capacityReserved === false && ["serviceId", "name", "recipient", "cardHash", "amount"].every(k => typeof value[k] === "string");
}
/** One manual read; no retries, local persistence, order IDs or wallet SDK. */
export async function requestWorkspaceRead<A extends Action>(input: Extract<WorkspaceReadInput, {action: A}>, deps: {pageOrigin: string; getAccessToken(): Promise<string | null>; signal: AbortSignal; fetcher?: typeof fetch}): Promise<WorkspaceValues[A]> {
  if (deps.pageOrigin !== origin) throw Error("bazaar_native_read_unconfirmed");
  return withSessionDeadline(deps.signal, 110000, async signal => {
    const token = await sessionAbortable(deps.getAccessToken, signal);
    if (!token) throw Error("authentication_required");
    const response = await sessionAbortable(() => (deps.fetcher ?? fetch)(path, {method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json"}, body: JSON.stringify(input), redirect: "error", credentials: "omit", cache: "no-store", signal}), signal);
    if (response.redirected || response.headers.has("location") || response.url && response.url !== origin + path || !/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "")) throw Error("bazaar_native_read_unconfirmed");
    if (response.status === 401) throw Error("authentication_required");
    const reader = response.body?.getReader(); if (!reader) throw Error("bazaar_native_read_unconfirmed");
    const chunks: Uint8Array[] = []; let bytes = 0, result: unknown;
    try {
      for (;;) { const part = await sessionAbortable(() => reader.read(), signal); if (part.done) break; bytes += part.value.byteLength; if (bytes > 131072) throw Error("bazaar_native_read_unconfirmed"); chunks.push(part.value); }
      const joined = new Uint8Array(bytes); let offset = 0;
      try { for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; } result = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(joined)); }
      finally { joined.fill(0); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); chunks.forEach(c => c.fill(0)); }
    if (!response.ok) throw Error(object(result) && errors.has(String(result.error)) ? String(result.error) : "bazaar_native_read_unconfirmed");
    if (!object(result) || result.action !== input.action || !valid(input.action, result.value)) throw Error("bazaar_native_read_unconfirmed");
    return result.value as WorkspaceValues[A];
  });
}
