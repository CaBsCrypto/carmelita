import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { groupAvalancheCapabilities, listAvalancheCapabilities, planAvalancheCapability } from "../app/avalanche/capability-registry";

test("Avalanche registry separates reads from approval-bound financial actions", () => {
  const capabilities = listAvalancheCapabilities();
  assert.equal(capabilities.length, 20);
  assert.equal(capabilities.find((item) => item.id === "dexalot.quote.read")?.approval, "none");
  assert.equal(capabilities.find((item) => item.id === "x402.report.purchase")?.approval, "privy_single");
  assert.equal(capabilities.find((item) => item.id === "pangolin.swap.avax_to_usdc")?.approval, "privy_single");
  assert.equal(capabilities.find((item) => item.id === "circle.cctp.fuji_to_stellar")?.approval, "privy_dual");
});

test("Avalanche capabilities are grouped into complete product sections", () => {
  const groups = groupAvalancheCapabilities();
  const flattened = groups.flatMap((group) => group.capabilities);
  assert.deepEqual(new Set(flattened.map((item) => item.id)), new Set(listAvalancheCapabilities().map((item) => item.id)));
  assert.equal(flattened.length, listAvalancheCapabilities().length);
  assert.equal(groups.find((group) => group.category === "payments")?.capabilities[0]?.id, "x402.report.purchase");
  assert.equal(groups.find((group) => group.category === "cross_chain")?.capabilities[0]?.id, "circle.cctp.fuji_to_stellar");
  assert.equal(listAvalancheCapabilities().find((item) => item.id === "pangolin.swap.avax_to_usdc")?.category, "trading");
});
test("x402 preflight requires Fuji USDC but not AVAX", () => {
  const plan = planAvalancheCapability("x402.report.purchase", { authenticated: true, evmWallet: true });
  assert.deepEqual(plan.blockers, ["fuji_usdc"]);
  assert.equal(plan.approvalRequired, true);
  assert.equal(plan.executable, false);
});

test("CCTP preflight enumerates cross-chain blockers deterministically", () => {
  const plan = planAvalancheCapability("circle.cctp.fuji_to_stellar", { authenticated: true, evmWallet: true, stellarWallet: true });
  assert.deepEqual(plan.blockers, ["fuji_avax", "fuji_usdc", "stellar_usdc_trustline"]);
  assert.equal(plan.boundary, "prepare_then_explicit_privy_approval");
});

test("personal MCP exposes discovery and planning without execution", async () => {
  const source = await readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8");
  assert.match(source, /list_avalanche_capabilities/);
  assert.match(source, /plan_avalanche_capability/);
  assert.match(source, /readOnlyHint: true/);
  const section = source.slice(source.indexOf("list_avalanche_capabilities"));
  assert.doesNotMatch(section, /sendTransaction|signTypedData|broadcast\s*\(|privateKey/i);
});

test("capability API is authenticated and same-origin", async () => {
  const source = await readFile(new URL("../app/api/agent/avalanche/capabilities/route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyPrivyAccessToken/);
  assert.match(source, /sameOrigin/);
  assert.doesNotMatch(source, /sendTransaction|signTypedData|privateKey/i);
});


test("capability parser supports English, Spanish and Portuguese", async () => {
  const { parseAvalancheCapabilitiesIntent } = await import("../app/connectors/avalanche-read-intents");
  assert.equal(parseAvalancheCapabilitiesIntent("¿Qué puedo hacer en Avalanche?")?.operation, "capabilities");
  assert.equal(parseAvalancheCapabilitiesIntent("¿Qué podemos hacer en Avalanche?")?.operation, "capabilities");
  assert.equal(parseAvalancheCapabilitiesIntent("What can I do on Fuji?")?.operation, "capabilities");
  assert.equal(parseAvalancheCapabilitiesIntent("What can we do on Avalanche?")?.operation, "capabilities");
  assert.equal(parseAvalancheCapabilitiesIntent("O que podemos fazer na Avalanche?")?.operation, "capabilities");
  assert.equal(parseAvalancheCapabilitiesIntent("Show my Stellar wallet"), null);
});

test("a Dexalot quote is not advertised as live while the upstream circuit breaker is active", () => {
  const quote = listAvalancheCapabilities().find((item) => item.id === "dexalot.quote.read")!;

  assert.notEqual(quote.status, "live");
  assert.match(quote.evidence, /QP-002|Circuit Breaker/);
  assert.match(quote.nextAction, /Blocked upstream/);
  // The nextAction must not invite the user to run the call that is known to fail.
  assert.doesNotMatch(quote.nextAction, /Ask Carmelita to quote/);
});

test("the pair catalog is not taken down with the quote endpoint", () => {
  const markets = listAvalancheCapabilities().find((item) => item.id === "dexalot.markets.list")!;
  assert.equal(markets.status, "live");
});

test("a planned capability is never executable, even with every requirement satisfied", () => {
  const plan = planAvalancheCapability("dexalot.quote.read", { authenticated: true });

  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.executable, false, "status alone must gate execution");
});

test("Wave 1 read capabilities are planned-free reads that never require approval", () => {
  const reads = [
    "avalanche.skills.search",
    "predictions.sector.read",
    "predictions.markets.read",
    "avalanche.aave.market.read",
    "avalanche.aave.position.read",
    "avalanche.nft.collection_read",
    "avalanche.nft.holder_distribution",
    "avalanche.nft.provenance_read",
    "avalanche.nft.venue_status",
    "defillama.yields.read",
    "lfj.swap.quote.read",
  ] as const;
  for (const id of reads) {
    const context = id === "avalanche.aave.position.read" ? { authenticated: true, evmWallet: true } : { authenticated: true };
    const plan = planAvalancheCapability(id, context);
    assert.equal(plan.approvalRequired, false, `${id} must be approval-free`);
    assert.equal(plan.boundary, "read_only", `${id} must stay in the read boundary`);
    assert.equal(plan.executable, true, `${id} must be executable when authenticated`);
  }
});

test("mainnet-scoped reads disclose their data scope instead of claiming Fuji", () => {
  const capabilities = listAvalancheCapabilities();
  const mainnetScoped = capabilities.filter((item) => item.dataScope !== "fuji_onchain");
  assert.ok(mainnetScoped.length >= 3, "mainnet/offchain reads must be labeled");
  for (const item of mainnetScoped) {
    assert.equal(item.operation, "read", `${item.id} must be read-only`);
  }
});

test("floor price row is honest about having no source", () => {
  const floor = listAvalancheCapabilities().find((item) => item.id === "avalanche.nft.floor_read")!;
  assert.equal(floor.status, "planned");
  assert.match(floor.evidence, /Reservoir|SimpleHash|401/);
  assert.match(floor.nextAction, /key|Blocked/);
});
