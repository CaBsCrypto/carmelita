import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { listGatewayCapabilities } from "../app/agent-gateway/catalog";
import { gatewayError } from "../app/agent-gateway/http";
import { InMemoryGatewayStore } from "../app/agent-gateway/store";
import {
  createGatewayPlan,
  readGatewayPlan,
  readGatewayReceipt,
} from "../app/agent-gateway/service";

test("gateway exposes a versioned, honest multichain Testnet catalog", () => {
  const capabilities = listGatewayCapabilities();
  assert.ok(capabilities.length >= 30);
  assert.ok(capabilities.some((item) => item.network === "stellar:testnet"));
  assert.ok(capabilities.some((item) => item.network === "avalanche:fuji"));
  assert.ok(capabilities.some((item) => item.network === "offchain:testnet"));
  assert.ok(capabilities.every((item) => item.version === "2026-08-03"));
  assert.ok(capabilities.every((item) => item.execution.exposedByGateway === false));
  assert.equal(
    capabilities.find((item) => item.id === "stellar.soroswap.swap")?.status,
    "planned",
  );
});

test("financial planning is idempotent, noncustodial and never executable", async () => {
  const store = new InMemoryGatewayStore();
  const input = {
    capabilityId: "x402.report.purchase",
    idempotencyKey: "gateway-test-key-001",
    parameters: { amount: "0.01", asset: "USDC" },
    context: { requirementsSatisfied: ["evm_wallet", "fuji_usdc"] },
  };
  const first = await createGatewayPlan("user-a", input, store);
  const replay = await createGatewayPlan("user-a", input, store);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.plan.id, first.plan.id);
  assert.equal(first.plan.status, "blocked");
  assert.equal(first.plan.safety.nonCustodial, true);
  assert.equal(first.plan.safety.fundsMoved, false);
  assert.equal(first.plan.safety.transactionPrepared, false);
  assert.equal(first.plan.safety.serverSideSigning, false);
  assert.equal(first.plan.safety.mainnetEnabled, false);
  assert.equal(first.plan.safety.executionEnabled, false);
  assert.equal(first.plan.approval.continuationUrl, null);
  assert.ok(first.plan.blockers.includes("runtime_preflight_required"));
});

test("idempotency conflicts and cross-user reads fail closed", async () => {
  const store = new InMemoryGatewayStore();
  const base = {
    capabilityId: "stellar.wallet.status",
    idempotencyKey: "gateway-test-key-002",
    parameters: { detail: "summary" },
    context: { requirementsSatisfied: ["stellar_wallet"] },
  };
  const { plan } = await createGatewayPlan("user-b", base, store);
  await assert.rejects(
    createGatewayPlan("user-b", { ...base, parameters: { detail: "full" } }, store),
    /gateway_idempotency_conflict/,
  );
  await assert.rejects(
    readGatewayPlan("user-c", plan.id, store),
    /gateway_plan_not_found/,
  );
  await assert.rejects(
    readGatewayReceipt("user-c", plan.id, store),
    /gateway_plan_not_found/,
  );
});

test("idempotency freezes requirement context as well as parameters", async () => {
  const store = new InMemoryGatewayStore();
  const input = { capabilityId: "stellar.wallet.status", idempotencyKey: "gateway-context-key-001", parameters: { detail: "summary" }, context: { requirementsSatisfied: [] as string[] } };
  await createGatewayPlan("context-user", input, store);
  await assert.rejects(
    createGatewayPlan("context-user", { ...input, context: { requirementsSatisfied: ["stellar_wallet"] } }, store),
    /gateway_idempotency_conflict/,
  );
  const ordered = { ...input, idempotencyKey: "gateway-context-key-002", context: { requirementsSatisfied: ["stellar_wallet", "privy_session"] } };
  const first = await createGatewayPlan("context-user", ordered, store);
  const replay = await createGatewayPlan("context-user", { ...ordered, context: { requirementsSatisfied: ["privy_session", "stellar_wallet", "stellar_wallet"] } }, store);
  assert.equal(replay.replayed, true);
  assert.equal(replay.plan.id, first.plan.id);
});

test("planned capabilities remain blocked even when context is declared", async () => {
  const store = new InMemoryGatewayStore();
  const { plan } = await createGatewayPlan("user-d", {
    capabilityId: "stellar.soroswap.swap",
    idempotencyKey: "gateway-test-key-003",
    parameters: {},
    context: {
      requirementsSatisfied: [
        "stellar_wallet",
        "soroswap_api",
        "source_balance",
      ],
    },
  }, store);
  assert.equal(plan.status, "blocked");
  assert.ok(plan.blockers.includes("capability_not_available"));
  assert.equal((await readGatewayReceipt("user-d", plan.id, store)).available, false);
});

test("concurrent duplicate plans resolve to one stable action", async () => {
  const store = new InMemoryGatewayStore();
  const input = {
    capabilityId: "stellar.wallet.status",
    idempotencyKey: "gateway-concurrent-key-001",
    parameters: { detail: "summary" },
    context: { requirementsSatisfied: ["stellar_wallet"] },
  };
  const [first, second] = await Promise.all([
    createGatewayPlan("user-concurrent", input, store),
    createGatewayPlan("user-concurrent", input, store),
  ]);
  assert.equal(first.plan.id, second.plan.id);
  assert.deepEqual(
    [first.replayed, second.replayed].sort(),
    [false, true],
  );
});

test("verified receipts are plan-bound and immutable", async () => {
  const store = new InMemoryGatewayStore();
  const { plan } = await createGatewayPlan("receipt-user", {
    capabilityId: "stellar.wallet.status",
    idempotencyKey: "gateway-receipt-key-001",
    parameters: {},
    context: { requirementsSatisfied: ["stellar_wallet"] },
  }, store);
  const receipt = {
    id: "gwr_test_001",
    planId: plan.id,
    actorId: plan.actorId,
    capabilityId: plan.capabilityId,
    network: "stellar:testnet" as const,
    status: "verified" as const,
    transactionHash: null,
    evidence: { verifier: "unit-test" },
    createdAt: new Date().toISOString(),
  };

  await assert.rejects(
    store.saveVerifiedReceipt({ ...receipt, network: "avalanche:fuji" }),
    /gateway_receipt_plan_mismatch/,
  );
  await store.saveVerifiedReceipt(receipt);
  await store.saveVerifiedReceipt(receipt);
  assert.equal((await readGatewayReceipt(plan.actorId, plan.id, store)).available, true);
  await assert.rejects(
    store.saveVerifiedReceipt({ ...receipt, id: "gwr_replacement" }),
    /gateway_receipt_conflict/,
  );
  await assert.rejects(
    store.saveVerifiedReceipt({ ...receipt, actorId: "other-user" }),
    /gateway_receipt_plan_mismatch/,
  );
});

test("public API has no execute route and requires bearer auth for user state", async () => {
  const planRoute = await readFile(
    new URL("../app/api/v1/actions/plan/route.ts", import.meta.url),
    "utf8",
  );
  const statusRoute = await readFile(
    new URL("../app/api/v1/actions/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const receiptRoute = await readFile(
    new URL("../app/api/v1/receipts/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(planRoute, /gatewayActor\(request, "agent:(plan|read)", audit\)/);
  assert.match(statusRoute, /gatewayActor\(request, "agent:(plan|read)", audit\)/);
  assert.match(receiptRoute, /gatewayActor\(request, "agent:(plan|read)", audit\)/);
  assert.doesNotMatch(planRoute, /sign|submit|execute/i);
});

test("planning rejects mainnet and incompatible network overrides", async () => {
  const store = new InMemoryGatewayStore();
  const base = {
    capabilityId: "stellar.wallet.status",
    idempotencyKey: "gateway-network-key-001",
    context: { requirementsSatisfied: ["stellar_wallet"] },
  };
  await assert.rejects(
    createGatewayPlan("network-user", { ...base, parameters: { network: "stellar:mainnet" } }, store),
    /gateway_network_override_rejected/,
  );
  await assert.rejects(
    createGatewayPlan("network-user", { ...base, idempotencyKey: "gateway-network-key-002", parameters: { chainId: 1 } }, store),
    /gateway_network_override_rejected/,
  );
  await assert.rejects(
    createGatewayPlan("network-user", { ...base, idempotencyKey: "gateway-network-key-006", parameters: { environment: "production" } }, store),
    /gateway_network_override_rejected/,
  );
});

test("planning accepts only the capability network and Fuji chain ID", async () => {
  const store = new InMemoryGatewayStore();
  const stellar = await createGatewayPlan("network-user", {
    capabilityId: "stellar.wallet.status",
    idempotencyKey: "gateway-network-key-003",
    parameters: { network: "stellar:testnet", environment: "testnet" },
    context: { requirementsSatisfied: ["stellar_wallet"] },
  }, store);
  assert.equal(stellar.plan.environment, "testnet");

  const fuji = await createGatewayPlan("network-user", {
    capabilityId: "x402.report.purchase",
    idempotencyKey: "gateway-network-key-004",
    parameters: { network: "avalanche:fuji", chainId: 43113 },
    context: { requirementsSatisfied: ["evm_wallet", "fuji_usdc"] },
  }, store);
  assert.equal(fuji.capability.network, "avalanche:fuji");

  await assert.rejects(
    createGatewayPlan("network-user", {
      capabilityId: "x402.report.purchase",
      idempotencyKey: "gateway-network-key-005",
      parameters: { network: "avalanche:fuji", chainId: 43114 },
      context: { requirementsSatisfied: ["evm_wallet", "fuji_usdc"] },
    }, store),
    /gateway_network_override_rejected/,
  );
});

test("network override rejection is a stable HTTP 400", async () => {
  const response = gatewayError(new Error("gateway_network_override_rejected:private detail"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "gateway_network_override_rejected" });
});
