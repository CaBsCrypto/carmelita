import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agentActivities, agentConversations, agentDecisionEvents, agentKnowledgeItems, agentMessages, agentPolicies } from "@/db/schema";
import type { StoredAgentMessage } from "@/app/agent-chat-store";
import { DEFAULT_AUTOPILOT_CONFIG, normalizeAutopilotConfig } from "@/app/agent-autopilot";

type ReadDatabase = ReturnType<typeof getDb>;

// None of these readers provision a schema, a conversation or an account.
// Existing write/onboarding paths remain responsible for that preparation.
function safeDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDetails);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) =>
    !/(?:access.?token|refresh.?token|secret|password|credential|authorization|signed.?xdr|prepared.?xdr|signature|private.?key)/i.test(key)
    && !/^(?:token|api.?key|cookie|set.cookie|session.?token|bearer|signed.?transaction)$/i.test(key),
  ).map(([key, item]) => [key, safeDetails(item)]));
}

/** Retains the existing conversation wire fields, with no unrecognized metadata. */
function publicReadMessage(row: {
  id: string; role: string; content: string; metadata: Record<string, unknown>; createdAt: Date;
}): StoredAgentMessage {
  const metadata = safeDetails(row.metadata ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    actions: Array.isArray(metadata.actions) ? metadata.actions as StoredAgentMessage["actions"] : undefined,
    connection: metadata.connection && typeof metadata.connection === "object" ? metadata.connection as StoredAgentMessage["connection"] : undefined,
    defindexIntent: metadata.defindexIntent && typeof metadata.defindexIntent === "object" ? metadata.defindexIntent as StoredAgentMessage["defindexIntent"] : undefined,
    x402Intent: metadata.x402Intent && typeof metadata.x402Intent === "object" ? metadata.x402Intent as StoredAgentMessage["x402Intent"] : undefined,
    soroswapIntent: metadata.soroswapIntent && typeof metadata.soroswapIntent === "object" ? metadata.soroswapIntent as StoredAgentMessage["soroswapIntent"] : undefined,
    memoryUpdated: metadata.memoryUpdated === true,
    memoryContext: metadata.memoryContext && typeof metadata.memoryContext === "object" ? metadata.memoryContext as StoredAgentMessage["memoryContext"] : undefined,
    decision: metadata.decision && typeof metadata.decision === "object" ? metadata.decision as StoredAgentMessage["decision"] : undefined,
    workflow: metadata.workflow && typeof metadata.workflow === "object" ? metadata.workflow as StoredAgentMessage["workflow"] : undefined,
  };
}

export async function readAgentConversation(userId: string, db: ReadDatabase = getDb()) {
  const expectedId = "conv_" + createHash("sha256").update(userId).digest("hex").slice(0, 32);
  const [conversation] = await db.select({ id: agentConversations.id }).from(agentConversations)
    .where(and(eq(agentConversations.userId, userId), eq(agentConversations.id, expectedId))).limit(1);
  if (!conversation) return { conversationId: null, messages: [] as StoredAgentMessage[] };
  const messages = await db.select({
    id: agentMessages.id, role: agentMessages.role, content: agentMessages.content,
    metadata: agentMessages.metadata, createdAt: agentMessages.createdAt,
  }).from(agentMessages)
    .where(and(eq(agentMessages.userId, userId), eq(agentMessages.conversationId, conversation.id)))
    .orderBy(desc(agentMessages.createdAt)).limit(80);
  // Bound the newest history window, then preserve the chronological wire order.
  return { conversationId: conversation.id, messages: messages.reverse().map(publicReadMessage) };
}

export async function readAgentVault(userId: string, db: ReadDatabase = getDb()) {
  const [knowledge, policies, decisions] = await Promise.all([
    db.select({
      id: agentKnowledgeItems.id, kind: agentKnowledgeItems.kind, title: agentKnowledgeItems.title,
      content: agentKnowledgeItems.content, source: agentKnowledgeItems.source, scope: agentKnowledgeItems.scope,
      sensitivity: agentKnowledgeItems.sensitivity, status: agentKnowledgeItems.status,
      createdAt: agentKnowledgeItems.createdAt, updatedAt: agentKnowledgeItems.updatedAt,
    }).from(agentKnowledgeItems).where(eq(agentKnowledgeItems.userId, userId))
      .orderBy(desc(agentKnowledgeItems.updatedAt)).limit(100),
    db.select({
      id: agentPolicies.id, kind: agentPolicies.kind, label: agentPolicies.label, config: agentPolicies.config,
      source: agentPolicies.source, enforcement: agentPolicies.enforcement, status: agentPolicies.status,
      createdAt: agentPolicies.createdAt, updatedAt: agentPolicies.updatedAt,
    }).from(agentPolicies).where(eq(agentPolicies.userId, userId))
      .orderBy(desc(agentPolicies.updatedAt)).limit(100),
    db.select({
      id: agentDecisionEvents.id, actionType: agentDecisionEvents.actionType, outcome: agentDecisionEvents.outcome,
      reasonCodes: agentDecisionEvents.reasonCodes, explanation: agentDecisionEvents.explanation,
      createdAt: agentDecisionEvents.createdAt,
    }).from(agentDecisionEvents).where(eq(agentDecisionEvents.userId, userId))
      .orderBy(desc(agentDecisionEvents.createdAt)).limit(20),
  ]);
  return {
    knowledge: knowledge.map(({ title, createdAt, updatedAt, ...row }) => ({
      ...row, record: "knowledge" as const, label: title,
      createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    })),
    policies: policies.map(({ config, createdAt, updatedAt, ...row }) => ({
      ...row, record: "policy" as const, sensitivity: "sensitive", config: safeDetails(config),
      createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString(),
    })),
    decisions: decisions.map(({ explanation, createdAt, ...row }) => ({
      ...row, explanation: safeDetails(explanation), createdAt: createdAt.toISOString(),
    })),
  };
}

export async function readAgentActivity(userId: string, limit = 20, db: ReadDatabase = getDb()) {
  const boundedLimit = Math.min(50, Math.max(1, Math.trunc(limit)));
  const rows = await db.select({
    id: agentActivities.id, eventType: agentActivities.eventType,
    summary: agentActivities.summary, createdAt: agentActivities.createdAt,
  }).from(agentActivities).where(eq(agentActivities.userId, userId))
    .orderBy(desc(agentActivities.createdAt)).limit(boundedLimit);
  return rows.map(({ createdAt, ...row }) => ({ ...row, createdAt: createdAt.toISOString() }));
}

/** Read the recorded policy state. This is not a signer preflight or authorization. */
export async function readAgentAutopilot(userId: string, db: ReadDatabase = getDb(), now = Date.now()) {
  const [row] = await db.select({
    id: agentPolicies.id, status: agentPolicies.status, config: agentPolicies.config, updatedAt: agentPolicies.updatedAt,
  }).from(agentPolicies).where(and(eq(agentPolicies.userId, userId), eq(agentPolicies.kind, "autopilot")))
    .orderBy(desc(agentPolicies.updatedAt)).limit(1);
  if (!row) return {
    status: "off" as const,
    config: DEFAULT_AUTOPILOT_CONFIG,
    signer: { ready: false, status: "manual_signature_required" },
  };
  const config = normalizeAutopilotConfig(row.config);
  const expired = row.status === "active" && Boolean(config.expiresAt) && Date.parse(config.expiresAt!) <= now;
  return {
    id: row.id, status: expired ? "expired" as const : row.status, config,
    signer: { ready: config.delegatedSignerReady, status: config.delegatedSignerReady ? "delegated" : "manual_signature_required" },
    updatedAt: row.updatedAt.toISOString(),
  };
}
