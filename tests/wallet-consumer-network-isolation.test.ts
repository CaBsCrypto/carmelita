import assert from "node:assert/strict";
import test from "node:test";
import { walletContext } from "../app/agent-chat-store";
import { getCctpFujiToStellarContext } from "../app/connectors/circle-cctp-context";
import { CCTP_TESTNET } from "../app/connectors/circle-cctp";
import type { listPersistedUserWallets } from "../app/multichain-account";
import { getActiveFujiWallet } from "../app/wallets/avalanche-transfer";

type Row = Awaited<ReturnType<typeof listPersistedUserWallets>>[number];
const owner = "did:privy:consumer-owner";
const evmAddress = "0x1111111111111111111111111111111111111111";
const stellarAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
function row(network: string, overrides: Partial<Row> = {}): Row {
  const stellar = network.startsWith("stellar:");
  return { id: stellar ? "canonical-stellar-provider-id" : "canonical-evm-provider-id", walletId: stellar ? "canonical-stellar-provider-id" : "canonical-evm-provider-id", userId: owner, address: stellar ? stellarAddress : evmAddress, chainType: stellar ? "stellar" : "ethereum", network, status: "active", updatedAt: new Date("2026-09-08T00:00:00Z"), ...overrides };
}

test("Fuji consumers select the owner's exact active binding while preserving the canonical Privy ID", async () => {
  const selected = await getActiveFujiWallet(owner, async (requestedOwner) => {
    assert.equal(requestedOwner, owner);
    return [row("bnb:testnet"), row("base:sepolia"), row("avalanche:fuji", { userId: "did:privy:another-user", id: "other-privy-id" }), row("avalanche:fuji")];
  });
  assert.deepEqual(selected, { id: "canonical-evm-provider-id", address: evmAddress });
});

test("Fuji consumers cannot substitute another EVM network, pending binding, owner or family", async () => {
  for (const candidate of [row("bnb:testnet"), row("base:sepolia"), row("avalanche:fuji", { status: "pending" }), row("avalanche:fuji", { userId: "did:privy:another-user" }), row("avalanche:fuji", { chainType: "stellar" })]) {
    await assert.rejects(getActiveFujiWallet(owner, async () => [candidate]), /avalanche_not_activated/);
  }
});

test("Stellar chat ignores expanded EVM bindings and returns only public context for the exact owner", async () => {
  const probes: string[] = [];
  const context = await walletContext(owner, async () => [row("bnb:testnet"), row("base:sepolia"), row("stellar:testnet", { userId: "did:privy:other", address: "WRONG_OWNER_ADDRESS" }), row("stellar:testnet", { status: "pending" })], async (address) => {
    probes.push(address);
    return { exists: false, sequence: null, balances: [] };
  });
  assert.deepEqual(probes, [stellarAddress]);
  assert.equal(context?.address, stellarAddress);
  assert.equal(context?.accountExists, false);
  assert.doesNotMatch(JSON.stringify(context), /provider-id|walletId|did:privy/);
});

test("Stellar chat performs no Horizon lookup when only other networks or owners are present", async () => {
  const context = await walletContext(owner, async () => [row("bnb:testnet"), row("base:sepolia"), row("stellar:mainnet"), row("stellar:testnet", { userId: "did:privy:other" })], async () => {
    assert.fail("No Stellar Testnet wallet belonging to this user is available");
  });
  assert.equal(context, null);
});

test("CCTP reads only Fuji-to-Stellar even when the same canonical EVM wallet has BNB and Base bindings", async () => {
  const probes: string[] = [];
  const context = await getCctpFujiToStellarContext(owner, {
    listWallets: async (requestedOwner) => {
      assert.equal(requestedOwner, owner);
      return [row("base:sepolia"), row("bnb:testnet"), row("avalanche:fuji", { userId: "did:privy:other", address: "WRONG_OWNER_ADDRESS" }), row("avalanche:fuji"), row("stellar:testnet")];
    },
    diagnoseEvmWallet: async (network, address) => {
      probes.push(`gas:${network.id}:${address}`);
      return { network: network.id, chainId: 43113, address, balanceWei: "1", balance: "1", nativeAsset: "AVAX", gasPriceWei: "1", nonce: 0, funded: true, explorerUrl: "https://example.test", faucetUrl: undefined };
    },
    getErc20Balance: async (network, tokenAddress, walletAddress, decimals) => {
      probes.push(`token:${network.id}:${tokenAddress}:${walletAddress}`);
      return { tokenAddress, walletAddress, atomic: "1000000", balance: "1", decimals };
    },
    getStellarTestnetAccount: async (address) => {
      probes.push(`stellar:${address}`);
      return { exists: true, sequence: "1", balances: [{ asset: "XLM", balance: "2", issuer: null }, { asset: "USDC", balance: "1", issuer: CCTP_TESTNET.stellar.usdcIssuer }] };
    },
  });
  assert.deepEqual(probes.sort(), [`gas:avalanche:fuji:${evmAddress}`, `stellar:${stellarAddress}`, `token:avalanche:fuji:${CCTP_TESTNET.avalanche.usdc}:${evmAddress}`].sort());
  assert.deepEqual(context, { sourceAddress: evmAddress, destinationAddress: stellarAddress, sourceGasReady: true, sourceUsdcBalance: "1", destinationGasReady: true, destinationTrustlineReady: true });
  assert.doesNotMatch(JSON.stringify(context), /provider-id|walletId|did:privy/);
});

test("CCTP cannot replace missing active source and destination with new EVM bindings or another user's wallet", async () => {
  const unexpected = async () => assert.fail("No permitted CCTP wallet should trigger an external lookup");
  const context = await getCctpFujiToStellarContext(owner, {
    listWallets: async () => [row("base:sepolia"), row("bnb:testnet"), row("avalanche:fuji", { status: "pending" }), row("stellar:testnet", { userId: "did:privy:other" })],
    diagnoseEvmWallet: unexpected,
    getErc20Balance: unexpected,
    getStellarTestnetAccount: unexpected,
  });
  assert.deepEqual(context, { sourceAddress: null, destinationAddress: null, sourceGasReady: false, sourceUsdcBalance: null, destinationGasReady: false, destinationTrustlineReady: false });
});
