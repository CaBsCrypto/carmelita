import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";
import { enabledEvmNetworks, enabledWalletNetworks, getWalletNetwork, isTempoTestnetEnabled, isWalletNetworkEnabled } from "../app/wallets/networks";

const enabled = { CARMELITA_TEMPO_TESTNET_ENABLED: "true", CARMELITA_PREVIEW_ISOLATED: "true", VERCEL_ENV: "preview" };

test("Tempo requires explicit isolated activation and always rejects production", () => {
  assert.equal(isTempoTestnetEnabled({}), false);
  assert.equal(isTempoTestnetEnabled(enabled), true);
  assert.equal(isTempoTestnetEnabled({ ...enabled, VERCEL_ENV: undefined, NODE_ENV: "test" }), true);
  for (const override of [
    { CARMELITA_TEMPO_TESTNET_ENABLED: undefined }, { CARMELITA_TEMPO_TESTNET_ENABLED: "TRUE" },
    { CARMELITA_PREVIEW_ISOLATED: undefined }, { CARMELITA_PREVIEW_ISOLATED: "false" },
    { VERCEL_ENV: "production" }, { VERCEL_ENV: "development" },
    { VERCEL_TARGET_ENV: "production" },
    { VERCEL_ENV: undefined, NODE_ENV: "production" },
  ]) assert.equal(isTempoTestnetEnabled({ ...enabled, ...override }), false);
});

test("enabled Tempo advertises TIP-20 reading and no native gas assumption", async () => {
  await withTempoEnvironment(async () => {
    const network = getWalletNetwork("tempo:moderato");
    assert.equal(network.chainId, 42431);
    assert.equal(network.testnet, true);
    assert.equal(network.balanceKind, "tip20");
    assert.equal(network.feeModel, "tip20");
    assert.equal(network.readOnly, true);
    assert.equal(network.balanceToken?.decimals, 6);
    assert.equal(network.balanceToken?.address, "0x20c0000000000000000000000000000000000000");
    assert.ok(enabledEvmNetworks().some(item => item.id === network.id));
    assert.equal(isWalletNetworkEnabled("tempo:mainnet"), false);
    assert.equal(isWalletNetworkEnabled("eip155:4217"), false);
  });
});

test("rollback hides Tempo without changing persisted identity or existing networks", async () => {
  await withTempoEnvironment(async () => {
    const address = `0x${"a".repeat(40)}`;
    const persisted = [
      { address, chainType: "ethereum", network: "tempo:moderato", status: "active" },
      { address, chainType: "ethereum", network: "avalanche:fuji", status: "active" },
    ];
    const before = structuredClone(persisted);
    const enabledContext = buildMcpWalletContext(persisted);
    assert.ok(enabledContext.wallets.some(item => item.network === "tempo:moderato"));
    const existingNetworks = enabledWalletNetworks().filter(item => item.id !== "tempo:moderato").map(item => item.id);
    process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "false";
    assert.equal(isWalletNetworkEnabled("tempo:moderato"), false);
    assert.deepEqual(enabledWalletNetworks().map(item => item.id), existingNetworks);
    const disabledContext = buildMcpWalletContext(persisted);
    assert.deepEqual(disabledContext.wallets.map(item => item.network), ["avalanche:fuji"]);
    assert.deepEqual(persisted, before);
    process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "true";
    assert.deepEqual(buildMcpWalletContext(persisted).wallets, enabledContext.wallets);
  });
});

async function withTempoEnvironment(run: () => Promise<void>) {
  const keys = ["CARMELITA_TEMPO_TESTNET_ENABLED", "CARMELITA_PREVIEW_ISOLATED", "VERCEL_ENV", "VERCEL_TARGET_ENV", "NODE_ENV", "CARMELITA_EVM_TESTNET_EXPANSION_ENABLED"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, enabled);
  delete process.env.VERCEL_TARGET_ENV;
  delete process.env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED;
  try { await run(); } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
