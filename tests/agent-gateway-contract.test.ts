import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";
import { listGatewayCapabilities } from "../app/agent-gateway/catalog";
import { InMemoryGatewayStore } from "../app/agent-gateway/store";
import { createGatewayPlan } from "../app/agent-gateway/service";

test("gateway capability contract is explicit and Testnet-only", () => {
  const capabilities = listGatewayCapabilities();

  assert.ok(capabilities.length > 0);
  for (const capability of capabilities) {
    assert.ok(capability.id.length > 2);
    assert.ok(capability.status);
    assert.match(capability.network, /testnet|fuji/);
    assert.equal(capability.network.toLowerCase().includes("mainnet"), false);
    assert.equal(capability.execution.exposedByGateway, false);
    assert.equal(
      capability.requiresApproval,
      capability.approval !== "none",
      `Capability ${capability.id} has inconsistent approval metadata`,
    );
    assert.ok(
      capability.execution.mode === "read_only" ||
        capability.execution.mode === "prepare_then_approve",
    );

    if (capability.operation !== "read") {
      assert.notEqual(capability.approval, "none");
      assert.equal(capability.execution.mode, "prepare_then_approve");
    }
  }
});

test("gateway plan serialization cannot contain signing material", async () => {
  const { plan } = await createGatewayPlan("contract-user", {
    capabilityId: "stellar.x402.report.purchase",
    idempotencyKey: "contract-no-signing-001",
    parameters: { amount: "0.01", asset: "USDC" },
  }, new InMemoryGatewayStore());
  const serialized = JSON.stringify(plan);

  assert.equal(plan.environment, "testnet");
  assert.equal(plan.safety.nonCustodial, true);
  assert.equal(plan.safety.fundsMoved, false);
  assert.equal(plan.safety.transactionPrepared, false);
  assert.equal(plan.safety.serverSideSigning, false);
  assert.equal(plan.safety.mainnetEnabled, false);
  assert.equal(plan.safety.executionEnabled, false);
  assert.doesNotMatch(
    serialized,
    /private[_-]?key|secret[_-]?key|seed[_-]?phrase|signed[_-]?transaction|raw[_-]?transaction/i,
  );
});

test("blocked plans fail closed before approval", async () => {
  const { plan } = await createGatewayPlan("blocked-user", {
    capabilityId: "stellar.x402.report.purchase",
    idempotencyKey: "contract-blocked-001",
    parameters: { amount: "0.01", asset: "USDC" },
  }, new InMemoryGatewayStore());

  assert.equal(plan.status, "blocked");
  assert.ok(plan.blockers.length > 0);
  assert.equal(plan.approval.continuationUrl, null);
  assert.equal(plan.safety.executionEnabled, false);
});

test("Gateway v1 has no execute, sign or submit REST route", async () => {
  const routes = [
    "../app/api/v1/capabilities/route.ts",
    "../app/api/v1/actions/plan/route.ts",
    "../app/api/v1/actions/[id]/route.ts",
    "../app/api/v1/receipts/[id]/route.ts",
  ];

  for (const route of routes) {
    await stat(new URL(route, import.meta.url));
  }

  const planRoute = await readFile(
    new URL("../app/api/v1/actions/plan/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(planRoute, /signTransaction|sendTransaction|submitTransaction/);
});

test("Gateway documentation names the authorization and approval boundaries", async () => {
  const documentation = await readFile(
    new URL("../docs/agent-gateway-v1.md", import.meta.url),
    "utf8",
  );

  assert.match(documentation, /Testnet/i);
  assert.match(documentation, /OAuth 2\.1/);
  assert.match(documentation, /PKCE/);
  assert.match(documentation, /cannot sign|may sign or submit funds/i);
  assert.match(documentation, /Idempotency/i);
  assert.match(documentation, /Threat model/);
  assert.match(documentation, /Acceptance checklist/);
});

test("Gateway migration is additive and enforces durable idempotency", async () => {
  const migration = await readFile(
    new URL("../drizzle/0016_moaning_mastermind.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE "agent_gateway_plans"/);
  assert.match(migration, /CREATE TABLE "agent_gateway_receipts"/);
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "agent_gateway_plans_actor_idempotency_uidx"/,
  );
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN/i);
});

test("Gateway REST scopes follow least privilege", async () => {
  const planRoute = await readFile(
    new URL("../app/api/v1/actions/plan/route.ts", import.meta.url),
    "utf8",
  );
  const actionRoute = await readFile(
    new URL("../app/api/v1/actions/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const receiptRoute = await readFile(
    new URL("../app/api/v1/receipts/[id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(planRoute, /gatewayActor\(request, "agent:plan", audit\)/);
  assert.match(actionRoute, /gatewayActor\(request, "agent:read", audit\)/);
  assert.match(receiptRoute, /gatewayActor\(request, "agent:read", audit\)/);
});
