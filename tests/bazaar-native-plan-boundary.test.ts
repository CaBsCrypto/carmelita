import assert from "node:assert/strict";
import test from "node:test";
import {
  createNativeGatewayPlan,
  projectNativeAvalanchePlan,
  type CapabilityMetadata,
} from "../app/bazaar/native-channel-boundary";
import { listAvalancheCapabilities, planAvalancheCapability } from "../app/avalanche/capability-registry";
import { getGatewayCapability, listGatewayCapabilities } from "../app/agent-gateway/catalog";

const compatibilityBlocker = "openai_financial_compatibility_unresolved";
const completeContext = {
  authenticated: true, evmWallet: true, stellarWallet: true, fujiAvax: true,
  fujiUsdc: true, fujiWavax: true, fujiNftOwned: true, stellarUsdcTrustline: true,
};

test("satisfied wallet and balance claims cannot make an Avalanche financial plan executable in the native channel", () => {
  const financial = listAvalancheCapabilities().filter(capability => capability.operation !== "read");
  assert.ok(financial.some(capability => planAvalancheCapability(capability.id, completeContext).executable));
  for (const capability of financial) {
    const original = planAvalancheCapability(capability.id, completeContext);
    const snapshot = structuredClone(original);
    const native = projectNativeAvalanchePlan(original);
    assert.equal(native.executable, false, capability.id);
    assert.equal(native.boundary, "native_financial_blocked");
    assert.equal(native.capability.status, "blocked");
    assert.equal(native.blockers.filter(blocker => blocker === compatibilityBlocker).length, 1);
    assert.deepEqual(original, snapshot, "the underlying web plan must remain unchanged");
  }
});

test("future financial plans cannot smuggle nested checkout, credentials or executable context into a blocked response", () => {
  for (const operation of ["financial", "cross_chain"]) {
    const capability = {
      id: "future.native.operation", title: "Buy now", description: "Follow the checkout",
      provider: "Future provider", operation, status: "live", nextAction: "Open https://unsafe.example/pay",
      workflow: { checkoutUrl: "https://unsafe.example/pay" },
      authorization: { token: "synthetic-private-token" },
      execution: { exposedByGateway: true, mode: "execute", checkoutUrl: "https://unsafe.example/pay" },
      channels: { carmelita: true, chatgpt: true, handoff: "https://unsafe.example/pay" },
    };
    const original = {
      capability, executable: true, blockers: [compatibilityBlocker], approvalRequired: true,
      boundary: "prepare_then_explicit_privy_approval",
      context: { wallet: true, availableFunds: true, explicitUserConfirmation: true },
      plan: { signedXdr: "synthetic-private-xdr", checkoutUrl: "https://unsafe.example/pay" },
    };
    const result = projectNativeAvalanchePlan(original);
    assert.deepEqual(Object.keys(result).sort(), ["approvalRequired", "blockers", "boundary", "capability", "executable"]);
    assert.deepEqual(result.blockers, [compatibilityBlocker]);
    assert.equal(result.executable, false);
    assert.doesNotMatch(JSON.stringify(result), /unsafe\.example|synthetic-private|Buy now|Follow the checkout|signedXdr|explicitUserConfirmation/);
    assert.deepEqual(result.capability.channels, { carmelita: true, chatgpt: false });
  }
});

test("Avalanche read plans preserve the original result and requirements in both ready and blocked states", () => {
  for (const capability of listAvalancheCapabilities().filter(item => item.operation === "read")) {
    for (const context of [{}, completeContext]) {
      const plan = planAvalancheCapability(capability.id, context);
      assert.equal(projectNativeAvalanchePlan(plan), plan);
    }
  }
});

test("every installed financial gateway plan is blocked before persistence or provider preparation, including retries", async () => {
  let writesOrProviderCalls = 0;
  const financial = listGatewayCapabilities().filter(capability => ["financial", "cross_chain"].includes(capability.operation));
  assert.ok(financial.length >= 10);
  const dependencies = {
    getCapability: getGatewayCapability,
    createPlan: async () => { writesOrProviderCalls++; throw new Error("native-planning-backend-must-not-run"); },
  };
  for (const capability of financial) {
    const input = {
      capabilityId: capability.id, idempotencyKey: "same-native-request",
      parameters: { explicitUserConfirmation: true },
      context: { requirementsSatisfied: capability.requirements },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await createNativeGatewayPlan("authenticated-owner", input, dependencies);
      assert.equal(result.plan, null);
      assert.equal(result.replayed, false);
      assert.equal(result.executionEnabled, false);
      assert.equal(result.transactionPrepared, false);
      assert.equal(result.reason, compatibilityBlocker);
      assert.equal(result.capability.id, capability.id);
      assert.equal(result.capability.status, "blocked");
      assert.equal("approval" in result, false);
      assert.equal("parameters" in result, false);
    }
  }
  assert.equal(writesOrProviderCalls, 0);
});

test("future financial capability and failed lookup never reach the native planning backend", async () => {
  let calls = 0;
  const createPlan = async () => { calls++; throw new Error("backend-must-not-run"); };
  for (const operation of ["financial", "cross_chain"]) {
    const capability: CapabilityMetadata & { handoff: { url: string } } = {
      id: "future.purchase", title: "Buy now", description: "Run checkout", provider: "Future",
      operation, status: "live", nextAction: "Open https://unsafe.example/pay",
      handoff: { url: "https://unsafe.example/pay" },
    };
    const result = await createNativeGatewayPlan("authenticated-owner", { capabilityId: capability.id }, {
      getCapability: () => capability, createPlan,
    });
    assert.equal(result.plan, null);
    assert.doesNotMatch(JSON.stringify(result), /unsafe\.example|Buy now|Run checkout/);
  }
  await assert.rejects(createNativeGatewayPlan("authenticated-owner", { capabilityId: "unknown" }, {
    getCapability: () => { throw new Error("gateway_capability_not_found"); }, createPlan,
  }), /gateway_capability_not_found/);
  assert.equal(calls, 0);
});

test("native read planning retains the authenticated owner, full request and exact replay result", async () => {
  const capability = getGatewayCapability("offchain.market.quote");
  const input = { capabilityId: capability.id, idempotencyKey: "same-read-request", parameters: { query: "XLM" } };
  const replayed = { plan: { id: "synthetic-read-plan", actorId: "authenticated-owner" }, capability, replayed: true };
  let calls = 0;
  const result = await createNativeGatewayPlan("authenticated-owner", input, {
    getCapability: getGatewayCapability,
    createPlan: async (owner, request) => {
      calls++;
      assert.equal(owner, "authenticated-owner");
      assert.equal(request, input);
      return replayed;
    },
  });
  assert.equal(result, replayed);
  assert.equal(calls, 1);
});
