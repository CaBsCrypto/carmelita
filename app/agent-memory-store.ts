import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { getDatabaseUrl, getDb } from "@/db";
import {
  agentDecisionEvents,
  agentKnowledgeItems,
  agentPolicies,
} from "@/db/schema";
import {
  evaluateExecutionPolicies,
  type ActionPreflight,
  type ParsedVaultCommand,
} from "@/app/agent-memory";
import {
  DEFAULT_AUTOPILOT_CONFIG,
  normalizeAutopilotConfig,
} from "@/app/agent-autopilot";
import { buildRelevantMemoryContext } from "@/app/agent-memory-retrieval";


let schemaPromise: Promise<void> | null = null;

export async function ensureAgentVaultSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const url = getDatabaseUrl();
    if (!url) throw new Error("database_not_configured");
    const sql = neon(url);
    await sql.query(`CREATE TABLE IF NOT EXISTS agent_knowledge_items (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      title text NOT NULL,
      content text NOT NULL,
      source text NOT NULL DEFAULT 'chat',
      scope text NOT NULL DEFAULT 'personal',
      sensitivity text NOT NULL DEFAULT 'standard',
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, []);
    await sql.query(`CREATE TABLE IF NOT EXISTS agent_policies (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      label text NOT NULL,
      enforcement text NOT NULL DEFAULT 'hard',
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      source text NOT NULL DEFAULT 'chat',
      status text NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`, []);
    await sql.query(`CREATE TABLE IF NOT EXISTS agent_decision_events (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
      action_type text NOT NULL,
      outcome text NOT NULL,
      reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
      explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`, []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_knowledge_user_kind_idx ON agent_knowledge_items(user_id, kind)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_knowledge_user_status_idx ON agent_knowledge_items(user_id, status)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_policies_user_kind_idx ON agent_policies(user_id, kind)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_policies_user_status_idx ON agent_policies(user_id, status)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_decisions_user_created_idx ON agent_decision_events(user_id, created_at)", []);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_decisions_outcome_idx ON agent_decision_events(outcome)", []);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function publicKnowledge(row: typeof agentKnowledgeItems.$inferSelect) {
  return {
    id: row.id,
    record: "knowledge" as const,
    kind: row.kind,
    label: row.title,
    content: row.content,
    source: row.source,
    scope: row.scope,
    sensitivity: row.sensitivity,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function publicPolicy(row: typeof agentPolicies.$inferSelect) {
  return {
    id: row.id,
    record: "policy" as const,
    kind: row.kind,
    label: row.label,
    config: row.config,
    source: row.source,
    enforcement: row.enforcement,
    sensitivity: "sensitive",
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAgentVault(userId: string) {
  await ensureAgentVaultSchema();
  const db = getDb();
  const [knowledge, policies, decisions] = await Promise.all([
    db
      .select()
      .from(agentKnowledgeItems)
      .where(eq(agentKnowledgeItems.userId, userId))
      .orderBy(desc(agentKnowledgeItems.updatedAt))
      .limit(100),
    db
      .select()
      .from(agentPolicies)
      .where(eq(agentPolicies.userId, userId))
      .orderBy(desc(agentPolicies.updatedAt))
      .limit(100),
    db
      .select()
      .from(agentDecisionEvents)
      .where(eq(agentDecisionEvents.userId, userId))
      .orderBy(desc(agentDecisionEvents.createdAt))
      .limit(20),
  ]);
  return {
    knowledge: knowledge.map(publicKnowledge),
    policies: policies.map(publicPolicy),
    decisions: decisions.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      outcome: row.outcome,
      reasonCodes: row.reasonCodes,
      explanation: row.explanation,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function retrieveRelevantAgentMemory(userId: string, query: string) {
  await ensureAgentVaultSchema();
  const db = getDb();
  const knowledge = await db
    .select({
      id: agentKnowledgeItems.id,
      kind: agentKnowledgeItems.kind,
      label: agentKnowledgeItems.title,
      content: agentKnowledgeItems.content,
      source: agentKnowledgeItems.source,
      updatedAt: agentKnowledgeItems.updatedAt,
    })
    .from(agentKnowledgeItems)
    .where(and(
      eq(agentKnowledgeItems.userId, userId),
      eq(agentKnowledgeItems.status, "active"),
    ))
    .orderBy(desc(agentKnowledgeItems.updatedAt))
    .limit(100);

  return buildRelevantMemoryContext(knowledge, query);
}

export async function saveAgentVaultCommand(
  userId: string,
  command: Extract<ParsedVaultCommand, { action: "save" }>,
) {
  await ensureAgentVaultSchema();
  const db = getDb();
  const now = new Date();
  if (command.record === "knowledge") {
    const row = {
      id: randomUUID(),
      userId,
      kind: command.kind,
      title: command.label,
      content: command.content,
      source: "chat",
      scope: "personal",
      sensitivity: command.sensitivity,
      status: command.status,
      updatedAt: now,
    };
    await db.insert(agentKnowledgeItems).values(row);
    const saved = await db
      .select()
      .from(agentKnowledgeItems)
      .where(eq(agentKnowledgeItems.id, row.id))
      .limit(1);
    return publicKnowledge(saved[0]);
  }
  const row = {
    id: randomUUID(),
    userId,
    kind: command.kind,
    label: command.label,
    enforcement: command.enforcement,
    config: { ...command.config, originalText: command.content },
    source: "chat",
    status: command.status,
    updatedAt: now,
  };
  await db.insert(agentPolicies).values(row);
  const saved = await db
    .select()
    .from(agentPolicies)
    .where(eq(agentPolicies.id, row.id))
    .limit(1);
  return publicPolicy(saved[0]);
}

const vaultMutationDependencies = { ensureSchema: ensureAgentVaultSchema, getDb };

export async function updateAgentVaultRecord(input: {
  userId: string;
  record: "knowledge" | "policy";
  id: string;
  status: "active" | "paused" | "draft";
}, dependencies = vaultMutationDependencies) {
  await dependencies.ensureSchema();
  const db = dependencies.getDb();
  const now = new Date();
  let changed: { id: string }[];
  if (input.record === "knowledge") {
    changed = await db
      .update(agentKnowledgeItems)
      .set({ status: input.status, updatedAt: now })
      .where(and(eq(agentKnowledgeItems.id, input.id), eq(agentKnowledgeItems.userId, input.userId)))
      .returning({ id: agentKnowledgeItems.id });
  } else {
    changed = await db
      .update(agentPolicies)
      .set({ status: input.status, updatedAt: now })
      .where(and(eq(agentPolicies.id, input.id), eq(agentPolicies.userId, input.userId)))
      .returning({ id: agentPolicies.id });
  }
  if (!changed.length) throw new Error("memory_record_not_found");
}

export async function deleteAgentVaultRecord(input: {
  userId: string;
  record: "knowledge" | "policy";
  id: string;
}, dependencies = vaultMutationDependencies) {
  await dependencies.ensureSchema();
  const db = dependencies.getDb();
  let deleted: { id: string }[];
  if (input.record === "knowledge") {
    deleted = await db
      .delete(agentKnowledgeItems)
      .where(and(eq(agentKnowledgeItems.id, input.id), eq(agentKnowledgeItems.userId, input.userId)))
      .returning({ id: agentKnowledgeItems.id });
  } else {
    deleted = await db
      .delete(agentPolicies)
      .where(and(eq(agentPolicies.id, input.id), eq(agentPolicies.userId, input.userId)))
      .returning({ id: agentPolicies.id });
  }
  if (!deleted.length) throw new Error("memory_record_not_found");
}

export async function evaluateUserAction(userId: string, action: ActionPreflight) {
  await ensureAgentVaultSchema();
  const db = getDb();
  const rows = await db
    .select({
      id: agentPolicies.id,
      kind: agentPolicies.kind,
      label: agentPolicies.label,
      enforcement: agentPolicies.enforcement,
      config: agentPolicies.config,
    })
    .from(agentPolicies)
    .where(and(eq(agentPolicies.userId, userId), eq(agentPolicies.status, "active")));
  let evaluatedAction = action;
  if (rows.some((row) => row.kind === "autopilot")) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [daily] = await db
      .select({ total: count() })
      .from(agentDecisionEvents)
      .where(and(
        eq(agentDecisionEvents.userId, userId),
        eq(agentDecisionEvents.outcome, "allowed"),
        gte(agentDecisionEvents.createdAt, since),
      ));
    evaluatedAction = { ...action, autopilotActionsToday: Number(daily?.total ?? 0) };
  }
  const decision = evaluateExecutionPolicies(rows, evaluatedAction);
  await db.insert(agentDecisionEvents).values({
    id: randomUUID(),
    userId,
    actionType: action.actionType,
    outcome: decision.outcome,
    reasonCodes: decision.reasonCodes,
    explanation: {
      ...evaluatedAction,
      appliedRules: decision.appliedRules,
      requiresApproval: decision.requiresApproval,
      summary: decision.summary,
    },
  });
  return decision;
}


type AutopilotUpdate =
  | {
      action: "activate";
      acknowledged: true;
      durationHours: 1 | 8 | 24;
      xlmPerAction: number;
      usdcPerAction: number;
      maxDailyActions: number;
    }
  | { action: "pause" };

function publicAutopilot(row?: typeof agentPolicies.$inferSelect) {
  if (!row) {
    return {
      status: "off" as const,
      config: DEFAULT_AUTOPILOT_CONFIG,
      signer: {
        ready: false,
        status: "manual_signature_required",
      },
    };
  }
  const config = normalizeAutopilotConfig(row.config);
  const expired =
    row.status === "active" &&
    Boolean(config.expiresAt) &&
    Date.parse(config.expiresAt!) <= Date.now();
  return {
    id: row.id,
    status: expired ? "expired" as const : row.status,
    config,
    signer: {
      ready: config.delegatedSignerReady,
      status: config.delegatedSignerReady
        ? "delegated"
        : "manual_signature_required",
    },
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getAutopilotState(userId: string) {
  await ensureAgentVaultSchema();
  const rows = await getDb()
    .select()
    .from(agentPolicies)
    .where(and(
      eq(agentPolicies.userId, userId),
      eq(agentPolicies.kind, "autopilot"),
    ))
    .orderBy(desc(agentPolicies.updatedAt))
    .limit(1);
  return publicAutopilot(rows[0]);
}

export async function updateAutopilotState(
  userId: string,
  input: AutopilotUpdate,
) {
  await ensureAgentVaultSchema();
  const db = getDb();
  const rows = await db
    .select()
    .from(agentPolicies)
    .where(and(
      eq(agentPolicies.userId, userId),
      eq(agentPolicies.kind, "autopilot"),
    ))
    .orderBy(desc(agentPolicies.updatedAt))
    .limit(1);
  const existing = rows[0];
  const now = new Date();

  if (input.action === "pause") {
    if (!existing) return publicAutopilot();
    await db
      .update(agentPolicies)
      .set({
        status: "paused",
        config: {
          ...normalizeAutopilotConfig(existing.config),
          pausedAt: now.toISOString(),
        },
        updatedAt: now,
      })
      .where(and(eq(agentPolicies.id, existing.id), eq(agentPolicies.userId, userId)));
    await db.insert(agentDecisionEvents).values({
      id: randomUUID(),
      userId,
      actionType: "autopilot.policy",
      outcome: "paused",
      reasonCodes: ["autopilot_paused_by_user"],
      explanation: { pausedAt: now.toISOString() },
    });
    return getAutopilotState(userId);
  }

  const config = {
    ...DEFAULT_AUTOPILOT_CONFIG,
    durationHours: input.durationHours,
    xlmPerAction: input.xlmPerAction,
    usdcPerAction: input.usdcPerAction,
    maxDailyActions: input.maxDailyActions,
    delegatedSignerReady: false,
    executionMode: "policy_only" as const,
    activatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + input.durationHours * 60 * 60 * 1000).toISOString(),
  };
  if (existing) {
    await db
      .update(agentPolicies)
      .set({
        label: "Testnet Autopilot",
        enforcement: "hard",
        config,
        source: "autopilot_control",
        status: "active",
        updatedAt: now,
      })
      .where(and(eq(agentPolicies.id, existing.id), eq(agentPolicies.userId, userId)));
  } else {
    await db.insert(agentPolicies).values({
      id: randomUUID(),
      userId,
      kind: "autopilot",
      label: "Testnet Autopilot",
      enforcement: "hard",
      config,
      source: "autopilot_control",
      status: "active",
      updatedAt: now,
    });
  }
  await db.insert(agentDecisionEvents).values({
    id: randomUUID(),
    userId,
    actionType: "autopilot.policy",
    outcome: "allowed",
    reasonCodes: ["autopilot_activated_by_user"],
    explanation: { ...config, summary: "Testnet Autopilot activated by the wallet owner." },
  });
  return getAutopilotState(userId);
}
