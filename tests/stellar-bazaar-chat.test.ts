import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentReply, parseStellarBazaarSearchIntent } from "../app/agent-chat-logic";
import { listGatewayCapabilities } from "../app/agent-gateway/catalog";

test.beforeEach(() => {
  process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED = "true";
  process.env.STELLAR_BAZAAR_BASE_URL = "https://stellar-bazaar-x402.vercel.app";
});
test.afterEach(() => {
  delete process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED;
  delete process.env.STELLAR_BAZAAR_BASE_URL;
});

test("disabled discovery exposes no chat action or Gateway capability", () => {
  delete process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED;
  assert.equal(buildAgentReply("Busca en stellar bazaar informes").actions.length, 0);
  assert.equal(listGatewayCapabilities().some(item => item.id === "stellar.bazaar.discovery"), false);
  process.env.STELLAR_BAZAAR_DISCOVERY_ENABLED = "true";
  assert.equal(listGatewayCapabilities().some(item => item.id === "stellar.bazaar.discovery"), true);
});

test("the Bazaar parser needs a Stellar Bazaar mention plus a search verb", () => {
  assert.equal(parseStellarBazaarSearchIntent("what is the XLM price"), null);
  assert.equal(parseStellarBazaarSearchIntent("Connect me to x402 Bazaar"), null);
  assert.equal(parseStellarBazaarSearchIntent("tell me about stellar"), null);
  assert.equal(
    parseStellarBazaarSearchIntent("Busca en stellar bazaar informes de sitios web"),
    "informes sitios web",
  );
  assert.equal(
    parseStellarBazaarSearchIntent("Search Stellar Bazaar for website audits"),
    "website audits",
  );
  assert.equal(parseStellarBazaarSearchIntent("busca en stellar bazaar"), "");
});

test("a Bazaar search yields a read-only discovery action, never a payment intent", () => {
  const reply = buildAgentReply("Busca en stellar bazaar informes de sitios web");
  assert.equal(reply.x402Intent, undefined);
  assert.equal(reply.defindexIntent, undefined);
  assert.equal(reply.actions.length, 1);
  assert.deepEqual(reply.actions[0].bazaarAction, { query: "informes sitios web" });
  assert.match(reply.content, /solo lectura|read-only|somente leitura/);
});

test("an empty Bazaar query asks for a target without calling the catalog", () => {
  const reply = buildAgentReply("busca en stellar bazaar");
  assert.equal(reply.actions.length, 0);
  assert.equal(reply.actions[0]?.bazaarAction, undefined);
});

test("the existing x402 Bazaar connection answer is preserved", () => {
  const reply = buildAgentReply("Conéctame con x402 Bazaar");
  assert.equal(reply.connection?.name, "x402 Bazaar");
  assert.equal(reply.actions.some((action) => action.bazaarAction), false);
});
