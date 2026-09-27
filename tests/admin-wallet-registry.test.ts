import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminWalletRegistry } from "../app/admin/wallets/data";
import { WALLET_NETWORKS } from "../app/wallets/networks";

const now = new Date("2026-08-11T10:00:00.000Z");

test("wallet registry identifies complete and incomplete Privy users", () => {
  const registry = buildAdminWalletRegistry(
    [
      { id: "did:privy:complete", email: "complete@example.com", status: "active", lastSeenAt: now, createdAt: now },
      { id: "did:privy:missing", email: "missing@example.com", status: "active", lastSeenAt: now, createdAt: now },
    ],
    [
      { userId: "did:privy:complete", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:complete", address: "11111111111111111111111111111111", chainType: "solana", network: "solana:devnet", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:complete", address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:missing", address: "GMISSING", chainType: "stellar", network: "stellar:testnet", status: "active", createdAt: now, updatedAt: now },
    ],
  );

  assert.deepEqual(registry.summary, {
    users: 2,
    wallets: 4,
    uniqueWallets: 4,
    networkAssociations: 4,
    completeUsers: 1,
    needsAttention: 1,
    missingStellar: 0,
    missingAvalanche: 1,
    missingSolana: 1,
    missingBnb: 0,
    missingBase: 0,
  });
  assert.equal(registry.users[0]?.complete, true);
  assert.equal(registry.users[0]?.registeredComplete, true);
  assert.deepEqual(registry.users[1]?.missingNetworks, ["avalanche:fuji", "solana:devnet"]);
  assert.match(registry.users[0]?.wallets[0]?.explorerUrl ?? "", /subnets-test\.avax\.network/);
  assert.match(registry.users[0]?.wallets[2]?.explorerUrl ?? "", /stellar\.expert/);
});

test("registry distinguishes one EVM wallet from three network associations", () => {
  const user = { id: "did:privy:evm", email: null, status: "active", lastSeenAt: now, createdAt: now };
  const networks = ["avalanche:fuji", "bnb:testnet", "base:sepolia"] as const;
  const rows = networks.map((network) => ({ id: "evm-canonical", userId: user.id, address: `0x${"a".repeat(40)}`, chainType: "ethereum", network, status: "active", createdAt: now, updatedAt: now }));
  const enabled = networks.map((network) => WALLET_NETWORKS[network]);
  const registry = buildAdminWalletRegistry([user], rows, enabled);
  assert.equal(registry.summary.wallets, 1, "legacy total remains unique wallet identities");
  assert.equal(registry.summary.uniqueWallets, 1);
  assert.equal(registry.summary.networkAssociations, 3);
  assert.equal(registry.users[0].complete, true);
  assert.equal(registry.users[0].evmIdentityConflict, false);
  assert.deepEqual(registry.users[0].duplicateNetworks, []);
  assert.ok(registry.users[0].wallets.every((wallet) => wallet.validAddress));
  assert.equal(registry.users[0].wallets.find((wallet) => wallet.network === "bnb:testnet")?.explorerUrl, `https://testnet.bscscan.com/address/0x${"a".repeat(40)}`);
  assert.equal(registry.users[0].wallets.find((wallet) => wallet.network === "base:sepolia")?.explorerUrl, `https://sepolia.basescan.org/address/0x${"a".repeat(40)}`);
  assert.doesNotMatch(JSON.stringify(registry), /evm-canonical/);
  const invalid = buildAdminWalletRegistry([user], rows.map((row, index) => index === 1 ? { ...row, address: `0x${"b".repeat(40)}` } : row), enabled);
  assert.equal(invalid.users[0].evmIdentityConflict, true);
  assert.equal(invalid.users[0].complete, false);
  const flagOff = buildAdminWalletRegistry([user], rows, [WALLET_NETWORKS["avalanche:fuji"]]);
  assert.equal(flagOff.summary.networkAssociations, 1);
  assert.deepEqual(flagOff.users[0].missingNetworks, []);
});

test("two expanded users preserve six legacy wallets while reporting ten network associations", () => {
  const users = ["a", "b"].map((suffix) => ({ id: `did:privy:${suffix}`, email: null, status: "active", lastSeenAt: now, createdAt: now }));
  const networks = ["stellar:testnet", "avalanche:fuji", "solana:devnet", "bnb:testnet", "base:sepolia"] as const;
  const rows = users.flatMap((user, index) => networks.map((network) => {
    const family = WALLET_NETWORKS[network].family;
    return { id: `${user.id}:${family}`, userId: user.id, address: family === "stellar" ? "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" : family === "solana" ? "11111111111111111111111111111111" : `0x${String(index + 1).repeat(40)}`, chainType: family === "evm" ? "ethereum" : family, network, status: "active", createdAt: now, updatedAt: now };
  }));
  const registry = buildAdminWalletRegistry(users, rows, networks.map((network) => WALLET_NETWORKS[network]));
  assert.equal(registry.summary.wallets, 6);
  assert.equal(registry.summary.uniqueWallets, 6);
  assert.equal(registry.summary.networkAssociations, 10);
  assert.deepEqual(registry.users.map((user) => [user.uniqueWallets, user.networkAssociations]), [[3, 5], [3, 5]]);
});

test("each EVM network keeps its status independently of the legacy Fuji status", async () => {
  const user = { id: "did:privy:independent", email: null, status: "active", lastSeenAt: now, createdAt: now };
  const networks = ["avalanche:fuji", "bnb:testnet", "base:sepolia"] as const;
  const rows = networks.map((network) => ({ id: "evm-canonical", userId: user.id, address: `0x${"a".repeat(40)}`, chainType: "ethereum", network, status: network === "avalanche:fuji" ? "pending" : "active", createdAt: now, updatedAt: now }));
  const registry = buildAdminWalletRegistry([user], rows, networks.map((network) => WALLET_NETWORKS[network]));
  assert.deepEqual(registry.users[0].inactiveNetworks, ["avalanche:fuji"]);
  assert.equal(registry.users[0].wallets.find((wallet) => wallet.network === "bnb:testnet")?.status, "active");
  assert.equal(registry.users[0].wallets.find((wallet) => wallet.network === "base:sepolia")?.status, "active");
  const source = await readFile(new URL("../app/admin/wallets/data.ts", import.meta.url), "utf8");
  assert.match(source, /status: agentWalletNetworks\.status/);
  assert.doesNotMatch(source, /agentWallets\.status/);
});

test("wallet registry never marks malformed or inactive wallet records as ready", () => {
  const registry = buildAdminWalletRegistry(
    [{ id: "did:privy:not-ready", email: null, status: "active", lastSeenAt: now, createdAt: now }],
    [
      { userId: "did:privy:not-ready", address: "NOT_A_STELLAR_ADDRESS", chainType: "stellar", network: "stellar:testnet", status: "pending", createdAt: now, updatedAt: now },
      { userId: "did:privy:not-ready", address: "11111111111111111111111111111111", chainType: "solana", network: "solana:devnet", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:not-ready", address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active", createdAt: now, updatedAt: now },
    ],
  );

  assert.equal(registry.users[0]?.registeredComplete, true);
  assert.equal(registry.users[0]?.complete, false);
  assert.deepEqual(registry.users[0]?.inactiveNetworks, ["stellar:testnet"]);
  assert.deepEqual(registry.users[0]?.invalidAddressNetworks, ["stellar:testnet"]);
});

test("wallet registry detects duplicate networks without exposing wallet IDs", () => {
  const registry = buildAdminWalletRegistry(
    [{ id: "did:privy:duplicate", email: null, status: "active", lastSeenAt: now, createdAt: now }],
    [
      { userId: "did:privy:duplicate", address: "GONE", chainType: "stellar", network: "stellar:testnet", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:duplicate", address: "GTWO", chainType: "stellar", network: "stellar:testnet", status: "active", createdAt: now, updatedAt: now },
    ],
  );

  assert.deepEqual(registry.users[0]?.duplicateNetworks, ["stellar:testnet"]);
  assert.equal(registry.users[0]?.complete, false);
  assert.equal("id" in (registry.users[0]?.wallets[0] ?? {}), false);
  assert.equal(JSON.stringify(registry).includes("privateKey"), false);
  assert.equal(JSON.stringify(registry).includes("secret"), false);
});

test("admin wallet API is authenticated, read-only and no-store", async () => {
  const source = await readFile(new URL("../app/api/admin/wallets/route.ts", import.meta.url), "utf8");
  assert.match(source, /getAdminIdentity/);
  assert.match(source, /admin_auth_required/);
  assert.match(source, /Cache-Control[\s\S]*no-store/);
  assert.doesNotMatch(source, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(source, /privateKey|walletId|rawSign|sendTransaction|fundWallet/);
});

test("founder navigation exposes the protected wallet registry", async () => {
  const dashboard = await readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/admin/wallets/page.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /href="\/admin\/wallets"/);
  assert.match(page, /requireAdminPage\("\/admin\/wallets"\)/);
});

test("Solana validation, explorer and readiness agree", () => {
  const user = { id: "did:privy:solana", email: null, status: "active", lastSeenAt: now, createdAt: now };
  const wallet = { userId: user.id, address: "11111111111111111111111111111111", chainType: "solana", network: "solana:devnet", status: "active", createdAt: now, updatedAt: now };
  const valid = buildAdminWalletRegistry([user], [wallet]);
  assert.equal(valid.users[0].wallets[0].validAddress, true);
  assert.equal(valid.users[0].wallets[0].explorerUrl, "https://explorer.solana.com/address/11111111111111111111111111111111?cluster=devnet");
  const invalid = buildAdminWalletRegistry([user], [{ ...wallet, address: "not-a-wallet" }]);
  assert.deepEqual(invalid.users[0].invalidAddressNetworks, ["solana:devnet"]);
  assert.equal(invalid.users[0].complete, false);
  const missing = buildAdminWalletRegistry([user], []);
  assert.equal(missing.summary.missingSolana, 1);
});
