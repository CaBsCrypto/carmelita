import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWalletIdentityAvailable,
  walletCreatedActivityId,
} from "../app/multichain-account";
import {
  findExactPrivyWallet,
  getPrivyUserWalletExternalId,
} from "../app/wallets/privy";

test("Privy recovery accepts only the deterministic external_id", () => {
  const expected = getPrivyUserWalletExternalId("did:privy:user-a", "evm");
  const wallets = [
    {
      id: "wallet-unrelated",
      address: `0x${"1".repeat(40)}`,
      chain_type: "ethereum",
      external_id: "someone-elses-wallet",
    },
    {
      id: "wallet-exact",
      address: `0x${"2".repeat(40)}`,
      chain_type: "ethereum",
      external_id: expected,
    },
  ];
  assert.equal(findExactPrivyWallet(wallets, expected)?.id, "wallet-exact");
  assert.equal(findExactPrivyWallet(wallets.slice(0, 1), expected), undefined);
  assert.equal(findExactPrivyWallet([{ ...wallets[1], external_id: null }], expected), undefined);
});

test("wallet ownership is immutable across users", () => {
  assert.throws(
    () => assertWalletIdentityAvailable(
      [{ id: "wallet-1", userId: "did:privy:user-a", address: `0x${"a".repeat(40)}` }],
      { id: "wallet-1", userId: "did:privy:user-b", address: `0x${"a".repeat(40)}` },
    ),
    /wallet_ownership_conflict/,
  );
  assert.throws(
    () => assertWalletIdentityAvailable(
      [{ id: "wallet-1", userId: "did:privy:user-a", address: `0x${"a".repeat(40)}` }],
      { id: "wallet-2", userId: "did:privy:user-b", address: `0x${"a".repeat(40)}` },
    ),
    /wallet_ownership_conflict/,
  );
});

test("wallet ID/address collisions fail closed even for the same user", () => {
  const existing = [{
    id: "wallet-1",
    userId: "did:privy:user-a",
    address: `0x${"a".repeat(40)}`,
  }];
  assert.throws(
    () => assertWalletIdentityAvailable(existing, {
      id: "wallet-1", userId: "did:privy:user-a", address: `0x${"b".repeat(40)}`,
    }),
    /wallet_identity_conflict/,
  );
  assert.throws(
    () => assertWalletIdentityAvailable(existing, {
      id: "wallet-2", userId: "did:privy:user-a", address: `0x${"a".repeat(40)}`,
    }),
    /wallet_identity_conflict/,
  );
  assert.doesNotThrow(() => assertWalletIdentityAvailable(existing, existing[0]));
});

test("wallet.created activity IDs are deterministic across replay and concurrent requests", () => {
  const first = walletCreatedActivityId("wallet-1", "avalanche:fuji");
  const replay = walletCreatedActivityId("wallet-1", "avalanche:fuji");
  assert.equal(first, replay);
  assert.notEqual(first, walletCreatedActivityId("wallet-2", "avalanche:fuji"));
  assert.notEqual(first, walletCreatedActivityId("wallet-1", "base:sepolia"));
  assert.match(first, /^wallet-created:wallet-1:avalanche:fuji$/);
});
