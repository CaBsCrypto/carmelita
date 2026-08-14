import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNetworkMatchesFamily,
  getWalletNetwork,
  networksForFamily,
} from "../app/wallets/networks";
import {
  getOrCreateUserWallet,
  getPrivyUserWalletExternalId,
  isValidWalletAddress,
} from "../app/wallets/privy";

test("groups Stellar, EVM and Solana networks without duplicating the EVM family", () => {
  assert.equal(getWalletNetwork("stellar:testnet").family, "stellar");
  assert.equal(getWalletNetwork("base:sepolia").chainId, 84532);
  assert.equal(getWalletNetwork("base:sepolia").rollout, "planned");
  assert.equal(getWalletNetwork("avalanche:fuji").chainId, 43113);
  assert.equal(getWalletNetwork("avalanche:fuji").rollout, "experimental");
  assert.equal(getWalletNetwork("solana:devnet").family, "solana");
  assert.deepEqual(
    networksForFamily("evm").map((network) => network.id),
    ["base:sepolia", "avalanche:fuji", "bnb:testnet"],
  );
  assert.throws(
    () => assertNetworkMatchesFamily("base:sepolia", "solana"),
    /wallet_network_family_mismatch/,
  );
});

test("validates addresses by cryptographic wallet family", () => {
  assert.equal(isValidWalletAddress("evm", `0x${"a".repeat(40)}`), true);
  assert.equal(isValidWalletAddress("evm", "0x1234"), false);
  assert.equal(isValidWalletAddress("solana", "11111111111111111111111111111111"), true);
  assert.equal(isValidWalletAddress("solana", "not-solana!"), false);
});

test("provisions one idempotent Privy wallet for each new family", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.PRIVY_APP_ID;
  const originalSecret = process.env.PRIVY_APP_SECRET;
  const userId = "did:privy:multichain-user";
  const addresses = {
    ethereum: `0x${"b".repeat(40)}`,
    solana: "11111111111111111111111111111111",
  } as const;
  const created = new Map<string, { id: string; address: string; chain_type: string; external_id: string }>();
  const postCounts = new Map<string, number>();

  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/wallets") && init?.method === "GET") {
      const chainType = url.searchParams.get("chain_type") ?? "";
      const wallet = created.get(chainType);
      return Response.json({ data: wallet ? [wallet] : [] });
    }
    if (url.pathname.endsWith("/wallets") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      const chainType = String(body.chain_type) as keyof typeof addresses;
      postCounts.set(chainType, (postCounts.get(chainType) ?? 0) + 1);
      assert.deepEqual(body.owner, { user_id: userId });
      assert.equal(body.external_id, getPrivyUserWalletExternalId(userId, chainType === "ethereum" ? "evm" : "solana"));
      const wallet = {
        id: `wallet_${chainType}`,
        address: addresses[chainType],
        chain_type: chainType,
        external_id: body.external_id,
      };
      created.set(chainType, wallet);
      return Response.json(wallet);
    }
    throw new Error(`Unexpected Privy request: ${url}`);
  };

  try {
    for (const family of ["evm", "solana"] as const) {
      const first = await getOrCreateUserWallet(userId, family);
      const second = await getOrCreateUserWallet(userId, family);
      assert.equal(first.created, true);
      assert.equal(second.created, false);
      assert.equal(first.id, second.id);
    }
    assert.equal(postCounts.get("ethereum"), 1);
    assert.equal(postCounts.get("solana"), 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.PRIVY_APP_ID;
    else process.env.PRIVY_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.PRIVY_APP_SECRET;
    else process.env.PRIVY_APP_SECRET = originalSecret;
  }
});

test("reconnect reuses a legacy Stellar wallet instead of creating a pending duplicate", async () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.PRIVY_APP_ID;
  const originalSecret = process.env.PRIVY_APP_SECRET;
  const legacyAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  let postCount = 0;

  process.env.PRIVY_APP_ID = "test-app";
  process.env.PRIVY_APP_SECRET = "test-secret";
  globalThis.fetch = async (_input, init) => {
    if (init?.method === "GET") {
      return Response.json({ data: [{
        id: "legacy-stellar-wallet",
        address: legacyAddress,
        chain_type: "stellar",
        external_id: "legacy_external_id",
      }] });
    }
    postCount += 1;
    throw new Error("reconnect_must_not_create_wallet");
  };

  try {
    const wallet = await getOrCreateUserWallet("did:privy:reconnected-user", "stellar");
    assert.equal(wallet.id, "legacy-stellar-wallet");
    assert.equal(wallet.address, legacyAddress);
    assert.equal(wallet.created, false);
    assert.equal(postCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAppId === undefined) delete process.env.PRIVY_APP_ID;
    else process.env.PRIVY_APP_ID = originalAppId;
    if (originalSecret === undefined) delete process.env.PRIVY_APP_SECRET;
    else process.env.PRIVY_APP_SECRET = originalSecret;
  }
});
