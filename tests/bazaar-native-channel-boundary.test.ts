import assert from "node:assert/strict";
import test from "node:test";
import { projectNativeCapabilityBoundary } from "../app/bazaar/native-channel-boundary";
import { getGatewayCapability, listGatewayCapabilities } from "../app/agent-gateway/catalog";
import { createMetadataQueries } from "../app/queries/metadata";
import { executeQueryDefinition } from "../app/queries/types";

const queries = createMetadataQueries();
async function query(id: string, input = {}) {
  const definition = queries.find((entry) => entry.id === id)!;
  return executeQueryDefinition(definition, input, { userId: "owner-a", scopes: ["agent:read"] });
}

type FinancialProjection = {
  id: string; title: string; description: string; status: string; implementationStatus: string;
  nextAction: string; availability: { available: boolean };
  execution: { exposedByGateway: boolean; mode: string };
  nativeChannelBoundary: { channel: string; status: string; prepare: boolean; approve: boolean; sign: boolean; execute: boolean; checkoutHandoff: boolean };
};

function assertBlocked(capability: FinancialProjection) {
  assert.equal(capability.status, "blocked");
  assert.equal(capability.availability.available, false);
  assert.equal(capability.execution.exposedByGateway, false);
  assert.equal(capability.execution.mode, "metadata_only");
  assert.equal(capability.nativeChannelBoundary.channel, "chatgpt");
  assert.equal(capability.nativeChannelBoundary.status, "blocked");
  for (const action of ["prepare", "approve", "sign", "execute", "checkoutHandoff"] as const) assert.equal(capability.nativeChannelBoundary[action], false);
  assert.doesNotMatch(`${capability.title} ${capability.description} ${capability.nextAction}`, /open Carmelita|approve a fresh|complete one|run one|run a second|prepare in Carmelita|0\.01 USDC/i);
}

test("list and detail metadata expose implementation without native financial instructions or checkout", async () => {
  const originals = listGatewayCapabilities();
  const snapshot = structuredClone(originals);
  const list = await query("offchain.capabilities.list") as { capabilities: FinancialProjection[] };
  const financial = originals.filter((entry) => ["financial", "cross_chain"].includes(entry.operation));
  assert.ok(financial.length >= 10);
  for (const original of financial) {
    const listed = list.capabilities.find((entry) => entry.id === original.id)!;
    assertBlocked(listed);
    assert.equal(listed.implementationStatus, original.status);
    const detail = await query("offchain.capabilities.get", { capabilityId: original.id }) as FinancialProjection;
    assert.deepEqual(detail, listed);
  }
  assert.deepEqual(originals, snapshot, "projection cannot mutate the underlying web capability catalog");
  assert.equal(getGatewayCapability("stellar.x402.report.purchase").status, "live");
  assert.match(getGatewayCapability("stellar.x402.report.purchase").nextAction, /approve a fresh/);
});

test("Avalanche metadata applies the same native boundary to payments, transfers, swaps and bridges", async () => {
  const response = await query("avalanche.capabilities.list") as { capabilities: FinancialProjection[] };
  for (const id of ["avalanche.wallet.transfer", "x402.report.purchase", "pangolin.swap.avax_to_usdc", "circle.cctp.fuji_to_stellar"]) {
    const capability = response.capabilities.find((entry) => entry.id === id)!;
    assertBlocked(capability);
    assert.equal(capability.implementationStatus, getGatewayCapability(id).status);
  }
});

test("read capabilities retain exact data and unavailable provider semantics", async () => {
  for (const original of listGatewayCapabilities().filter((entry) => entry.operation === "read")) {
    assert.deepEqual(projectNativeCapabilityBoundary(original), original);
  }
  const detail = await query("offchain.capabilities.get", { capabilityId: "avalanche.nft.floor_read" });
  assert.deepEqual(detail, getGatewayCapability("avalanche.nft.floor_read"));
});

test("future financial metadata defaults to blocked and cannot publish a handoff via title or nextAction", () => {
  const input = {
    id: "future.digital.purchase", title: "Buy now", description: "Pay and follow checkout", nextAction: "Open https://unsafe.example/checkout",
    status: "live", operation: "financial", provider: "Future provider",
    availability: { available: true, workflow: { nextAction: "Open https://unsafe.example/checkout" } },
    execution: { exposedByGateway: true, mode: "prepare_then_approve", handoff: { url: "https://unsafe.example/pay" } },
    channels: { carmelita: true, chatgpt: true, workflow: { nextAction: "Buy now" } },
    workflow: { nextAction: "Buy now", handoffUrl: "https://unsafe.example/checkout" },
    handoff: { checkout: "https://unsafe.example/pay" },
    checkoutUrl: "https://unsafe.example/checkout",
    paymentInstructions: "Pay now through this private checkout",
    evidence: "Open https://unsafe.example/pay",
  };
  const result = projectNativeCapabilityBoundary(input) as FinancialProjection & { channels: { carmelita: boolean; chatgpt: boolean } };
  assertBlocked(result);
  assert.equal(result.channels.chatgpt, false);
  assert.equal(result.channels.carmelita, true);
  assert.doesNotMatch(JSON.stringify(result), /unsafe\.example|Buy now|Pay and follow/);
  for (const key of ["workflow", "handoff", "checkoutUrl", "paymentInstructions", "evidence"]) assert.equal(key in result, false, key);
});
