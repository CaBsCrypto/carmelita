import { createHash } from "node:crypto";
import { z } from "zod";
import type { AppDefinition, BazaarGrant, BazaarProvisioner } from "./types";

export const BAZAAR_APP_ORIGIN = "https://bazaar.browns.studio";
export const BAZAAR_CLIENT_SCOPES = {
  "carmelita-web": ["catalog:read", "orders:create", "orders:read", "deliveries:read", "payments:challenge", "payments:submit"],
  "carmelita-chatgpt": ["catalog:read", "orders:read", "deliveries:read"],
} as const;
const profile = { id: "bazaar", name: "Bazaar", version: "1", adapter: "bazaar-v1",
  description: "Add the reviewed Bazaar connection to your own Carmelita account. ChatGPT can read your results; purchases require separate approval on the web.",
  permissions: ["catalog:read", "consumption:read"], origin: BAZAAR_APP_ORIGIN, consumerVersion: 1,
  clientScopes: BAZAAR_CLIENT_SCOPES } as const;
export const BAZAAR_PROFILE_HASH = createHash("sha256").update(JSON.stringify(profile)).digest("hex");
export function registeredBazaarDefinition(): AppDefinition {
  return { id: "bazaar", name: profile.name, version: profile.version, adapter: profile.adapter,
    description: profile.description, permissions: [...profile.permissions], definitionHash: BAZAAR_PROFILE_HASH,
    approval: "awaiting_review", approvalRevision: 0, evidence: null };
}
const identitySchema = z.object({ ownerId: z.string().min(1).max(200), workspaceId: z.string().uuid(),
  agentId: z.string().min(1).max(200), generation: z.number().int().positive() });
const grantSchema = z.object({ clientId: z.enum(["carmelita-web", "carmelita-chatgpt"]), grantId: z.string().uuid(),
  revision: z.number().int().positive(), scopes: z.array(z.string().max(100)).max(10), revoked: z.boolean() });
const receiptSchema = z.object({ version: z.literal(1), identity: identitySchema, grants: z.array(grantSchema).length(2) });
const lookupSchema = z.object({ version: z.literal(1), identity: identitySchema, grants: z.array(grantSchema).max(2),
  enrollment: z.enum(["pending", "active"]).optional() });
const managementSchema = z.object({ version: z.literal(1), identity: identitySchema, grant: grantSchema });
function validateGrant(grant: BazaarGrant) {
  const expected = BAZAAR_CLIENT_SCOPES[grant.clientId];
  if (grant.scopes.length !== expected.length || new Set(grant.scopes).size !== expected.length ||
    grant.scopes.some(scope => !(expected as readonly string[]).includes(scope))) throw new Error("app_bazaar_scope_invalid");
  return grant;
}
export function validateBazaarGrants(grants: BazaarGrant[]) {
  if (grants.length !== 2 || new Set(grants.map(grant => grant.clientId)).size !== 2) throw new Error("app_bazaar_scope_invalid");
  return grants.map(validateGrant);
}

/** Fixed reviewed ingress. Metadata and arbitrary MCP server URLs never select targets. */
export function createBazaarProvisioner(options: { fetcher?: typeof fetch; enabled?: () => boolean; timeoutMs?: number } = {}): BazaarProvisioner {
  async function request(path: string, credential: string, body?: unknown, absentAllowed = false) {
    if (!(options.enabled?.() ?? process.env.CARMELITA_BAZAAR_APPS_ENABLED === "true")) throw new Error("app_bazaar_disabled");
    if (!/^[A-Za-z0-9_-]{43}$/.test(credential)) throw new Error("app_bazaar_credential_invalid");
    const controller = new AbortController(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, response: Response | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new Error("app_bazaar_timeout"));
    }, Math.max(1, Math.min(options.timeoutMs ?? 15_000, 15_000))); });
    try {
      const operation = (async () => {
        response = await (options.fetcher ?? fetch)(new URL(path, BAZAAR_APP_ORIGIN), {
          method: body === undefined ? "GET" : "POST", headers: { Accept: "application/json", Authorization: `Bearer ${credential}`,
            ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
        });
        if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw new Error("app_bazaar_timeout"); }
        if (response.status === 404 && absentAllowed) { void response.body?.cancel().catch(() => {}); return null; }
        if (response.status === 401) throw new Error("app_bazaar_not_authorized");
        if (!response.ok) throw new Error("app_bazaar_unavailable");
        if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new Error("app_bazaar_response_invalid");
        if (Number(response.headers.get("content-length")) > 32_768) throw new Error("app_bazaar_response_invalid");
        if (response.url && new URL(response.url).origin !== BAZAAR_APP_ORIGIN) throw new Error("app_bazaar_response_invalid");
        reader = response.body?.getReader(); if (!reader) throw new Error("app_bazaar_response_invalid");
        const chunks: Uint8Array[] = []; let size = 0;
        for (;;) { const result = await reader.read(); controller.signal.throwIfAborted(); if (result.done) break;
          size += result.value.byteLength; if (size > 32_768) throw new Error("app_bazaar_response_invalid"); chunks.push(result.value); }
        try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw new Error("app_bazaar_response_invalid"); }
      })();
      return await Promise.race([operation, deadline]);
    } finally {
      if (timer) clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {});
      else if (response?.body) void response.body.cancel().catch(() => {});
    }
  }
  function receipt(value: unknown) {
    const parsed = receiptSchema.safeParse(value); if (!parsed.success) throw new Error("app_bazaar_response_invalid");
    return { ...parsed.data.identity, grants: validateBazaarGrants(parsed.data.grants) };
  }
  function recoveryReceipt(value: unknown) {
    const parsed = lookupSchema.safeParse(value); if (!parsed.success) throw new Error("app_bazaar_response_invalid");
    if (parsed.data.grants.length === 0 && parsed.data.enrollment === "pending") return { ...parsed.data.identity, grants: [] };
    return { ...parsed.data.identity, grants: validateBazaarGrants(parsed.data.grants) };
  }
  async function manage(path: string, input: { recoveryCredential: string; workspaceId: string; clientId: BazaarGrant["clientId"]; changeId: string; expectedRevision: number; accessHash?: string }) {
    const { recoveryCredential, ...body } = input;
    const parsed = managementSchema.safeParse(await request(path, recoveryCredential, { version: 1, ...body }));
    if (!parsed.success || parsed.data.identity.workspaceId !== input.workspaceId || parsed.data.grant.clientId !== input.clientId) throw new Error("app_bazaar_response_invalid");
    return validateGrant(parsed.data.grant);
  }
  return {
    async enroll(intent) {
      const value = await request("/api/consumer/enroll", intent.recoveryCredential, {
        version: 1, creationId: intent.creationId, webAccessHash: createHash("sha256").update(intent.webCredential).digest("hex"),
        readAccessHash: createHash("sha256").update(intent.readCredential).digest("hex"),
      });
      if (!z.object({ identity: z.object({ creationId: z.literal(intent.creationId) }) }).safeParse(value).success) throw new Error("app_bazaar_owner_mismatch");
      return receipt(value);
    },
    async lookup({ recoveryCredential, creationId }) {
      const value = await request(`/api/consumer/enrollment?creationId=${encodeURIComponent(creationId)}`, recoveryCredential, undefined, true);
      if (value === null) return null;
      if (!z.object({ identity: z.object({ creationId: z.literal(creationId) }) }).safeParse(value).success) throw new Error("app_bazaar_owner_mismatch");
      return recoveryReceipt(value);
    },
    async status({ recoveryCredential, workspaceId }) {
      const result = recoveryReceipt(await request(`/api/consumer/grants/status?workspaceId=${encodeURIComponent(workspaceId)}`, recoveryCredential));
      if (result.workspaceId !== workspaceId) throw new Error("app_bazaar_owner_mismatch"); return result;
    },
    revoke: input => manage("/api/consumer/grants/revoke", input),
    rotate: input => manage("/api/consumer/grants/rotate", input),
    async identity({ credential, channel }) {
      const parsed = managementSchema.safeParse(await request("/api/consumer/identity", credential));
      if (!parsed.success || parsed.data.grant.clientId !== (channel === "web" ? "carmelita-web" : "carmelita-chatgpt")) throw new Error("app_bazaar_response_invalid");
      return { ...parsed.data.identity, grant: validateGrant(parsed.data.grant) };
    },
  };
}
