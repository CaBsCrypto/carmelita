import assert from "node:assert/strict";
import test from "node:test";
import { ensureAvalancheFujiWallet } from "../app/wallets/avalanche-onboarding";
import type { UserWallet } from "../app/wallets/types";

type PersistInput = {
  userId: string;
  email: string | null;
  wallet: UserWallet;
  network: "avalanche:fuji";
};

function evmWallet(user: string, created: boolean): UserWallet {
  const digit = user.endsWith("a") ? "a" : "b";
  return {
    id: `wallet-${user}`,
    address: `0x${digit.repeat(40)}`,
    family: "evm",
    chainType: "ethereum",
    created,
    owner: "user",
  };
}

test("onboards a second Privy user to Fuji without signing or funding", async () => {
  const persisted: PersistInput[] = [];
  const result = await ensureAvalancheFujiWallet(
    { userId: "did:privy:second-user-b", email: "second@example.com" },
    {
      getOrCreateWallet: async (userId, family) => {
        assert.equal(family, "evm");
        return evmWallet(userId, true);
      },
      persistWallet: async (input) => {
        persisted.push(input);
        return input.wallet;
      },
    },
  );
  assert.equal(result.network.id, "avalanche:fuji");
  assert.equal(result.network.chainId, 43113);
  assert.equal(result.wallet.chainType, "ethereum");
  assert.equal(result.fundsMoved, false);
  assert.equal(result.signingRequired, false);
  assert.equal(persisted[0]?.network, "avalanche:fuji");
  assert.equal(persisted[0]?.userId, "did:privy:second-user-b");
});

test("replays keep the same wallet and idempotent persistence key", async () => {
  let calls = 0;
  const persisted: PersistInput[] = [];
  const dependencies = {
    getOrCreateWallet: async (userId: string, family: "evm") => {
      assert.equal(family, "evm");
      calls += 1;
      return evmWallet(userId, calls === 1);
    },
    persistWallet: async (input: PersistInput) => {
      persisted.push(input);
      return input.wallet;
    },
  };
  const first = await ensureAvalancheFujiWallet({ userId: "did:privy:user-a", email: null }, dependencies);
  const replay = await ensureAvalancheFujiWallet({ userId: "did:privy:user-a", email: null }, dependencies);
  assert.equal(first.wallet.address, replay.wallet.address);
  assert.equal(first.wallet.id, replay.wallet.id);
  assert.deepEqual(persisted.map((item) => [item.userId, item.wallet.id, item.network]), [
    ["did:privy:user-a", "wallet-did:privy:user-a", "avalanche:fuji"],
    ["did:privy:user-a", "wallet-did:privy:user-a", "avalanche:fuji"],
  ]);
  assert.deepEqual(persisted.map((item) => item.wallet.created), [true, false]);
});

test("different DIDs remain isolated and invalid families fail closed", async () => {
  const records = new Map<string, string>();
  const dependencies = {
    getOrCreateWallet: async (userId: string, family: "evm") => {
      assert.equal(family, "evm");
      return evmWallet(userId, true);
    },
    persistWallet: async (input: PersistInput) => {
      assert.equal(records.has(input.wallet.address), false);
      records.set(input.wallet.address, input.userId);
      return input.wallet;
    },
  };
  await ensureAvalancheFujiWallet({ userId: "did:privy:user-a", email: null }, dependencies);
  await ensureAvalancheFujiWallet({ userId: "did:privy:user-b", email: null }, dependencies);
  assert.deepEqual([...records.values()].sort(), ["did:privy:user-a", "did:privy:user-b"]);

  await assert.rejects(ensureAvalancheFujiWallet(
    { userId: "did:privy:user-a", email: null },
    {
      getOrCreateWallet: async () => ({
        id: "wrong", address: "GINVALID", family: "stellar", chainType: "stellar",
        created: true, owner: "user",
      }),
      persistWallet: async (input) => input.wallet,
    },
  ), /privy_invalid_evm_wallet_response/);
});
