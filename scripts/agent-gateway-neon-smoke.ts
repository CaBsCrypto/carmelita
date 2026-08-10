import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import {
  createGatewayPlan,
  readGatewayPlan,
  readGatewayReceipt,
} from "../app/agent-gateway/service";
import { NeonGatewayStore } from "../app/agent-gateway/store";
import {
  consumeGatewayRateLimit,
  createGatewayAudit,
  GatewayRateLimitError,
  gatewayPseudonym,
} from "../app/agent-gateway/operations";
import { getDb } from "../db";
import { agentGatewayAuditEvents, agentGatewayPlans, agentGatewayRateLimits } from "../db/schema";

for (const line of readFileSync(".env.migrate", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  const value = match[2].replace(/^["']|["']$/g, "").trim();
  if (value) process.env[match[1]] = value;
}

const suffix = randomUUID();
const actorId = `gateway-smoke-${suffix}`;
const idempotencyKey = `gateway-neon-${suffix}`;
const store = new NeonGatewayStore();
const rateSubjectPseudonym = gatewayPseudonym("token", `gateway-smoke-rate-${suffix}`);
const auditRequestId = `gateway-smoke-audit-${suffix}`;

const input = {
  capabilityId: "stellar.wallet.status",
  idempotencyKey,
  parameters: { detail: "summary" },
  context: { requirementsSatisfied: ["stellar_wallet"] },
};

let planId: string | undefined;
try {
  const first = await createGatewayPlan(actorId, input, store);
  const replay = await createGatewayPlan(actorId, input, store);
  planId = first.plan.id;

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.plan.id, first.plan.id);

  await assert.rejects(
    createGatewayPlan(
      actorId,
      { ...input, parameters: { detail: "full" } },
      store,
    ),
    /gateway_idempotency_conflict/,
  );
  await assert.rejects(
    readGatewayPlan("different-user", first.plan.id, store),
    /gateway_plan_not_found/,
  );

  const receipt = {
    id: `gwr_${suffix}`,
    planId: first.plan.id,
    actorId,
    capabilityId: first.plan.capabilityId,
    network: "stellar:testnet" as const,
    status: "verified" as const,
    transactionHash: null,
    evidence: { verifier: "gateway-neon-smoke", simulated: true },
    createdAt: new Date().toISOString(),
  };
  await store.saveVerifiedReceipt(receipt);
  await store.saveVerifiedReceipt(receipt);
  assert.equal((await readGatewayReceipt(actorId, first.plan.id, store)).available, true);
  await assert.rejects(
    store.saveVerifiedReceipt({
      ...receipt,
      id: `gwr_conflict_${suffix}`,
      evidence: { verifier: "different-evidence" },
    }),
    /gateway_receipt_conflict/,
  );
  await assert.rejects(
    store.saveVerifiedReceipt({ ...receipt, actorId: "different-user" }),
    /gateway_receipt_plan_mismatch/,
  );

  const rateNow = new Date();
  const rateResults = await Promise.all([
    consumeGatewayRateLimit({ scope: "personal_pat_usage", subjectPseudonym: rateSubjectPseudonym, limit: 2, windowSeconds: 60, now: rateNow }),
    consumeGatewayRateLimit({ scope: "personal_pat_usage", subjectPseudonym: rateSubjectPseudonym, limit: 2, windowSeconds: 60, now: rateNow }),
  ]);
  assert.deepEqual(rateResults.map((result) => result.remaining).sort(), [0, 1]);
  let retryAfter = 0;
  await assert.rejects(
    consumeGatewayRateLimit({ scope: "personal_pat_usage", subjectPseudonym: rateSubjectPseudonym, limit: 2, windowSeconds: 60, now: rateNow }),
    (error: unknown) => {
      assert.ok(error instanceof GatewayRateLimitError);
      retryAfter = error.retryAfterSeconds;
      return true;
    },
  );
  assert.ok(retryAfter >= 1 && retryAfter <= 60);
  const [rateBucket] = await getDb().select().from(agentGatewayRateLimits)
    .where(eq(agentGatewayRateLimits.subjectPseudonym, rateSubjectPseudonym)).limit(1);
  assert.equal(rateBucket?.requestCount, 3);

  const audit = createGatewayAudit(new Request("https://carmelita.invalid/gateway-neon-smoke", {
    headers: { "x-request-id": auditRequestId },
  }), "/gateway-neon-smoke");
  audit.identify({ actorId, tokenId: `gateway-smoke-token-${suffix}` });
  const auditedResponse = await audit.complete(new Response(null, { status: 202 }));
  assert.equal(auditedResponse.headers.get("X-Request-ID"), auditRequestId);
  const [auditEvent] = await getDb().select().from(agentGatewayAuditEvents)
    .where(eq(agentGatewayAuditEvents.requestId, auditRequestId)).limit(1);
  assert.ok(auditEvent);
  assert.deepEqual(Object.keys(auditEvent).sort(), [
    "actorPseudonym", "createdAt", "id", "latencyMs", "outcome", "requestId",
    "route", "status", "tokenPseudonym", "tool",
  ]);
  assert.equal(auditEvent.actorPseudonym, gatewayPseudonym("actor", actorId));
  assert.equal(auditEvent.tokenPseudonym, gatewayPseudonym("token", `gateway-smoke-token-${suffix}`));
  assert.equal(auditEvent.route, "/gateway-neon-smoke");
  assert.equal(auditEvent.tool, null);
  assert.equal(auditEvent.status, 202);
  assert.equal(auditEvent.outcome, "success");
  assert.ok(auditEvent.latencyMs >= 0);
  console.log("Neon Gateway smoke: PASS");
  console.log("- durable insert: PASS");
  console.log("- same-input replay: PASS");
  console.log("- changed-input conflict: PASS");
  console.log("- cross-user isolation: PASS");
  console.log("- verified receipt persistence: PASS");
  console.log("- receipt replacement protection: PASS");
  console.log("- atomic distributed rate bucket and Retry-After: PASS");
  console.log("- pseudonymized minimal audit persistence: PASS");
} finally {
  await Promise.all([
    getDb().delete(agentGatewayRateLimits).where(eq(agentGatewayRateLimits.subjectPseudonym, rateSubjectPseudonym)),
    getDb().delete(agentGatewayAuditEvents).where(eq(agentGatewayAuditEvents.requestId, auditRequestId)),
  ]);
  if (planId) {
    await getDb().delete(agentGatewayPlans).where(eq(agentGatewayPlans.id, planId));
  }
}
