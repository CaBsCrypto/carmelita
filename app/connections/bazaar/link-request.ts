import { sessionAbortable, withSessionDeadline } from "@/app/agent/session-request";

const origin = "https://carmelita.browns.studio";
const path = "/api/connections/bazaar-native/link";
export type LinkOutcome = "connected" | "invalid-token" | "sign-in" | "owner-mismatch" | "capacity" | "unconfirmed" | "origin";
type Dependencies = { pageOrigin: string; getAccessToken(): Promise<string | null>; signal: AbortSignal; fetcher?: typeof fetch };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
async function readResponse(response: Response, signal: AbortSignal) {
  if (!/^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") || new TextEncoder().encode(JSON.stringify([...response.headers])).byteLength > 8192) throw Error();
  const reader = response.body?.getReader(); if (!reader) throw Error();
  const parts: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) { const part = await sessionAbortable(() => reader.read(), signal); if (part.done) break; bytes += part.value.byteLength; if (bytes > 8192) throw Error(); parts.push(part.value); }
    const joined = new Uint8Array(bytes); let offset = 0;
    try { for (const part of parts) { joined.set(part, offset); offset += part.byteLength; } return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined)) as unknown; }
    finally { joined.fill(0); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); parts.forEach(part => part.fill(0)); }
}
/** Exactly one private request. Secrets are ephemeral inputs, never returned,
 * logged, retried, written to storage or placed in a URL. */
export async function requestExistingBazaarLink(agentAccess: string, deps: Dependencies): Promise<LinkOutcome> {
  if (deps.pageOrigin !== origin) return "origin";
  if (!/^[A-Za-z0-9_-]{43}$/.test(agentAccess)) return "invalid-token";
  try {
    return await withSessionDeadline(deps.signal, 60000, async signal => {
      const sessionAccess = await sessionAbortable(deps.getAccessToken, signal);
      if (!sessionAccess) return "sign-in";
      const response = await sessionAbortable(() => (deps.fetcher ?? fetch)(path, { method: "POST", headers: { Authorization: `Bearer ${sessionAccess}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ agentAccess }), redirect: "error", credentials: "omit", cache: "no-store", signal }), signal);
      if (response.redirected || response.url && response.url !== origin + path || response.headers.has("location")) return "unconfirmed";
      if (response.status === 401) return "sign-in";
      const value = await sessionAbortable(() => readResponse(response, signal), signal);
      if (!object(value)) return "unconfirmed";
      if (response.ok) {
        const fields = ["connected", "provider", "identityVerified", "generation", "linkedAt", "access", "financialOperations", "purchaseAdmissionReserved"];
        return Object.keys(value).sort().join(",") === fields.sort().join(",") && value.connected === true && value.provider === "bazaar-native" && value.identityVerified === true
          && Number.isSafeInteger(value.generation) && Number(value.generation) > 0 && typeof value.linkedAt === "string" && Number.isFinite(Date.parse(value.linkedAt))
          && value.access === "read-only-adapter" && value.financialOperations === false && value.purchaseAdmissionReserved === false ? "connected" : "unconfirmed";
      }
      if (response.status === 429) return "capacity";
      if (["bazaar_native_existing_owner_mismatch", "bazaar_native_stale_identity"].includes(String(value.error))) return "owner-mismatch";
      if (["bazaar_native_identity_mismatch", "bazaar_native_access_denied", "bazaar_native_link_input_invalid"].includes(String(value.error))) return "invalid-token";
      return "unconfirmed";
    });
  } catch { return "unconfirmed"; }
  finally { agentAccess = ""; }
}
