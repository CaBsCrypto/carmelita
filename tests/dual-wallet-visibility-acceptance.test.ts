import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminWalletRegistry } from "../app/admin/wallets/data";
import { provisionUserWallets } from "../app/wallets/onboarding";
import type { UserWallet } from "../app/wallets/types";

const userId = "did:privy:dual-wallet-acceptance";
const stellarAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const avalancheAddress = "0x1111111111111111111111111111111111111111";
const createdAt = new Date("2026-08-13T12:00:00.000Z");

const stellarWallet: UserWallet = {
  id: "fixture-stellar-wallet",
  address: stellarAddress,
  family: "stellar",
  chainType: "stellar",
  created: true,
  owner: "user",
};

const avalancheWallet: UserWallet = {
  id: "fixture-avalanche-wallet",
  address: avalancheAddress,
  family: "evm",
  chainType: "ethereum",
  created: true,
  owner: "user",
};

const solanaAddress = "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK";
const solanaWallet: UserWallet = {
  id: "fixture-solana-wallet",
  address: solanaAddress,
  family: "solana",
  chainType: "solana",
  created: true,
  owner: "user",
};

test("new Privy user can see Stellar and Avalanche Fuji in MCP and admin surfaces", async () => {
  const persistedWallets: Array<{
    userId: string;
    address: string;
    chainType: string;
    network: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  const onboarding = await provisionUserWallets(
    { userId, email: null },
    {
      getOrCreateStellarWallet: async () => stellarWallet,
      getStellarAccount: async () => ({ exists: true, sequence: "1", balances: [] }),
      persistStellarAccount: async ({ wallet }) => {
        persistedWallets.push({
          userId,
          address: wallet.address,
          chainType: wallet.chainType,
          network: "stellar:testnet",
          status: "active",
          createdAt,
          updatedAt: createdAt,
        });
        return {
          persistence: { configured: true, provider: "fixture" },
          profile: { id: userId, email: null, status: "active" },
          history: [],
        };
      },
      ensureAvalancheWallet: async () => {
        persistedWallets.push({
          userId,
          address: avalancheWallet.address,
          chainType: avalancheWallet.chainType,
          network: "avalanche:fuji",
          status: "active",
          createdAt,
          updatedAt: createdAt,
        });
        return {
          wallet: avalancheWallet,
          network: {
            id: "avalanche:fuji",
            family: "evm",
            name: "Avalanche Fuji",
            nativeAsset: "AVAX",
            chainId: 43113,
            explorerUrl: "https://subnets-test.avax.network/c-chain",
            rollout: "experimental",
          },
          fundsMoved: false,
          signingRequired: false,
        };
      },
      ensureSolanaWallet: async () => {
        persistedWallets.push({
          userId,
          address: solanaWallet.address,
          chainType: solanaWallet.chainType,
          network: "solana:devnet",
          status: "active",
          createdAt,
          updatedAt: createdAt,
        });
        return {
          wallet: solanaWallet,
          network: {
            id: "solana:devnet",
            family: "solana",
            name: "Solana Devnet",
            nativeAsset: "SOL",
            explorerUrl: "https://explorer.solana.com/?cluster=devnet",
            rollout: "experimental",
          },
          fundsMoved: false,
          signingRequired: false,
        };
      },
    },
  );

  assert.equal(onboarding.stellar.address, stellarAddress);
  assert.equal(onboarding.avalanche.wallet.address, avalancheAddress);
  assert.equal(onboarding.fundsMoved, false);
  assert.equal(onboarding.signingRequired, false);

  const mcpVisibleWallets = persistedWallets.map(({ address, chainType, network, status }) => ({
    address,
    chainType,
    network,
    status,
  }));
  assert.deepEqual(
    new Set(mcpVisibleWallets.map((wallet) => wallet.network)),
    new Set(["stellar:testnet", "avalanche:fuji", "solana:devnet"]),
  );
  assert.ok(mcpVisibleWallets.some((wallet) => wallet.address === stellarAddress));
  assert.ok(mcpVisibleWallets.some((wallet) => wallet.address === avalancheAddress));

  const registry = buildAdminWalletRegistry(
    [{ id: userId, email: null, status: "active", lastSeenAt: createdAt, createdAt }],
    persistedWallets,
  );
  assert.equal(registry.users[0]?.complete, true);
  assert.deepEqual(
    registry.users[0]?.wallets.map((wallet) => [wallet.networkName, wallet.address]),
    [
      ["Avalanche Fuji", avalancheAddress],
      ["Solana Devnet", solanaAddress],
      ["Stellar Testnet", stellarAddress],
    ],
  );

  const [mcpContextSource, mcpRouteSource, adminUiSource] = await Promise.all([
    readFile(new URL("../app/mcp/agent-context.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/wallets/wallet-registry.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(mcpContextSource, /address:\s*agentWallets\.address/);
  assert.match(mcpContextSource, /network:\s*agentWallets\.network/);
  assert.match(mcpRouteSource, /get_agent_context[\s\S]*getAgentMcpContext\(userId\)/);
  assert.match(adminUiSource, /wallet\.networkName/);
  assert.match(adminUiSource, /wallet\.address/);
  assert.match(adminUiSource, /Avalanche Fuji/);
  assert.match(adminUiSource, /Stellar Testnet/);

  const serialized = JSON.stringify({ mcpVisibleWallets, registry });
  assert.doesNotMatch(serialized, /privateKey|secret|rawSign|sendTransaction/);
});
