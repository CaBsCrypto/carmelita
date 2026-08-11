import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAdminWalletRegistry } from "../app/admin/wallets/data";

const now = new Date("2026-08-11T10:00:00.000Z");

test("wallet registry identifies complete and incomplete Privy users", () => {
  const registry = buildAdminWalletRegistry(
    [
      { id: "did:privy:complete", email: "complete@example.com", status: "active", lastSeenAt: now, createdAt: now },
      { id: "did:privy:missing", email: "missing@example.com", status: "active", lastSeenAt: now, createdAt: now },
    ],
    [
      { userId: "did:privy:complete", address: "GCOMPLETE", chainType: "stellar", network: "stellar:testnet", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:complete", address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active", createdAt: now, updatedAt: now },
      { userId: "did:privy:missing", address: "GMISSING", chainType: "stellar", network: "stellar:testnet", status: "active", createdAt: now, updatedAt: now },
    ],
  );

  assert.deepEqual(registry.summary, {
    users: 2,
    wallets: 3,
    completeUsers: 1,
    needsAttention: 1,
    missingStellar: 0,
    missingAvalanche: 1,
  });
  assert.equal(registry.users[0]?.complete, true);
  assert.deepEqual(registry.users[1]?.missingNetworks, ["avalanche:fuji"]);
  assert.match(registry.users[0]?.wallets[0]?.explorerUrl ?? "", /subnets-test\.avax\.network/);
  assert.match(registry.users[0]?.wallets[1]?.explorerUrl ?? "", /stellar\.expert/);
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
