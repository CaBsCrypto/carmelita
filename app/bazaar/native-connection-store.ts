import { createHash } from "node:crypto";
import type { BazaarBinding } from "./native-read";

export const BAZAAR_NATIVE_PROVIDER = "bazaar-native";
export type ConnectionRow = {
  id: string; userId: string; provider: string; status: string;
  accessTokenEncrypted: string; tokenExpiresAt: Date | null;
  metadata: Record<string, unknown>; updatedAt: Date;
};
export type NativeConnectionStore = ReturnType<typeof createNativeConnectionStore>;
type Dependencies = {
  // The SQL implementation includes userId+provider in its WHERE predicate.
  rowForUser(userId: string): Promise<ConnectionRow | null>;
  decrypt(ciphertext: string): Promise<string>;
  now?: () => number;
};
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const notLinked = () => { throw new Error("bazaar_native_link_required"); };
function reference(row: ConnectionRow) {
  // Rotation, even at the same native generation, invalidates the old reference.
  return "bazaar-native:" + digest(JSON.stringify([row.id, row.updatedAt.toISOString(), row.accessTokenEncrypted, row.metadata]));
}
export function createNativeConnectionStore(deps: Dependencies) {
  async function current(userId: string) {
    const row = await deps.rowForUser(userId);
    if (!row || row.userId !== userId || row.provider !== BAZAAR_NATIVE_PROVIDER || row.status !== "active"
      || row.tokenExpiresAt && row.tokenExpiresAt.getTime() <= (deps.now ?? Date.now)()) return null;
    const m = row.metadata;
    if (m.schema !== "carmelita.bazaar-native-binding/v1" || m.nativeIdentityVerified !== true
      || m.credentialRole !== "agent" || m.origin !== "https://bazaar.browns.studio"
      || m.network !== "stellar:testnet" || typeof m.ownerId !== "string" || !/^ow_[a-f0-9]{32}$/.test(m.ownerId)
      || typeof m.workspaceId !== "string" || !/^[a-f0-9-]{36}$/.test(m.workspaceId)
      || typeof m.agentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(m.agentId)
      || !Number.isSafeInteger(m.generation) || Number(m.generation) < 1
      || typeof m.verifiedAt !== "string" || !Number.isFinite(Date.parse(m.verifiedAt))
      || typeof row.accessTokenEncrypted !== "string" || !row.accessTokenEncrypted.startsWith("v1.")) return null;
    return row;
  }
  return {
    async bindingForUser(userId: string): Promise<BazaarBinding | null> {
      const row = await current(userId); if (!row) return null;
      const m = row.metadata;
      return { userId, ownerId: m.ownerId as string, workspaceId: m.workspaceId as string,
        agentId: m.agentId as string, generation: m.generation as number, agentSecretReference: reference(row) };
    },
    async agentSecretForUser(userId: string, expectedReference: string) {
      const row = await current(userId);
      if (!row || reference(row) !== expectedReference) return notLinked();
      let agentAccess: string;
      try { agentAccess = await deps.decrypt(row.accessTokenEncrypted); }
      catch { throw new Error("bazaar_native_secret_unavailable"); }
      if (!/^[A-Za-z0-9_-]{43}$/.test(agentAccess)) throw new Error("bazaar_native_secret_invalid");
      // Re-read after secret resolution to catch local rotation/revocation.
      const after = await current(userId);
      if (!after || reference(after) !== expectedReference) return notLinked();
      return { userId, ownerId: row.metadata.ownerId as string, agentAccess };
    },
  };
}

/** Existing Neon/Drizzle connector store and AES-GCM key. No new key, table,
 * schema setup, OAuth, automatic link, grant or fallback credential is created. */
export function existingBazaarConnectionStore(): NativeConnectionStore {
  return createNativeConnectionStore({
    async rowForUser(userId) {
      const [{ and, eq }, { getDb }, { agentExternalConnections }] = await Promise.all([
        import("drizzle-orm"), import("@/db"), import("@/db/schema"),
      ]);
      const [row] = await getDb().select().from(agentExternalConnections).where(and(
        eq(agentExternalConnections.userId, userId),
        eq(agentExternalConnections.provider, BAZAAR_NATIVE_PROVIDER),
      )).limit(1);
      return (row ?? null) as ConnectionRow | null;
    },
    async decrypt(ciphertext) {
      const { decryptConnectorSecret } = await import("@/app/connectors/notion-oauth");
      return decryptConnectorSecret(ciphertext);
    },
  });
}
