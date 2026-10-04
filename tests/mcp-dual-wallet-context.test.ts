import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";

function withEvmExpansion(enabled: boolean, run: () => void) {
  const keys = ["VERCEL_ENV", "CARMELITA_PREVIEW_ISOLATED", "CARMELITA_EVM_TESTNET_EXPANSION_ENABLED"];
  const original = keys.map((key) => process.env[key]);
  process.env.VERCEL_ENV = "preview";
  process.env.CARMELITA_PREVIEW_ISOLATED = "true";
  process.env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED = String(enabled);
  try { run(); } finally {
    for (const [index, key] of keys.entries()) {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    }
  }
}

const publicFiveWallets = [
  { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
  { address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", chainType: "solana", network: "solana:devnet", status: "active" },
  ...["avalanche:fuji", "bnb:testnet", "base:sepolia"].map((network) => ({ address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network, status: "active", id: "privy-canonical-evm-id", walletId: "privy-canonical-evm-id", userId: "did:privy:owner" })),
];

test("registered pending wallets remain explicit and do not request onboarding", () => {
  const pending = { ...publicFiveWallets[0], status: "pending" };
  const context = buildMcpWalletContext([pending]);
  assert.equal(context.walletsByNetwork.stellarTestnet, null);
  assert.equal(context.walletRegistration.registered, true);
  assert.equal(context.walletRegistration.onboardingRequired, false);
  assert.deepEqual(context.walletRegistration.pendingActivation, [{ ...pending,
    registrationState: "pending_registration", registrationStatusScope: "internal_registry",
    explorerUrl: `https://stellar.expert/explorer/testnet/account/${pending.address}` }]);
  assert.deepEqual(context.walletRegistration.pendingRegistration, context.walletRegistration.pendingActivation);
  assert.deepEqual(context.walletRegistration.statusSemantics, {
    scope: "internal_registry", active: "registered", pending: "pending_registration", onChainActivity: "not_inferred", balance: "not_inferred",
  });
  assert.ok(!context.walletRegistration.unregisteredNetworks.includes("stellar:testnet"));
});

test("an account without registered wallets gets onboarding guidance without invented addresses", () => {
  const context = buildMcpWalletContext([]);
  assert.equal(context.walletRegistration.registered, false);
  assert.equal(context.walletRegistration.onboardingRequired, true);
  assert.match(context.walletRegistration.guidance!, /Carmelita/);
  assert.deepEqual(context.walletRegistration.pendingActivation, []);
  assert.deepEqual(context.wallets, []);
});

test("MCP wallet context names all persisted testnet wallets deterministically", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active" },
    { address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", chainType: "solana", network: "solana:devnet", status: "active" },
  ]);
  assert.equal(context.walletsByNetwork.stellarTestnet?.network, "stellar:testnet");
  assert.equal(context.walletsByNetwork.avalancheFuji?.network, "avalanche:fuji");
  assert.equal(context.walletsByNetwork.solanaDevnet?.network, "solana:devnet");
  assert.deepEqual(context.walletReadiness, { complete: true, missingNetworks: [], suppressedStaleWallets: 0 });
  assert.doesNotMatch(JSON.stringify(context), /privateKey|secret|walletId/i);
});

test("MCP wallet context reports missing Fuji instead of inventing it", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
  ]);
  assert.equal(context.walletsByNetwork.avalancheFuji, null);
  assert.deepEqual(context.walletReadiness.missingNetworks, ["avalanche:fuji", "solana:devnet"]);
});

test("MCP reconnect view preserves active Stellar and suppresses its stale pending duplicate", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { address: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBEZQ", chainType: "stellar", network: "stellar:testnet", status: "pending" },
    { address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active" },
    { address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", chainType: "solana", network: "solana:devnet", status: "active" },
  ]);

  assert.equal(context.walletsByNetwork.stellarTestnet?.status, "active");
  assert.equal(context.wallets.some((wallet) => wallet.status === "pending"), false);
  assert.equal(context.walletReadiness.complete, true);
  assert.equal(context.walletReadiness.suppressedStaleWallets, 1);
});

test("MCP projects one canonical EVM address into three enabled networks without exposing provider IDs", () => {
  withEvmExpansion(true, () => {
    const context = buildMcpWalletContext(publicFiveWallets);
    assert.equal(context.walletReadiness.complete, true);
    assert.deepEqual(context.walletReadiness.missingNetworks, []);
    assert.equal(context.wallets.length, 5);
    for (const name of ["avalancheFuji", "bnbTestnet", "baseSepolia"] as const) assert.equal(context.walletsByNetwork[name]?.address, publicFiveWallets[2].address);
    for (const wallet of context.wallets) {
      assert.deepEqual(Object.keys(wallet).sort(), ["address", "chainType", "explorerUrl", "network", "registrationState", "registrationStatusScope", "status"]);
      assert.equal(wallet.status, "active");
      assert.equal(wallet.registrationState, "registered");
      assert.equal(wallet.registrationStatusScope, "internal_registry");
    }
    assert.doesNotMatch(JSON.stringify(context), /privy-canonical|did:privy:|walletId|userId/);
  });
});

test("MCP readiness requires both added network bindings when expansion is enabled", () => {
  withEvmExpansion(true, () => {
    const context = buildMcpWalletContext(publicFiveWallets.filter((wallet) => wallet.network !== "bnb:testnet" && wallet.network !== "base:sepolia"));
    assert.equal(context.walletReadiness.complete, false);
    assert.deepEqual(context.walletReadiness.missingNetworks, ["bnb:testnet", "base:sepolia"]);
    assert.equal(context.walletsByNetwork.bnbTestnet, null);
    assert.equal(context.walletsByNetwork.baseSepolia, null);
  });
});

test("MCP expansion rollback hides added bindings and excludes them from readiness", () => {
  withEvmExpansion(false, () => {
    const context = buildMcpWalletContext(publicFiveWallets);
    assert.equal(context.walletReadiness.complete, true);
    assert.equal(context.wallets.length, 3);
    assert.equal(context.walletsByNetwork.bnbTestnet, null);
    assert.equal(context.walletsByNetwork.baseSepolia, null);
  });
});

test("MCP never treats a mismatched wallet family as an enabled network binding", () => {
  withEvmExpansion(true, () => {
    const context = buildMcpWalletContext([{ address: publicFiveWallets[0].address, network: "bnb:testnet", chainType: "stellar", status: "active" }]);
    assert.equal(context.wallets.length, 0);
    assert.equal(context.walletsByNetwork.bnbTestnet, null);
    assert.ok(context.walletReadiness.missingNetworks.includes("bnb:testnet"));
  });
});
