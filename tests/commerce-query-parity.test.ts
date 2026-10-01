import assert from "node:assert/strict";
import test from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createCommerceQueries } from "../app/queries/commerce";
import { executeMcpReadQuery, executeWebReadQuery } from "../app/queries/adapters";
import { listReadQueries, readQueryDefinitions } from "../app/queries/registry";
import { listGatewayCapabilities } from "../app/agent-gateway/catalog";
import { evaluateQueryAcceptance, queryAcceptanceGroup, queryContractFingerprint } from "../app/queries/acceptance";

const principal = (scopes = ["agent:read"], userId = "owner-a"): AuthInfo => ({
  token: "fixture-not-a-credential", clientId: "commerce-read-fixture", scopes,
  extra: { subjectType: "user", userId },
});
const offer = {
  id: "published_offer_fixture", merchant: "Public test provider", title: "Published service", description: "Public catalog fixture",
  kind: "service", amount: 2, currency: "USDC", network: "stellar-testnet", availability: "testnet", catalogSource: "published_provider",
};
const queriedAt = "2026-10-01T20:00:00.000Z";
const mcpRead = async (...args: Parameters<typeof executeMcpReadQuery>) => executeMcpReadQuery(...args);

test("commerce reads are registered with typed read-only coverage and evidence-derived availability", () => {
  for (const [id, toolName] of [["commerce.catalog.search", "read_commerce_catalog_search"], ["commerce.catalog.detail", "read_commerce_catalog_detail"]]) {
    const definition = readQueryDefinitions.find(query => query.id === id);
    assert.ok(definition);
    assert.equal(definition.toolName, toolName);
    assert.equal(definition.scope, "agent:read");
    assert.equal(definition.dataScope, "public_catalog_metadata");
    assert.equal(queryAcceptanceGroup(id), "commerce");
    assert.match(queryContractFingerprint(definition), /^[a-f0-9]{64}$/);
    const discovery = listReadQueries().find(query => query.id === id);
    assert.deepEqual(discovery?.channels, { carmelita: true, chatgpt: true });
    assert.equal(discovery?.acceptance, evaluateQueryAcceptance(definition).acceptance);
    const capability = listGatewayCapabilities().find(capability => capability.id === id);
    assert.ok(capability);
    assert.equal(capability.operation, "read");
    assert.equal(capability.requiresApproval, false);
    assert.deepEqual(capability.readTools, [toolName]);
    assert.deepEqual(capability.channels, discovery?.channels);
    assert.equal(capability.execution.mode, "read_only");
    assert.equal(capability.availability?.available, evaluateQueryAcceptance(definition).available);
  }
});

test("commerce authorization rejects anonymous or insufficient scopes before searching any catalog", async () => {
  let calls = 0;
  const definitions = createCommerceQueries({ search: async () => { calls++; }, detail: async () => { calls++; } });
  for (const [id, input] of [["commerce.catalog.search", { query: "service" }], ["commerce.catalog.detail", { offerId: offer.id }]] as const) {
    await assert.rejects(mcpRead(id, input, undefined, definitions), /principal_required/);
    for (const scopes of [[], ["agent:context"], ["agent:conversation"], ["agent:plan"]]) {
      await assert.rejects(mcpRead(id, input, principal(scopes), definitions), /scope/);
    }
    await assert.rejects(executeWebReadQuery(id, input, "", "es", definitions), /authorization_required/);
  }
  assert.equal(calls, 0);
});

test("public catalog search and detail return equivalent identities and sources in both channels", async () => {
  const calls: unknown[] = [];
  const definitions = createCommerceQueries({
    search: async input => { calls.push(input); return { status: "ok", offers: [offer], source: "public_catalog", queriedAt, readOnly: true }; },
    detail: async offerId => { calls.push(offerId); return { status: "ok", offer, source: "public_catalog", queriedAt, readOnly: true }; },
  });
  for (const [id, input] of [["commerce.catalog.search", { query: "service", kind: "service" }], ["commerce.catalog.detail", { offerId: offer.id }]] as const) {
    const web = await executeWebReadQuery(id, input, "owner-a", "pt", definitions);
    const mcp = await executeMcpReadQuery(id, input, principal(), definitions);
    assert.deepEqual(web, mcp);
    assert.deepEqual(await executeMcpReadQuery(id, input, principal(["agent:read"], "owner-b"), definitions), mcp, "public offer IDs must not become personal-owner selectors");
    assert.doesNotMatch(JSON.stringify(mcp), /authorizationToken|actorId|intentId|receiptId|signature/);
  }
  assert.deepEqual(calls, [
    { query: "service", kind: "service" }, { query: "service", kind: "service" }, { query: "service", kind: "service" },
    offer.id, offer.id, offer.id,
  ]);
});

test("commerce schemas retain query defaults, six legacy kinds and exact public offer IDs", async () => {
  const observed: unknown[] = [];
  const definitions = createCommerceQueries({ search: async input => { observed.push(input); return { offers: [] }; }, detail: async id => { observed.push(id); return { offer }; } });
  await executeWebReadQuery("commerce.catalog.search", {}, "owner-a", "es", definitions);
  assert.deepEqual(observed, [{ query: "" }]);
  for (const kind of ["finance", "reservation", "task", "travel", "product", "service"]) {
    await executeMcpReadQuery("commerce.catalog.search", { query: "x".repeat(120), kind }, principal(), definitions);
  }
  await executeMcpReadQuery("commerce.catalog.detail", { offerId: offer.id }, principal(), definitions);
  assert.equal(observed.at(-1), offer.id);
  await executeMcpReadQuery("commerce.catalog.detail", { offerId: "p".repeat(128) }, principal(), definitions);
  assert.equal(observed.at(-1), "p".repeat(128));
  const callCount = observed.length;
  for (const invalid of [{ query: "x".repeat(121) }, { kind: "unknown" }, { query: 2 }]) {
    await assert.rejects(executeMcpReadQuery("commerce.catalog.search", invalid, principal(), definitions));
  }
  await assert.rejects(executeMcpReadQuery("commerce.catalog.detail", { offerId: 2 }, principal(), definitions));
  for (const offerId of ["", "p".repeat(129)]) {
    await assert.rejects(executeMcpReadQuery("commerce.catalog.detail", { offerId }, principal(), definitions));
  }
  for (const id of ["commerce.catalog.search", "commerce.catalog.detail"]) {
    const valid = id.endsWith("search") ? {} : { offerId: offer.id };
    for (const selector of ["userId", "ownerId", "actorId", "providerId", "privyDid", "subjectId", "authorizationToken"]) {
      await assert.rejects(executeMcpReadQuery(id, { ...valid, [selector]: "foreign-selector" }, principal(), definitions));
    }
  }
  assert.equal(observed.length, callCount);
});

test("missing public offers and upstream failures preserve safe outcomes without financial actions", async () => {
  const missing = createCommerceQueries({ detail: async () => { throw new Error("offer_not_found"); } });
  const notFound = await executeWebReadQuery("commerce.catalog.detail", { offerId: "absent" }, "owner-a", "es", missing);
  assert.deepEqual(notFound, { status: "not_found", code: "offer_not_found", source: "Carmelita public service catalog", readOnly: true, dataScope: "public_catalog_metadata" });
  const unavailable = createCommerceQueries({
    search: async () => { throw new Error("Bearer private_catalog_provider_credential"); },
    detail: async () => { throw new Error("private_database_customer_row"); },
  });
  for (const [id, input] of [["commerce.catalog.search", {}], ["commerce.catalog.detail", { offerId: offer.id }]] as const) {
    const web = await executeWebReadQuery(id, input, "owner-a", "en", unavailable);
    const mcp = await executeMcpReadQuery(id, input, principal(), unavailable);
    assert.deepEqual(web, mcp);
    assert.deepEqual(web, { status: "unavailable", code: "commerce_catalog_unavailable", source: "Carmelita public service catalog", readOnly: true, dataScope: "public_catalog_metadata" });
    assert.doesNotMatch(JSON.stringify(web), /private_|Bearer|create_intent|authorizationToken/);
  }
});
