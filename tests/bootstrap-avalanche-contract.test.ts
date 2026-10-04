import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";

test("first-party bootstrap provisions Fuji additively and retains Stellar", async () => {
  const source = await readFile(new URL("../app/api/agent/bootstrap/route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyPrivyAccessToken/);
  assert.match(source, /sameOrigin/);
  assert.match(source, /provisionUserWallets/);
  assert.match(source, /wallets:\s*\{[\s\S]*stellar:\s*onboarding\.stellar,[\s\S]*avalanche:\s*onboarding\.avalanche\?\.wallet/);
  assert.match(source, /wallet:\s*onboarding\.stellar,[\s\S]*wallets:/);
  assert.doesNotMatch(source, /rawSign|signTypedData|sendTransaction|fundWallet|faucet/i);
});

test("onboarding is metadata-only and MCP context exposes persisted networks", async () => {
  const onboarding = await readFile(new URL("../app/wallets/avalanche-onboarding.ts", import.meta.url), "utf8");
  const context = await readFile(new URL("../app/mcp/agent-context.ts", import.meta.url), "utf8");
  assert.match(onboarding, /network:\s*AVALANCHE_ONBOARDING_NETWORK/);
  assert.match(onboarding, /fundsMoved:\s*false/);
  assert.match(onboarding, /signingRequired:\s*false/);
  assert.doesNotMatch(onboarding, /rawSign|signTypedData|sendTransaction|faucet/i);
  assert.match(context, /listPersistedUserWallets\(userId\)/);
  assert.doesNotMatch(context, /\.from\(agentWallets\)/);
  assert.match(context, /paymentSigning:\s*"not_enabled"/);
  assert.doesNotMatch(context, /(?:provisionUserWallets|getOrCreateUserWallet|ensureAvalancheFujiWallet|ensureEvmTestnetWallet|ensureSolanaDevnetWallet|persistWalletNetworks|persistActivatedWallet|rawSign|signTypedData|sendTransaction|fundWallet)\s*\(/);
  assert.doesNotMatch(context, /(?:getStellarTestnetAccount|diagnoseEvmWallet|getSolanaDevnetBalance|readChatNativeBalance)\s*\(/);
});

test("MCP projects public persisted metadata without leaking provider fields or inferring balances", () => {
  const stellarAddress = "GBCTAHK3J56T4F2CSU3MQYQUMFO5ZS4IE3ZJGHOKFOYAAEN4ZAKAY5RZ";
  const fujiAddress = `0x${"Ab".repeat(20)}`;
  const privateFields = {
    id: "fixture-provider-id", walletId: "fixture-provider-wallet-id", userId: "fixture-owner-id",
    providerWalletId: "fixture-provider-internal-id", privateKey: "fixture-secret-private-key", secret: "fixture-secret",
    balance: "999999", onChainAccountExists: true,
    registrationState: "onchain_active", registrationStatusScope: "onchain",
  };
  const persisted = [
    { ...privateFields, address: stellarAddress, chainType: "stellar", network: "stellar:testnet", status: "active" },
    { ...privateFields, address: fujiAddress, chainType: "ethereum", network: "avalanche:fuji", status: "pending" },
  ];
  const original = structuredClone(persisted);
  const context = buildMcpWalletContext(persisted);
  const expected = [
    { address: fujiAddress, chainType: "ethereum", network: "avalanche:fuji", status: "pending",
      registrationState: "pending_registration", registrationStatusScope: "internal_registry",
      explorerUrl: `https://explorer-test.avax.network/c-chain/address/${fujiAddress}` },
    { address: stellarAddress, chainType: "stellar", network: "stellar:testnet", status: "active",
      registrationState: "registered", registrationStatusScope: "internal_registry",
      explorerUrl: `https://stellar.expert/explorer/testnet/account/${stellarAddress}` },
  ];
  assert.deepEqual(context.wallets, expected);
  assert.deepEqual(context.walletsByNetwork.stellarTestnet, expected[1]);
  assert.equal(context.walletsByNetwork.avalancheFuji, null);
  assert.deepEqual(context.walletRegistration.pendingRegistration, [expected[0]]);
  assert.deepEqual(context.walletRegistration.pendingActivation, [expected[0]]);
  assert.deepEqual(context.walletRegistration.statusSemantics, {
    scope: "internal_registry", active: "registered", pending: "pending_registration",
    onChainActivity: "not_inferred", balance: "not_inferred",
  });
  for (const wallet of context.wallets) {
    for (const key of Object.keys(privateFields).filter(key => !["registrationState", "registrationStatusScope"].includes(key))) {
      assert.equal(Object.hasOwn(wallet, key), false, `${wallet.network} exposes ${key}`);
    }
  }
  assert.doesNotMatch(JSON.stringify(context), /fixture-provider|fixture-owner|fixture-secret|999999|onchain_active/);
  assert.deepEqual(persisted, original, "Public projection must not change persisted fields or raw statuses");
});

test("onboarding retains family preparation while the wallet panel reads the authoritative registry", async () => {
  const source = await readFile(new URL("../app/agent/agent-onboarding.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/agent/registry-wallet-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /wallets:\s*\{/);
  assert.match(source, /<RegistryWalletPanel/);
  assert.match(panel, /readWorkspaceQuery[\s\S]*"personal\.wallets"/);
  assert.doesNotMatch(panel, /\/api\/agent\/bootstrap/);
  assert.doesNotMatch(source, /fundWallet|rawSign|sendTransaction/);
});
