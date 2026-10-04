import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminWalletRegistry } from "../app/admin/wallets/data";
import { provisionUserWallets } from "../app/wallets/onboarding";
import type { UserWallet } from "../app/wallets/types";
import { buildMcpWalletContext } from "../app/mcp/agent-context";
import { createPersonalQueries } from "../app/queries/personal";
import { executeMcpReadQuery } from "../app/queries/adapters";
const runMcp = async (...args: Parameters<typeof executeMcpReadQuery>) => executeMcpReadQuery(...args);

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

  assert.ok(onboarding.stellar && onboarding.avalanche);
  assert.equal(onboarding.stellar.address, stellarAddress);
  assert.equal(onboarding.avalanche.wallet.address, avalancheAddress);
  assert.equal(onboarding.fundsMoved, false);
  assert.equal(onboarding.signingRequired, false);

  const mcpVisibleWallets = buildMcpWalletContext(persistedWallets).wallets;
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
  assert.match(mcpContextSource, /listPersistedUserWallets\(userId\)/);
  for (const wallet of mcpVisibleWallets) {
    assert.equal(wallet.registrationStatusScope, "internal_registry");
    assert.equal(wallet.registrationState, "registered");
    for (const privateField of ["id", "walletId", "userId", "providerWalletId"]) assert.equal(Object.hasOwn(wallet, privateField), false);
  }
  assert.match(mcpRouteSource, /for \(const query of readQueryDefinitions\)/);
  assert.match(mcpRouteSource, /server\.registerTool\(query\.toolName/);
  assert.match(mcpRouteSource, /executeMcpReadQuery\(query\.id, input, extra\.authInfo\)/);
  const noAncillaryRead = async () => { throw new Error("unexpected_ancillary_read"); };
  const ownerReads: string[] = [];
  const definitions = createPersonalQueries({
    context: async authenticatedOwner => {
      ownerReads.push(authenticatedOwner);
      assert.equal(authenticatedOwner, userId);
      return {
        user: { id: authenticatedOwner, email: null, status: "active", lastSeenAt: createdAt },
        ...buildMcpWalletContext(persistedWallets.filter(row => row.userId === authenticatedOwner)),
        connections: [], authority: { paymentSigning: "not_enabled", custody: false, writeToolsRequireExplicitApproval: true },
      };
    },
    conversation: noAncillaryRead, wallets: noAncillaryRead, nativeBalance: noAncillaryRead,
    watchlist: noAncillaryRead, quotes: noAncillaryRead, connections: noAncillaryRead,
    connectedApps: noAncillaryRead, memory: noAncillaryRead, activity: noAncillaryRead,
    autopilot: noAncillaryRead, stellarAccount: noAncillaryRead,
    evmDiagnostics: noAncillaryRead, erc20Balance: noAncillaryRead,
    solanaBalance: noAncillaryRead,
    now: () => createdAt.getTime(),
  });
  const contextDefinition = definitions.find(query => query.toolName === "get_agent_context");
  assert.ok(contextDefinition);
  assert.equal(contextDefinition.scope, "agent:context");
  assert.deepEqual(Object.keys(contextDefinition.inputSchema.shape), []);
  const auth = { token: "fixture-not-a-credential", clientId: "fixture", scopes: ["agent:context"], extra: { subjectType: "user", userId } };
  await assert.rejects(runMcp("get_agent_context", {}, { ...auth, scopes: ["agent:read"] }, definitions), /mcp_scope_required/);
  await assert.rejects(runMcp("get_agent_context", { userId: "foreign-owner" }, auth, definitions));
  assert.deepEqual(ownerReads, []);
  const context = await executeMcpReadQuery("get_agent_context", {}, auth, definitions) as { wallets: typeof mcpVisibleWallets; authority: { custody: boolean } };
  assert.deepEqual(new Set(context.wallets.map(wallet => wallet.network)), new Set(["stellar:testnet", "avalanche:fuji", "solana:devnet"]));
  assert.ok(context.wallets.some(wallet => wallet.address === stellarAddress));
  assert.ok(context.wallets.some(wallet => wallet.address === avalancheAddress));
  assert.equal(context.authority.custody, false);
  assert.deepEqual(ownerReads, [userId]);
  assert.match(adminUiSource, /wallet\.networkName/);
  assert.match(adminUiSource, /wallet\.address/);
  assert.match(adminUiSource, /initialRegistry\.networks\.map/);
  assert.match(adminUiSource, /\{item\.name\}/);

  const serialized = JSON.stringify({ mcpVisibleWallets, registry });
  assert.doesNotMatch(serialized, /privateKey|secret|rawSign|sendTransaction/);
});
