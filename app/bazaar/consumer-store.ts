import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentAppOperations } from "@/db/schema";
import type { BazaarOperation, BazaarOperationStore } from "./consumer-service";

function row(value: typeof agentAppOperations.$inferSelect): BazaarOperation { return { ...value, state: value.state as BazaarOperation["state"] }; }
export const bazaarOperationStore: BazaarOperationStore = {
  async insert(operation) {
    await getDb().insert(agentAppOperations).values(operation).onConflictDoNothing({ target: [agentAppOperations.userId, agentAppOperations.appId, agentAppOperations.idempotencyKey] });
    const [existing] = await getDb().select().from(agentAppOperations).where(and(eq(agentAppOperations.userId, operation.userId), eq(agentAppOperations.appId, "bazaar"), eq(agentAppOperations.idempotencyKey, operation.idempotencyKey))).limit(1);
    if (!existing) throw new Error("bazaar_operation_unavailable"); return row(existing);
  },
  async find(userId, id) {
    const [existing] = await getDb().select().from(agentAppOperations).where(and(eq(agentAppOperations.userId, userId), eq(agentAppOperations.id, id), eq(agentAppOperations.appId, "bazaar"))).limit(1);
    if (!existing) throw new Error("bazaar_operation_not_found"); return row(existing);
  },
  async update(operation, phase, state) {
    const [updated] = await getDb().update(agentAppOperations).set({ phase, state, version: operation.version + 1, updatedAt: new Date() }).where(and(eq(agentAppOperations.id, operation.id), eq(agentAppOperations.userId, operation.userId), eq(agentAppOperations.version, operation.version), eq(agentAppOperations.phase, operation.phase))).returning();
    if (!updated) throw new Error("bazaar_operation_conflict"); return row(updated);
  },
  async list(userId) { return (await getDb().select().from(agentAppOperations).where(and(eq(agentAppOperations.userId, userId), eq(agentAppOperations.appId, "bazaar"))).orderBy(desc(agentAppOperations.createdAt)).limit(20)).map(row); },
};

/** Explicit maintenance only: model-readable GETs never modify history. */
export async function pruneExpiredBazaarInputs(now = Date.now()) {
  const rows = await getDb().update(agentAppOperations).set({
    state: sql`jsonb_set((${agentAppOperations.state} - 'authorization' - 'challenge') || '{"contentExpired":true}'::jsonb, '{intent,input}', '{}'::jsonb)`,
    version: sql`${agentAppOperations.version} + 1`, updatedAt: new Date(now),
  }).where(and(eq(agentAppOperations.appId, "bazaar"), lt(agentAppOperations.createdAt, new Date(now - 7 * 24 * 60 * 60_000)), sql`(${agentAppOperations.state}->>'contentExpired') IS DISTINCT FROM 'true'`)).returning({ id: agentAppOperations.id });
  return { prunedOperations: rows.length };
}
