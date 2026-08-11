import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { provisionUserWallets } from "../app/wallets/onboarding";
import type { UserWallet } from "../app/wallets/types";

const stellar: UserWallet = {
  id: "stellar-wallet",
  address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
  family: "stellar",
  chainType: "stellar",
  created: true,
  owner: "user",
};

const evm: UserWallet = {
  id: "evm-wallet",
  address: "0x1111111111111111111111111111111111111111",
  family: "evm",
  chainType: "ethereum",
  created: true,
  owner: "user",
};

test("wallet onboarding provisions and persists Stellar plus Avalanche without moving funds", async () => {
  const calls: string[] = [];
  const result = await provisionUserWallets(
    { userId: "did:privy:new-chat-user", email: "new@example.com" },
    {
      getOrCreateStellarWallet: async () => {
        calls.push("stellar.create");
        return stellar;
      },
      getStellarAccount: async () => ({ exists: false, sequence: null, balances: [] }),
      persistStellarAccount: async () => {
        calls.push("stellar.persist");
        return {
          persistence: { configured: true, provider: "Neon Postgres" },
          profile: { id: "did:privy:new-chat-user", email: "new@example.com", status: "active" },
          history: [],
        };
      },
      ensureAvalancheWallet: async () => {
        calls.push("avalanche.create");
        return {
          wallet: evm,
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
    },
  );

  assert.deepEqual(calls, ["stellar.create", "stellar.persist", "avalanche.create"]);
  assert.equal(result.stellar.address, stellar.address);
  assert.equal(result.avalanche.wallet.address, evm.address);
  assert.equal(result.activation, "pending");
  assert.equal(result.fundsMoved, false);
  assert.equal(result.signingRequired, false);
});

test("chat OAuth provisions wallets only after consent and before issuing authorization", async () => {
  const source = await readFile(
    new URL("../app/api/oauth/stytch/authorize/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(body\.consentGranted\) \{[\s\S]*provisionUserWallets/);
  assert.match(source, /if \(body\.consentGranted\) \{[\s\S]*linkOAuthSubject/);
  assert.ok(source.indexOf("await provisionUserWallets") < source.indexOf("await linkOAuthSubject"));
  assert.ok(source.indexOf("await provisionUserWallets") < source.indexOf("await client.submitAuthorization"));
  assert.doesNotMatch(source, /fundWallet|friendbot|rawSign|sendTransaction/);
});
