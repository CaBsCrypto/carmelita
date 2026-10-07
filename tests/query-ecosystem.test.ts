import assert from "node:assert/strict";
import test from "node:test";
import { createEcosystemQueries, type EcosystemDependencies } from "../app/queries/ecosystem";
import { executeQueryDefinition, type QueryDefinition } from "../app/queries/types";
import { readFujiNftVenue } from "../app/queries/ecosystem-venue";

const principal = { userId: "owner-a", scopes: ["agent:read"] };
const owned = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
function query(id: string, overrides: Partial<EcosystemDependencies> = {}): QueryDefinition {
  const found = createEcosystemQueries(overrides).find((row) => row.id === id);
  assert.ok(found, `missing query ${id}`);
  return found;
}
function rpc(result: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { headers: { "content-type": "application/json" } });
}

test("ecosystem exposes catalog reads only, preserving the skills contract", () => {
  const definitions = createEcosystemQueries({ bazaarEnabled: () => true });
  assert.equal(definitions.length, 24);
  assert.equal(new Set(definitions.map((row) => row.id)).size, definitions.length);
  for (const definition of definitions) {
    assert.equal(definition.scope, "agent:read");
    assert.doesNotMatch(definition.id, /(?:\.book$|\.cancel$|\.transfer$|\.purchase$|\.deposit|prepare)/);
    assert.equal(definition.toolName, definition.id === "avalanche.skills.search" ? "search_avax_skills" : `read_${definition.id.replaceAll(".", "_")}`);
  }
});

test("all ecosystem reads reject anonymous and insufficient scope before calling providers", async () => {
  let calls = 0;
  const read = query("predictions.sector.read", { predictionSector: async () => { calls++; return {}; } });
  await assert.rejects(executeQueryDefinition(read, {}, undefined), /authorization_required/);
  await assert.rejects(executeQueryDefinition(read, {}, { userId: "owner-a", scopes: ["agent:context"] }), /insufficient_scope/);
  assert.equal(calls, 0);
});

test("the Aave position is resolved from the authorized owner's existing active Fuji wallet", async () => {
  const calls: string[] = [];
  const read = query("avalanche.aave.position.read", {
    wallets: async (userId) => {
      assert.equal(userId, "owner-a");
      return [
        { userId: "owner-b", address: other, chainType: "ethereum", network: "avalanche:fuji", status: "active" },
        { userId, address: other, chainType: "ethereum", network: "base:sepolia", status: "active" },
        { userId, address: owned, chainType: "ethereum", network: "avalanche:fuji", status: "active" },
      ];
    },
    aavePosition: async (wallet) => { calls.push(wallet); return { wallet, rows: [], supplied: [], readOnly: true }; },
  });
  const result = await executeQueryDefinition(read, {}, principal) as { wallet: string };
  assert.equal(result.wallet, owned);
  assert.deepEqual(await executeQueryDefinition(read, { requestedAddress: other }, principal), { status: "forbidden", code: "requested_address_mismatch", readOnly: true });
  await assert.rejects(executeQueryDefinition(read, { wallet: other }, principal));
  await assert.rejects(executeQueryDefinition(read, { userId: "owner-b" }, principal));
  assert.deepEqual(calls, [owned]);
});

test("a missing or pending Fuji wallet remains missing and does not invoke its provider", async () => {
  let calls = 0;
  const read = query("avalanche.aave.position.read", {
    wallets: async () => [{ userId: "owner-a", address: owned, chainType: "ethereum", network: "avalanche:fuji", status: "pending" }],
    aavePosition: async () => { calls++; return {}; },
  });
  assert.deepEqual(await executeQueryDefinition(read, {}, principal), { status: "registration_required", code: "existing_fuji_wallet_required", readOnly: true });
  assert.equal(calls, 0);
});

test("Notion search uses the authenticated owner's connection and never a requested workspace", async () => {
  const calls: unknown[] = [];
  const read = query("offchain.notion.search", { notion: async (...input) => { calls.push(input); return { tool: "notion-search", text: "Private workspace data" }; } });
  assert.deepEqual(await executeQueryDefinition(read, { query: " roadmap " }, principal, "pt"), { tool: "notion-search", text: "Private workspace data" });
  await assert.rejects(executeQueryDefinition(read, { query: "roadmap", userId: "owner-b" }, principal));
  assert.deepEqual(calls, [["owner-a", "roadmap"]]);
});

test("Notion and UNBLCK missing connections return only a visible next action", async () => {
  for (const [id, dependency, code] of [
    ["offchain.notion.search", "notion", "notion_reauth_required"],
    ["offchain.unblck.hub_state", "unblck", "unblck_link_required"],
  ] as const) {
    const read = query(id, { [dependency]: async () => { throw new Error(code); } });
    const result = await executeQueryDefinition(read, dependency === "notion" ? { query: "roadmap" } : {}, principal) as Record<string, unknown>;
    assert.equal(result.status, "connection_required");
    assert.match(String(result.connectUrl), /^https:\/\/[^/?#]+\/agent$/);
    assert.equal(result.code, code);
    assert.equal(result.readOnly, true);
    assert.equal("token" in result, false);
  }
});

test("UNBLCK reads the owner-bound hub state with no channel identity selector", async () => {
  const calls: string[] = [];
  const state = { bookings: ["2026-11-10"], credits: { total: 4, used: 1, remaining: 3 }, open_days: [1, 2], tier: "member", passes: [] };
  const read = query("offchain.unblck.hub_state", { unblck: async (id) => { calls.push(id); return state; } });
  assert.deepEqual(await executeQueryDefinition(read, {}, principal), state);
  await assert.rejects(executeQueryDefinition(read, { channel: "whatsapp", channelUserId: "someone-else" }, principal));
  assert.deepEqual(calls, ["owner-a"]);
});

test("Dexalot pair availability is not mistaken for quote availability", async () => {
  const pairs = query("dexalot.markets.list", { dexalotPairs: async () => ({ pairs: ["AVAX/USDC"], readOnly: true }) });
  const quotes = query("dexalot.quote.read", { dexalotQuote: async () => { throw new Error("dexalot_quote_invalid"); } });
  assert.deepEqual(await executeQueryDefinition(pairs, {}, principal), { pairs: ["AVAX/USDC"], readOnly: true });
  const result = await executeQueryDefinition(quotes, { amount: "1", assetIn: "avax", assetOut: "usdc" }, principal) as Record<string, unknown>;
  assert.equal(result.status, "unavailable");
  assert.equal(result.code, "dexalot_quote_invalid");
  await assert.rejects(executeQueryDefinition(quotes, { amount: "0", assetIn: "AVAX", assetOut: "USDC" }, principal));
  await assert.rejects(executeQueryDefinition(quotes, { amount: "1", assetIn: "USDC", assetOut: "usdc" }, principal));
});

test("NFT public addresses and indexer disagreement are preserved rather than attached to the owner", async () => {
  const read = query("avalanche.nft.provenance_read", { nftProvenance: async (collection, tokenId) => ({ collection, tokenId, owner: owned, routescanOwner: other, indexersAgree: false }) });
  assert.deepEqual(await executeQueryDefinition(read, { collection: other, tokenId: "7" }, principal), { collection: other, tokenId: "7", owner: owned, routescanOwner: other, indexersAgree: false });
  await assert.rejects(executeQueryDefinition(read, { collection: "not-address", tokenId: "7" }, principal));
  await assert.rejects(executeQueryDefinition(read, { collection: other, tokenId: "-7" }, principal));
});

test("NFT floor reports genuine absence of a source without returning zero", async () => {
  const result = await executeQueryDefinition(query("avalanche.nft.floor_read"), {}, principal) as Record<string, unknown>;
  assert.equal(result.status, "unavailable");
  assert.equal(result.floorPrice, null);
  assert.equal(result.code, "nft_floor_source_unavailable");
});

test("provider errors are sanitized without disclosing credentials or arbitrary upstream messages", async () => {
  const read = query("predictions.markets.read", { predictionMarkets: async () => { throw new Error("Authorization: Bearer sensitive-value"); } });
  const result = await executeQueryDefinition(read, {}, principal);
  assert.doesNotMatch(JSON.stringify(result), /Authorization|Bearer|sensitive/);
  assert.equal((result as Record<string, unknown>).code, "provider_read_unavailable");
  for (const unsafe of ["notion_private_workspace_secret", "travala_private_customer_123", "ecosystem_http_401_private_token", "unblck_1234"]) {
    const prefixed = query("predictions.markets.read", { predictionMarkets: async () => { throw new Error(unsafe); } });
    const response = await executeQueryDefinition(prefixed, {}, principal);
    assert.equal((response as Record<string, unknown>).code, "provider_read_unavailable");
    assert.equal(JSON.stringify(response).includes(unsafe), false);
  }
  for (const safe of ["ecosystem_http_429", "dexalot_http_400", "avalanche_mcp_rpc_-32602", "unblck_403"]) {
    const known = query("predictions.markets.read", { predictionMarkets: async () => { throw new Error(safe + ":private detail"); } });
    const response = await executeQueryDefinition(known, {}, principal);
    assert.equal((response as Record<string, unknown>).code, safe);
    assert.doesNotMatch(JSON.stringify(response), /private detail/);
  }
});

test("connection requirements return a valid absolute Carmelita continuation for either channel", async () => {
  const previousOrigin = process.env.CARMELITA_PUBLIC_ORIGIN;
  const read = query("offchain.notion.search", { notion: async () => { throw new Error("notion_not_connected"); } });
  try {
    process.env.CARMELITA_PUBLIC_ORIGIN = "https://carmelita-qa.example";
    const configured = await executeQueryDefinition(read, { query: "guide" }, principal) as Record<string, unknown>;
    assert.equal(configured.connectUrl, "https://carmelita-qa.example/agent");
    for (const invalid of ["http://insecure.example", "https://secret@unsafe.example", "https://unsafe.example/?token=private"]) {
      process.env.CARMELITA_PUBLIC_ORIGIN = invalid;
      const fallback = await executeQueryDefinition(read, { query: "guide" }, principal) as Record<string, unknown>;
      assert.equal(fallback.connectUrl, "https://carmelita.browns.studio/agent");
      assert.doesNotMatch(String(fallback.connectUrl), /secret|token|private/);
    }
  } finally {
    if (previousOrigin === undefined) delete process.env.CARMELITA_PUBLIC_ORIGIN;
    else process.env.CARMELITA_PUBLIC_ORIGIN = previousOrigin;
  }
});

test("Mainnet yields and LFJ liveness labels survive the common adapter", async () => {
  const yields = query("defillama.yields.read", { yields: async () => ({ network: "mainnet (read-only)", pools: [{ apy: 5 }], readOnly: true }) });
  assert.equal((await executeQueryDefinition(yields, {}, principal) as Record<string, unknown>).network, "mainnet (read-only)");
  const lfj = query("lfj.swap.quote.read", { lfjQuote: async (input) => ({ ...input, livenessNote: "LFJ output token is not Circle USDC", readOnly: true }) });
  assert.deepEqual(await executeQueryDefinition(lfj, { amount: "1", assetIn: "avax", assetOut: "usdc" }, principal), { amountIn: "1", assetIn: "AVAX", assetOut: "USDC", livenessNote: "LFJ output token is not Circle USDC", readOnly: true });
});

test("Travala retains date and guest validation and does not silently book", async () => {
  let calls = 0;
  const read = query("offchain.travala.hotel_search", { travel: async (input) => { calls++; return { hotels: [], searchedAt: "now", ...input }; } });
  const input = { location: "Santiago", checkIn: "2999-11-10", checkOut: "2999-11-12", guests: 2 };
  assert.equal((await executeQueryDefinition(read, input, principal) as Record<string, unknown>).location, "Santiago");
  await assert.rejects(executeQueryDefinition(read, { ...input, checkOut: input.checkIn }, principal));
  await assert.rejects(executeQueryDefinition(read, { ...input, guests: 9 }, principal));
  await assert.rejects(executeQueryDefinition(read, { ...input, book: true }, principal));
  assert.equal(calls, 1);
});

test("Travala missing prices remain unavailable, while a genuine zero is retained", async () => {
  const read = query("offchain.travala.hotel_search", { travel: async () => ({ hotels: [
    { name: "Unknown tariff", totalPriceUSD: 0, pricePerNightUSD: 0 },
    { name: "Known tariff", totalPrice: 240, pricePerNight: 120 },
    { name: "Actual zero", totalPriceAllRoomsUSD: 0, totalPricePerNightAllRoomsUSD: 0 },
  ] }) });
  const result = await executeQueryDefinition(read, { location: "Santiago", checkIn: "2999-11-10", checkOut: "2999-11-12", guests: 2 }, principal) as { hotels: Record<string, unknown>[] };
  assert.equal(result.hotels[0]?.totalPriceUSD, null);
  assert.equal(result.hotels[0]?.pricePerNightUSD, null);
  assert.equal(result.hotels[1]?.totalPriceUSD, 240);
  assert.equal(result.hotels[1]?.pricePerNightUSD, 120);
  assert.equal(result.hotels[2]?.totalPriceUSD, 0);
});

test("Bazaar remains absent when disabled and only searches the catalog when enabled", async () => {
  let calls = 0;
  assert.equal(createEcosystemQueries({ bazaarEnabled: () => false }).some((row) => row.id === "stellar.bazaar.discovery"), false);
  const read = query("stellar.bazaar.discovery", { bazaarEnabled: () => true, bazaar: async (term) => { calls++; return { query: term, offers: [], partialResults: true }; } });
  assert.deepEqual(await executeQueryDefinition(read, { query: "report" }, principal), { query: "report", offers: [], partialResults: true });
  await assert.rejects(executeQueryDefinition(read, { query: "report", consume: true }, principal));
  assert.equal(calls, 1);
});

test("NFT venue uses eth_getCode and distinguishes unavailable probes from false", async () => {
  const methods: string[] = [];
  const result = await readFujiNftVenue(async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    methods.push(request.method);
    return request.method === "eth_getCode" ? rpc("0x6000") : rpc(`0x${"0".repeat(63)}1`);
  });
  assert.equal(result.status, "ok");
  assert.equal(result.seaport1_6.deployed, true);
  assert.equal(result.joepegs.strategyWhitelisted, true);
  assert.equal(result.seaport1_6.activity, "not_measured");
  assert.deepEqual(methods.sort(), ["eth_call", "eth_getCode"]);
  const failed = await readFujiNftVenue(async () => { throw new Error("offline"); });
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.seaport1_6.deployed, null);
  assert.equal(failed.joepegs.strategyWhitelisted, null);
});
