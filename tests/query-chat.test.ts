import assert from "node:assert/strict";
import test from "node:test";
import { executeChatRead, parseChatReadRequest } from "../app/queries/chat";
import { getReadQuery, readQueryDefinitions } from "../app/queries/registry";
import { createEcosystemQueries } from "../app/queries/ecosystem";
import { executeWebReadQuery } from "../app/queries/adapters";

test("every shared read is accessible through explicit locale commands without hidden execution", () => {
  for (const definition of readQueryDefinitions) {
    for (const command of ["consulta", "query", "consultar"]) {
      assert.deepEqual(parseChatReadRequest(`/${command} ${definition.toolName}`), { id: definition.toolName, input: {} });
    }
  }
  assert.deepEqual(parseChatReadRequest('/query get_market_quotes {"assets":[{"query":"USDC","network":"solana"}]}'), {
    id: "get_market_quotes", input: { assets: [{ query: "USDC", network: "solana" }] },
  });
});

test("read commands validate structured input and keep unknown commands inside a nonexecuting error path", async () => {
  for (const input of ["[]", "null", "42", '"text"', "{bad json}"]) {
    assert.deepEqual(parseChatReadRequest(`/consulta personal.wallets ${input}`), { invalid: "invalid_read_query" });
  }
  const request = parseChatReadRequest('/query read_admin_wallets {"userId":"someone-else"}')!;
  const result = await executeChatRead(request, "owner-a", "es");
  assert.match(result.content, /consulta no está disponible/i);
  assert.deepEqual(result.actions, []);
  assert.doesNotMatch(result.content, /someone-else|read_admin_wallets/);
  const ownerOverride = parseChatReadRequest('/consulta personal.wallets {"userId":"owner-b"}')!;
  const rejected = await executeChatRead(ownerOverride, "owner-a", "en");
  assert.match(rejected.content, /query is unavailable/i);
  assert.deepEqual(rejected.actions, []);
});

test("natural read routing separates token identity, blockchain TVL and personal Testnet wallets", () => {
  assert.deepEqual(parseChatReadRequest("Precio USDC en Solana"), { id: "offchain.market.quote", input: { assets: [{ query: "USDC", network: "solana" }] } });
  const comparison = parseChatReadRequest("Compara TVL de Solana y Base");
  assert.ok(comparison && "id" in comparison);
  assert.equal(comparison.id, "offchain.defillama.chains");
  assert.equal(comparison.input.sortBy, "tvl");
  assert.deepEqual(parseChatReadRequest("Dame mis wallets"), { id: "personal.wallets", input: {} });
  assert.deepEqual(parseChatReadRequest("Muéstrame mis saldos"), { id: "personal.wallets.balances", input: {} });
  assert.deepEqual(parseChatReadRequest("Show my watchlist"), { id: "personal.watchlist", input: {} });
  assert.deepEqual(parseChatReadRequest("Show my connections"), { id: "personal.connections", input: {} });
  assert.deepEqual(parseChatReadRequest("Qué sabes de mí"), { id: "personal.memory", input: {} });
  assert.deepEqual(parseChatReadRequest("What do you know about me"), { id: "personal.memory", input: {} });
  assert.deepEqual(parseChatReadRequest("Mostre minha memória"), { id: "personal.memory", input: {} });
  assert.deepEqual(parseChatReadRequest("Qué puedo hacer"), { id: "offchain.capabilities.list", input: {} });
  assert.deepEqual(parseChatReadRequest("¿Qué puedo hacer?"), { id: "offchain.capabilities.list", input: {} });
  assert.deepEqual(parseChatReadRequest("Cotiza 1 XLM a USDC en Soroswap"), { id: "stellar.soroswap.quote", input: { amount: "1", assetIn: "XLM", assetOut: "USDC" } });
  assert.deepEqual(parseChatReadRequest("Cote 2 USDC para XLM na Soroswap"), { id: "stellar.soroswap.quote", input: { amount: "2", assetIn: "USDC", assetOut: "XLM" } });
  assert.deepEqual(parseChatReadRequest("CCTP readiness"), { id: "circle.cctp.readiness.read", input: {} });
  assert.deepEqual(parseChatReadRequest("CCTP fees"), { id: "circle.cctp.fees.read", input: {} });
});

test("financial actions, authorization and watchlist writes are not captured as reads", () => {
  for (const message of [
    "Swap 1 XLM to USDC on Soroswap", "Deposita 1 XLM en DeFindex", "Send 0.001 AVAX to my other wallet",
    "Fund my wallet with Testnet XLM", "Add SOL to my watchlist", "Remove ETH from my watchlist", "Connect me to Notion",
    "pay 20 USDC to another account at the current price", "Please pay 20 USDC at the current price",
    "pay John at the current price", "Please pay John", "pay20USDC", "payJohn",
    "precio de PAY y quiero transferir 20 USDC", "preço de PAY e envie 20 USDC",
  ]) assert.equal(parseChatReadRequest(message), null, message);
});

test("normal catalog price questions route through the shared market reader without canonical ticker restrictions", () => {
  for (const asset of ["PAY", "AI", "unknown-pilot-token"]) {
    for (const message of [`¿Cuál es el precio de ${asset}?`, `What is the price of ${asset}?`, `Qual é o preço de ${asset}?`]) {
      assert.deepEqual(parseChatReadRequest(message), { id: "offchain.market.quote", input: { assets: [{ query: asset }] } }, message);
    }
  }
  for (const message of ["¿Cuál es el precio de USDC en Solana?", "What is the price of USDC on Solana?", "Qual é o preço de USDC na Solana?"]) {
    assert.deepEqual(parseChatReadRequest(message), { id: "offchain.market.quote", input: { assets: [{ query: "USDC", network: "solana" }] } }, message);
  }
  for (const message of ["PAY price", "PAY precio", "PAY preço"]) {
    assert.deepEqual(parseChatReadRequest(message), { id: "offchain.market.quote", input: { assets: [{ query: "PAY" }] } }, message);
  }
});

test("public NFT address selection is distinct from an owner-selected personal position", async () => {
  const collection = "0x1111111111111111111111111111111111111111";
  const publicRead = getReadQuery("avalanche.nft.collection_read");
  assert.equal(publicRead.inputSchema.safeParse({ collection }).success, true);
  const ownedRead = getReadQuery("avalanche.aave.position.read");
  assert.equal(ownedRead.inputSchema.safeParse({ wallet: collection }).success, false);
  const definitions = createEcosystemQueries({
    wallets: async () => [{ userId: "owner-a", chainType: "ethereum", network: "avalanche:fuji", status: "active", address: "0x2222222222222222222222222222222222222222" }],
    aavePosition: async () => { assert.fail("A foreign requested address must never reach its provider"); },
  });
  const constrained = await executeWebReadQuery(ownedRead.id, { requestedAddress: collection }, "owner-a", "es", definitions);
  assert.deepEqual(constrained, { status: "forbidden", code: "requested_address_mismatch", readOnly: true });
});

test("unavailable and clarification responses use all three requested locales without side-effect buttons", async () => {
  for (const [locale, networkMessage, unknownMessage] of [
    ["es", /Indica la red Mainnet/, /consulta no está disponible/],
    ["en", /Specify the Mainnet network/, /query is unavailable/],
    ["pt", /Indique a rede Mainnet/, /consulta está indisponível/],
  ] as const) {
    const network = await executeChatRead({ invalid: "network_required" }, "owner-a", locale);
    assert.match(network.content, networkMessage);
    assert.deepEqual(network.actions, []);
    const unknown = await executeChatRead({ id: "unknown.read", input: {} }, "owner-a", locale);
    assert.match(unknown.content, unknownMessage);
    assert.deepEqual(unknown.actions, []);
  }
});
