import { and, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/db";
import {
  agentGatewayPlans,
  agentGatewayReceipts,
} from "@/db/schema";
import type { GatewayPlan, GatewayReceipt } from "@/app/agent-gateway/types";
import { getGatewayCapability } from "@/app/agent-gateway/catalog";

export type GatewayPlanClaim = {
  plan: GatewayPlan;
  replayed: boolean;
};

export interface GatewayStore {
  claimPlan(plan: GatewayPlan): Promise<GatewayPlanClaim>;
  getPlan(actorId: string, id: string): Promise<GatewayPlan | undefined>;
  getReceipt(actorId: string, planId: string): Promise<GatewayReceipt | undefined>;
  saveVerifiedReceipt(receipt: GatewayReceipt): Promise<void>;
}

function assertSameRequest(existing: GatewayPlan, candidate: GatewayPlan) {
  if (existing.requestFingerprint !== candidate.requestFingerprint) {
    throw new Error("gateway_idempotency_conflict");
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertReceiptMatchesPlan(plan: GatewayPlan | undefined, receipt: GatewayReceipt) {
  const expectedNetwork = plan
    ? getGatewayCapability(plan.capabilityId).network
    : undefined;
  if (
    !plan ||
    plan.actorId !== receipt.actorId ||
    plan.capabilityId !== receipt.capabilityId ||
    expectedNetwork !== receipt.network
  ) {
    throw new Error("gateway_receipt_plan_mismatch");
  }
}

function assertSameReceipt(existing: GatewayReceipt, candidate: GatewayReceipt) {
  if (
    existing.id !== candidate.id ||
    existing.actorId !== candidate.actorId ||
    existing.capabilityId !== candidate.capabilityId ||
    existing.network !== candidate.network ||
    existing.status !== candidate.status ||
    existing.transactionHash !== candidate.transactionHash ||
    stable(existing.evidence) !== stable(candidate.evidence)
  ) {
    throw new Error("gateway_receipt_conflict");
  }
}

export class InMemoryGatewayStore implements GatewayStore {
  private readonly plans = new Map<string, GatewayPlan>();
  private readonly planKeys = new Map<string, string>();
  private readonly receipts = new Map<string, GatewayReceipt>();

  async claimPlan(plan: GatewayPlan): Promise<GatewayPlanClaim> {
    const key = `${plan.actorId}:${plan.idempotencyKey}`;
    const existingId = this.planKeys.get(key);
    const existing = existingId ? this.plans.get(existingId) : undefined;
    if (existing) {
      assertSameRequest(existing, plan);
      return { plan: existing, replayed: true };
    }
    this.plans.set(plan.id, plan);
    this.planKeys.set(key, plan.id);
    return { plan, replayed: false };
  }

  async getPlan(actorId: string, id: string) {
    const plan = this.plans.get(id);
    return plan?.actorId === actorId ? plan : undefined;
  }

  async getReceipt(actorId: string, planId: string) {
    const receipt = this.receipts.get(planId);
    return receipt?.actorId === actorId ? receipt : undefined;
  }

  async saveVerifiedReceipt(receipt: GatewayReceipt) {
    const plan = this.plans.get(receipt.planId);
    assertReceiptMatchesPlan(plan, receipt);
    const existing = this.receipts.get(receipt.planId);
    if (existing) {
      assertSameReceipt(existing, receipt);
      return;
    }
    this.receipts.set(receipt.planId, receipt);
  }
}

type PlanRow = typeof agentGatewayPlans.$inferSelect;
type ReceiptRow = typeof agentGatewayReceipts.$inferSelect;

function planFromRow(row: PlanRow): GatewayPlan {
  return {
    id: row.id,
    apiVersion: row.apiVersion as GatewayPlan["apiVersion"],
    environment: row.environment as GatewayPlan["environment"],
    actorId: row.actorId,
    capabilityId: row.capabilityId,
    status: row.status as GatewayPlan["status"],
    idempotencyKey: row.idempotencyKey,
    requestFingerprint: row.requestFingerprint,
    parameters: row.parameters,
    blockers: row.blockers,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    safety: row.safety as GatewayPlan["safety"],
    approval: row.approval as GatewayPlan["approval"],
  };
}

function receiptFromRow(row: ReceiptRow): GatewayReceipt {
  return {
    id: row.id,
    planId: row.planId,
    actorId: row.actorId,
    capabilityId: row.capabilityId,
    network: row.network as GatewayReceipt["network"],
    status: row.status as GatewayReceipt["status"],
    transactionHash: row.transactionHash,
    evidence: row.evidence,
    createdAt: row.createdAt.toISOString(),
  };
}

export class NeonGatewayStore implements GatewayStore {
  async claimPlan(plan: GatewayPlan): Promise<GatewayPlanClaim> {
    const db = getDb();
    const inserted = await db
      .insert(agentGatewayPlans)
      .values({
        id: plan.id,
        actorId: plan.actorId,
        apiVersion: plan.apiVersion,
        environment: plan.environment,
        capabilityId: plan.capabilityId,
        status: plan.status,
        idempotencyKey: plan.idempotencyKey,
        requestFingerprint: plan.requestFingerprint,
        parameters: plan.parameters,
        blockers: plan.blockers,
        safety: plan.safety,
        approval: plan.approval,
        createdAt: new Date(plan.createdAt),
        expiresAt: new Date(plan.expiresAt),
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return { plan: planFromRow(inserted[0]), replayed: false };
    }

    const existingRows = await db
      .select()
      .from(agentGatewayPlans)
      .where(
        and(
          eq(agentGatewayPlans.actorId, plan.actorId),
          eq(agentGatewayPlans.idempotencyKey, plan.idempotencyKey),
        ),
      )
      .limit(1);
    const existing = existingRows[0] ? planFromRow(existingRows[0]) : undefined;
    if (!existing) throw new Error("gateway_plan_persistence_conflict");
    assertSameRequest(existing, plan);
    return { plan: existing, replayed: true };
  }

  async getPlan(actorId: string, id: string) {
    const rows = await getDb()
      .select()
      .from(agentGatewayPlans)
      .where(and(eq(agentGatewayPlans.actorId, actorId), eq(agentGatewayPlans.id, id)))
      .limit(1);
    return rows[0] ? planFromRow(rows[0]) : undefined;
  }

  async getReceipt(actorId: string, planId: string) {
    const rows = await getDb()
      .select()
      .from(agentGatewayReceipts)
      .where(
        and(
          eq(agentGatewayReceipts.actorId, actorId),
          eq(agentGatewayReceipts.planId, planId),
        ),
      )
      .limit(1);
    return rows[0] ? receiptFromRow(rows[0]) : undefined;
  }

  async saveVerifiedReceipt(receipt: GatewayReceipt) {
    const plan = await this.getPlan(receipt.actorId, receipt.planId);
    assertReceiptMatchesPlan(plan, receipt);
    const inserted = await getDb()
      .insert(agentGatewayReceipts)
      .values({
        id: receipt.id,
        planId: receipt.planId,
        actorId: receipt.actorId,
        capabilityId: receipt.capabilityId,
        network: receipt.network,
        status: receipt.status,
        transactionHash: receipt.transactionHash,
        evidence: receipt.evidence,
        createdAt: new Date(receipt.createdAt),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return;

    const existing = await this.getReceipt(receipt.actorId, receipt.planId);
    if (!existing) throw new Error("gateway_receipt_persistence_conflict");
    assertSameReceipt(existing, receipt);
  }
}

const memoryStore = new InMemoryGatewayStore();
const neonStore = new NeonGatewayStore();

export function getGatewayStore(): GatewayStore {
  return hasDatabase() ? neonStore : memoryStore;
}

// Execution adapters may call this only after their own chain/provider verifier
// has produced exact evidence. The public v1 gateway intentionally exposes no
// route that can manufacture or submit a receipt.
export async function saveVerifiedGatewayReceipt(receipt: GatewayReceipt) {
  return getGatewayStore().saveVerifiedReceipt(receipt);
}
