import { randomUUID } from "node:crypto";
import { BAZAAR_NATIVE_PROVIDER, type ConnectionRow } from "./native-connection-store";
import { verifyExistingBazaarAgent } from "./native-link-verification";

export type NativeLinkIdentity = { ownerId: string; workspaceId: string; agentId: string; generation: number };
export type NativeLinkInput = { agentAccess: string; identity?: NativeLinkIdentity };
export type VerifiedLinkWrite = {
  id: string; userId: string; provider: string; status: "active";
  accessTokenEncrypted: string; refreshTokenEncrypted: null; tokenExpiresAt: null;
  scopes: string[]; metadata: Record<string, unknown>; updatedAt: Date;
};
export type NativeLinkPersistence = {
  read(userId: string): Promise<ConnectionRow | null>;
  // Atomic insert-if-absent or compare-and-update of this exact user's row.
  commit(userId: string, before: ConnectionRow | null, value: VerifiedLinkWrite): Promise<boolean>;
};
export type NativeLinkDependencies = {
  authenticatedUserId(): Promise<string>;
  persistence: NativeLinkPersistence;
  encrypt(value: string): Promise<string> | string;
  fetcher: typeof fetch;
  now?: () => number;
};
const fail = (code: string): never => { throw new Error(code); };
const exact = (v: unknown, names: string[]): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...names].sort().join(",");
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function parseNativeLinkInput(value: unknown): NativeLinkInput {
  if (!(exact(value, ["agentAccess"]) || exact(value, ["agentAccess", "identity"])) || typeof value.agentAccess !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.agentAccess)) return fail("bazaar_native_link_input_invalid");
  if (!Object.hasOwn(value, "identity")) return { agentAccess: value.agentAccess };
  if (!exact(value.identity, ["ownerId", "workspaceId", "agentId", "generation"])) return fail("bazaar_native_link_input_invalid");
  const i = value.identity;
  if (typeof i.ownerId !== "string" || !/^ow_[a-f0-9]{32}$/.test(i.ownerId)
    || typeof i.workspaceId !== "string" || !uuid.test(i.workspaceId)
    || typeof i.agentId !== "string" || !/^agent_[a-f0-9]{32}$/.test(i.agentId)
    || !Number.isSafeInteger(i.generation) || Number(i.generation) < 1) return fail("bazaar_native_link_input_invalid");
  return { agentAccess: value.agentAccess, identity: { ownerId: i.ownerId, workspaceId: i.workspaceId, agentId: i.agentId, generation: i.generation as number } };
}
function assertExistingOwner(row: ConnectionRow | null, userId: string, identity: NativeLinkIdentity) {
  if (!row) return;
  const m = row.metadata;
  if (row.userId !== userId || row.provider !== BAZAAR_NATIVE_PROVIDER || !m || m.schema !== "carmelita.bazaar-native-binding/v1"
    || m.nativeIdentityVerified !== true || m.credentialRole !== "agent" || m.origin !== "https://bazaar.browns.studio"
    || m.network !== "stellar:testnet" || m.ownerId !== identity.ownerId || m.workspaceId !== identity.workspaceId
    || !Number.isSafeInteger(m.generation) || Number(m.generation) < 1) fail("bazaar_native_existing_owner_mismatch");
  if (identity.generation < Number(m.generation) || identity.generation === m.generation && identity.agentId !== m.agentId) fail("bazaar_native_stale_identity");
}
/** Trusted server entry point. Token possession is checked by Bazaar itself;
 * caller assertions never become a binding without native identity verification.
 * No history, order, grant, account, wallet, payment or token creation is called. */
export async function linkExistingBazaarAgent(value: unknown, deps: NativeLinkDependencies) {
  if (typeof window !== "undefined" || typeof deps.fetcher !== "function") fail("bazaar_native_server_dependencies_required");
  const userId = await deps.authenticatedUserId();
  if (typeof userId !== "string" || !userId || userId.length > 200) fail("bazaar_native_link_auth_required");
  const input = parseNativeLinkInput(value), before = await deps.persistence.read(userId);
  if (input.identity) assertExistingOwner(before, userId, input.identity);
  const identity = await verifyExistingBazaarAgent(input.agentAccess, deps.fetcher);
  if (input.identity && Object.keys(identity).some(k => identity[k as keyof NativeLinkIdentity] !== input.identity![k as keyof NativeLinkIdentity])) fail("bazaar_native_identity_mismatch");
  assertExistingOwner(before, userId, identity);
  if (await deps.authenticatedUserId() !== userId) fail("bazaar_native_link_auth_changed");
  const timestamp = (deps.now ?? Date.now)();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) fail("bazaar_native_link_clock_invalid");
  // Encrypt only after BOTH identity and capabilities have been verified.
  const encrypted = await deps.encrypt(input.agentAccess);
  if (typeof encrypted !== "string" || !/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(encrypted)) fail("bazaar_native_link_encryption_required");
  const record: VerifiedLinkWrite = {
    id: before?.id ?? randomUUID(), userId, provider: BAZAAR_NATIVE_PROVIDER, status: "active",
    accessTokenEncrypted: encrypted, refreshTokenEncrypted: null, tokenExpiresAt: null,
    scopes: ["bazaar:identity:read", "bazaar:capabilities:read", "bazaar:history:read"],
    metadata: { schema: "carmelita.bazaar-native-binding/v1", nativeIdentityVerified: true, credentialRole: "agent",
      origin: "https://bazaar.browns.studio", network: "stellar:testnet", ...identity, verifiedAt: new Date(timestamp).toISOString() },
    updatedAt: new Date(timestamp),
  };
  if (!await deps.persistence.commit(userId, before, record)) fail("bazaar_native_link_changed_retry_manually");
  return { connected: true, provider: BAZAAR_NATIVE_PROVIDER, identityVerified: true, generation: identity.generation,
    linkedAt: record.updatedAt.toISOString(), access: "read-only-adapter", financialOperations: false, purchaseAdmissionReserved: false };
}

/** Existing table and encryption; no database migration or new key. The unique
 * user/provider index handles concurrent first links. Existing links use a
 * conditional update, so an intervening revocation/rotation cannot be undone. */
export function existingNativeLinkPersistence(): NativeLinkPersistence {
  const modules = async () => {
    const [{ and, eq }, { getDb }, { agentExternalConnections }] = await Promise.all([import("drizzle-orm"), import("@/db"), import("@/db/schema")]);
    return { and, eq, db: getDb(), table: agentExternalConnections };
  };
  return {
    async read(userId) {
      const { and, eq, db, table } = await modules();
      const [row] = await db.select().from(table).where(and(eq(table.userId, userId), eq(table.provider, BAZAAR_NATIVE_PROVIDER))).limit(1);
      return row ? { ...row, metadata: { ...row.metadata } } as ConnectionRow : null;
    },
    async commit(userId, before, value) {
      if (value.userId !== userId || value.provider !== BAZAAR_NATIVE_PROVIDER || before && (before.userId !== userId || before.provider !== BAZAAR_NATIVE_PROVIDER)) fail("bazaar_native_existing_owner_mismatch");
      const { and, eq, db, table } = await modules();
      if (!before) {
        const rows = await db.insert(table).values(value).onConflictDoNothing({ target: [table.userId, table.provider] }).returning({ id: table.id });
        return rows.length === 1;
      }
      const changes: Partial<VerifiedLinkWrite> = { ...value };
      delete changes.id;
      delete changes.userId;
      delete changes.provider;
      const rows = await db.update(table).set(changes).where(and(eq(table.id, before.id), eq(table.userId, userId),
        eq(table.provider, BAZAAR_NATIVE_PROVIDER), eq(table.status, before.status), eq(table.updatedAt, before.updatedAt),
        eq(table.accessTokenEncrypted, before.accessTokenEncrypted), eq(table.metadata, before.metadata))).returning({ id: table.id });
      return rows.length === 1;
    },
  };
}
