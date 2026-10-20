import { z } from "zod";
import { createBazaarWorkspaceReadAdapter, type NativeReadDependencies } from "./workspace-read-adapter";
import { existingBazaarConnectionStore } from "./native-connection-store";

export const WORKSPACE_READ_PATH = "/api/connections/bazaar-native/read";
const origin = "https://carmelita.browns.studio";
const cursor = z.object({ownerId: z.string().regex(/^ow_[a-f0-9]{32}$/), generation: z.number().int().positive(), value: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/)}).strict();
const inputSchema = z.discriminatedUnion("action", [
  z.object({action: z.literal("identity")}).strict(),
  z.object({action: z.literal("catalog"), cursor: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional()}).strict(),
  z.object({action: z.literal("history"), cursor: cursor.optional()}).strict(),
  z.object({action: z.literal("review"), serviceId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), cardHash: z.string().regex(/^[a-f0-9]{64}$/), catalogCursor: z.string().regex(/^[A-Za-z0-9_-]{1,512}$/).optional()}).strict(),
]);
export type WorkspaceReadInput = z.infer<typeof inputSchema>;
type Adapter = ReturnType<typeof createBazaarWorkspaceReadAdapter>;
export type WorkspaceCatalog = Awaited<ReturnType<Adapter["catalog"]>>;
export type WorkspaceHistory = Awaited<ReturnType<Adapter["history"]>>;
export type WorkspaceReview = Awaited<ReturnType<Adapter["review"]>>;
export type WorkspaceIdentity = Awaited<ReturnType<Adapter["preflight"]>>;
type Dependencies = {verifyUser(token: string): Promise<string>; adapter(userId: string): NativeReadDependencies};
const defaults: Dependencies = {
  async verifyUser(token) { const {verifyPrivyAccessToken} = await import("@/app/privy-stellar"); return (await verifyPrivyAccessToken(token)).user_id; },
  adapter(userId) { const store = existingBazaarConnectionStore(); return {authenticatedUserId: async () => userId, bindingForUser: store.bindingForUser, agentSecretForUser: store.agentSecretForUser, fetcher: globalThis.fetch}; },
};
function reply(value: unknown, status = 200) { return Response.json(value, {status, headers: {"Cache-Control": "no-store", "Pragma": "no-cache", "Vary": "Authorization, Origin", "X-Content-Type-Options": "nosniff"}}); }
const exposed = new Set(["bazaar_native_link_required", "bazaar_native_access_denied", "bazaar_native_capacity_limited", "bazaar_native_cursor_owner_mismatch", "bazaar_native_binding_changed", "bazaar_native_identity_mismatch", "bazaar_native_card_changed", "bazaar_native_commission_disabled", "bazaar_native_review_unsupported", "bazaar_native_review_unavailable"]);
/** Web-session reads only. No order, wallet, budget, capacity or payment APIs.
 * POST keeps private history cursors out of URLs and accepts a closed action set. */
export function createWorkspaceReadHandler(deps: Dependencies = defaults) {
  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.origin !== origin || url.pathname !== WORKSPACE_READ_PATH || url.search || url.hash || request.headers.get("origin") !== origin) return reply({error: "invalid_origin_or_target"}, 403);
    const bearer = request.headers.get("authorization") ?? "";
    if (!/^Bearer [A-Za-z0-9._~-]{1,4096}$/.test(bearer)) return reply({error: "authentication_required"}, 401);
    let userId: string;
    try { userId = await deps.verifyUser(bearer.slice(7)); if (!userId || userId.length > 200) throw Error(); }
    catch { return reply({error: "authentication_required"}, 401); }
    let input: WorkspaceReadInput;
    try {
      if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "") || request.headers.has("content-encoding") || !request.body) throw Error();
      const length = request.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > 2048)) throw Error();
      const reader = request.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0, expired = false;
      const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 10000);
      try {
        for (;;) { const part = await reader.read(); if (expired) throw Error(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 2048) throw Error(); chunks.push(part.value); }
        input = inputSchema.parse(JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks))));
      } finally { clearTimeout(timer); await reader.cancel().catch(() => {}); reader.releaseLock(); chunks.forEach(c => c.fill(0)); }
    } catch { return reply({error: "invalid_read_input"}, 400); }
    try {
      const adapter = createBazaarWorkspaceReadAdapter({...deps.adapter(userId), signal: request.signal});
      const value = input.action === "identity" ? await adapter.preflight()
        : input.action === "catalog" ? await adapter.catalog({limit: 5, ...(input.cursor ? {cursor: input.cursor} : {})})
        : input.action === "history" ? await adapter.history({limit: 1, ...(input.cursor ? {cursor: input.cursor} : {})})
        : await adapter.review({serviceId: input.serviceId, cardHash: input.cardHash, ...(input.catalogCursor ? {catalogCursor: input.catalogCursor} : {})});
      return reply({action: input.action, value});
    } catch (error) {
      const code = error instanceof Error && exposed.has(error.message) ? error.message : "bazaar_native_read_unconfirmed";
      return reply({error: code, automaticRetry: false}, code === "bazaar_native_capacity_limited" ? 429 : 503);
    }
  };
}
