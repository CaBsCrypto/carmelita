import assert from "node:assert/strict";
import test from "node:test";
import { assertWalletIdentityAvailable, buildWalletPersistenceStatements } from "../app/multichain-account";
import { getExistingUserEvmWallet, getPrivyUserWalletExternalId, selectEvmWallet } from "../app/wallets/privy";
import { ensureTempoTestnetWallet } from "../app/wallets/tempo-onboarding";
import { createTempoStatusHandler } from "../app/wallets/tempo-status";
import { TEMPO_MODERATO_TOKEN } from "../app/wallets/networks";
import type { TempoWalletReading, UserWallet } from "../app/wallets/types";

const userId = "did:privy:tempo-owner-a";
const address = `0x${"aB".repeat(20)}`;
const wallet: UserWallet = { id: "tempo-existing-evm-a", address, family: "evm", chainType: "ethereum", created: false, owner: "user" };

test("an additional Tempo binding reuses the exact authenticated Privy EVM identity", () => {
  const canonical = { id: wallet.id, userId, address, chainType: "ethereum" };
  const externalId = getPrivyUserWalletExternalId(userId, "evm");
  const own = { id: wallet.id, address: address.toLowerCase(), chain_type: "ethereum", external_id: externalId };
  const other = { ...own, id: "unrelated", address: `0x${"c".repeat(40)}`, external_id: "unrelated" };
  for (const candidates of [[own, other], [other, own]]) {
    assert.deepEqual(selectEvmWallet(candidates, { userId, externalId, canonical }), { ...own, address });
  }
  assert.throws(() => selectEvmWallet([own], { userId: "did:privy:tempo-owner-b", externalId, canonical }), /wallet_identity_conflict/);
  assert.throws(() => selectEvmWallet([other], { userId, externalId, canonical }), /wallet_identity_conflict/);
});

test("repeated Tempo association keeps the wallet and wallet-network persistence key", () => {
  const input = { userId, email: null, wallet, networks: ["tempo:moderato", "tempo:moderato"] as const };
  const first = buildWalletPersistenceStatements({ ...input, networks: [...input.networks] });
  const second = buildWalletPersistenceStatements({ ...input, wallet: { ...wallet, address: address.toLowerCase() }, networks: ["tempo:moderato"] });
  for (const statements of [first, second]) {
    assert.equal(statements.length, 3, "an existing EVM wallet must not emit wallet-created activity");
    assert.equal(statements[1].parameters[0], wallet.id);
    assert.equal(statements[1].parameters[1], userId);
    assert.equal(statements[1].parameters[4], "avalanche:fuji", "legacy network identity is preserved");
    assert.deepEqual(statements[2].parameters.slice(0, 4), [wallet.id, userId, "active", ["tempo:moderato"]]);
    assert.match(statements[2].text, /ON CONFLICT \(wallet_id, network\) DO UPDATE/);
  }
  assert.equal(first[2].text, second[2].text);
});

test("foreign owners and altered identity cannot claim a Tempo binding", () => {
  const existing = [{ id: wallet.id, userId, address }];
  assert.doesNotThrow(() => assertWalletIdentityAvailable(existing, { id: wallet.id, userId, address: address.toLowerCase() }));
  for (const attempted of [
    { id: wallet.id, userId: "did:privy:tempo-owner-b", address },
    { id: wallet.id, userId, address: `0x${"c".repeat(40)}` },
    { id: "replacement-wallet", userId, address },
  ]) assert.throws(() => assertWalletIdentityAvailable(existing, attempted), /wallet_(ownership|identity)_conflict/);
  assert.throws(() => buildWalletPersistenceStatements({ userId, email: null, wallet: { ...wallet, family: "solana", chainType: "solana" }, networks: ["tempo:moderato"] }), /wallet_network_family_mismatch/);
});

function available(walletAddress = address): TempoWalletReading {
  return { status: "available", network: "tempo:moderato", caip2: "eip155:42431", testnet: true,
    chainId: 42431, address: walletAddress, queriedAt: "2026-10-13T00:31:55Z",
    explorerUrl: `https://explore.testnet.tempo.xyz/address/${walletAddress}`,
    token: { ...TEMPO_MODERATO_TOKEN, balanceAtomic: "0", balance: "0", metadataVerified: true },
    block: { number: "39341709", hash: `0x${"d".repeat(64)}`, timestamp: "1791859735" } };
}

test("Tempo resolver reads only the authenticated Privy EVM family and never creates a missing wallet", async () => {
  const calls: string[] = [];
  const canonical = { id: wallet.id, userId, address, chainType: "ethereum" };
  const dependencies = {
    canonicalEvmWallet: async (owner: string) => { assert.equal(owner, userId); calls.push("canonical"); return canonical; },
    listWallets: async (owner: string, family: "evm") => {
      assert.equal(owner, userId); assert.equal(family, "evm"); calls.push("privy-list");
      return [{ id: wallet.id, address: address.toLowerCase(), chain_type: "ethereum", external_id: getPrivyUserWalletExternalId(userId, "evm") }];
    },
  };
  assert.deepEqual(await getExistingUserEvmWallet(userId, dependencies), wallet);
  assert.deepEqual(calls, ["canonical", "privy-list"]);
  await assert.rejects(getExistingUserEvmWallet(userId, { canonicalEvmWallet: async () => null, listWallets: async () => [] }), /existing_evm_wallet_required/);
  await assert.rejects(getExistingUserEvmWallet(userId, { ...dependencies, canonicalEvmWallet: async () => ({ ...canonical, userId: "did:privy:other" }) }), /wallet_identity_conflict/);
});

test("explicit association validates the existing wallet and chain before two idempotent persists", async () => withTempo(async () => {
  const calls: string[] = [];
  const inputs: Array<{ userId: string; wallet: UserWallet; network: string }> = [];
  const dependencies = {
    getExistingWallet: async (owner: string) => { assert.equal(owner, userId); calls.push("existing"); return wallet; },
    read: async (walletAddress: string) => { assert.equal(walletAddress, address); calls.push("rpc"); return available(); },
    persistWallet: async (input: { userId: string; email: string | null; wallet: UserWallet; network: "tempo:moderato" }) => {
      calls.push("persist"); inputs.push(input); return input.wallet;
    },
  };
  const first = await ensureTempoTestnetWallet({ userId, email: null }, dependencies);
  const replay = await ensureTempoTestnetWallet({ userId, email: null }, dependencies);
  assert.equal(first.wallet.id, replay.wallet.id);
  assert.equal(first.wallet.address, replay.wallet.address);
  assert.equal(first.network.chainId, 42431);
  assert.equal(first.signingRequired, false);
  assert.equal(first.fundsMoved, false);
  assert.deepEqual(calls, ["existing", "rpc", "persist", "existing", "rpc", "persist"]);
  assert.deepEqual(inputs.map(input => [input.userId, input.wallet.id, input.network]), [
    [userId, wallet.id, "tempo:moderato"], [userId, wallet.id, "tempo:moderato"],
  ]);
}));

test("no usable existing wallet, disabled feature or unverified chain cannot create a registration", async () => withTempo(async () => {
  let reads = 0;
  let persists = 0;
  const dependencies = {
    getExistingWallet: async () => wallet,
    read: async () => { reads++; return available(); },
    persistWallet: async (input: { wallet: UserWallet }) => { persists++; return input.wallet; },
  };
  await assert.rejects(ensureTempoTestnetWallet({ userId, email: null }, { ...dependencies, getExistingWallet: async () => { throw new Error("tempo_existing_evm_wallet_required"); } }), /existing_evm_wallet_required/);
  for (const invalid of [{ ...wallet, created: true }, { ...wallet, chainType: "solana" as const }, { ...wallet, address: "invalid" }]) {
    await assert.rejects(ensureTempoTestnetWallet({ userId, email: null }, { ...dependencies, getExistingWallet: async () => invalid }), /wallet_identity_conflict/);
  }
  assert.equal(reads, 0);
  process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "false";
  await assert.rejects(ensureTempoTestnetWallet({ userId, email: null }, dependencies), /tempo_disabled/);
  process.env.CARMELITA_TEMPO_TESTNET_ENABLED = "true";
  const failed: TempoWalletReading = { status: "wrong_network", network: "tempo:moderato", caip2: "eip155:42431", testnet: true,
    address, explorerUrl: `https://explore.testnet.tempo.xyz/address/${address}`, queriedAt: "2026-10-13T00:31:55Z",
    token: null, block: null, error: { code: "tempo_wrong_chain", message: "Wrong chain." } };
  await assert.rejects(ensureTempoTestnetWallet({ userId, email: null }, { ...dependencies, read: async () => failed }), /tempo_wrong_chain/);
  await assert.rejects(ensureTempoTestnetWallet({ userId, email: null }, { ...dependencies, read: async () => ({ ...available(), chainId: 4217 } as unknown as TempoWalletReading) }), /wallet_response_mismatch/);
  assert.equal(persists, 0);
}));

function statusRequest(query = "", token = "valid-a") {
  return new Request(`https://isolated.example/api/agent/wallets/tempo${query ? `?${query}` : ""}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

test("revoked authentication returns HTTP 401 and no wallet or RPC is accessed", async () => {
  const handler = createTempoStatusHandler({
    authenticate: async () => { throw new Error("revoked bearer-secret"); },
    wallets: async () => { assert.fail("revoked token read a wallet"); },
    read: async () => { assert.fail("revoked token read RPC"); }, enabled: () => true,
  });
  for (const token of ["", "revoked-token"]) {
    const response = await handler(statusRequest("", token));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "authentication_required" });
  }
});

test("authenticated Tempo status rejects forged owner, address, wallet IDs and RPC selectors", async () => {
  const handler = createTempoStatusHandler({
    authenticate: async () => ({ user_id: userId }),
    wallets: async () => { assert.fail("invalid selector read a wallet"); },
    read: async () => { assert.fail("invalid selector read RPC"); }, enabled: () => true,
  });
  for (const query of ["userId=did:privy:other", "owner=other", "address=0x123", "walletId=foreign-wallet", "rpc=https://other.invalid", "chainId=4217"]) {
    const response = await handler(statusRequest(query));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_tempo_query" });
  }
});

test("HTTP owner selection is independent for two users and rejects mismatched successful reads", async () => {
  const secondOwner = "did:privy:tempo-owner-b";
  const secondAddress = `0x${"b".repeat(40)}`;
  const seen: string[] = [];
  const dependencies = {
    authenticate: async (token: string) => ({ user_id: token === "valid-b" ? secondOwner : userId }),
    wallets: async () => [
      { id: wallet.id, userId, address, chainType: "ethereum", network: "tempo:moderato", status: "active" },
      { id: "evm-b", userId: secondOwner, address: secondAddress, chainType: "ethereum", network: "tempo:moderato", status: "active" },
    ],
    read: async (walletAddress: string) => { seen.push(walletAddress); return available(walletAddress); }, enabled: () => true,
  };
  for (const [token, expected] of [["valid-a", address], ["valid-b", secondAddress], ["valid-a", address]]) {
    const response = await createTempoStatusHandler(dependencies)(statusRequest("", token));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).address, expected);
  }
  assert.deepEqual(seen, [address, secondAddress, address]);
  for (const reading of [{ ...available(), address: secondAddress }, { ...available(), chainId: 4217 }]) {
    const response = await createTempoStatusHandler({ ...dependencies, read: async () => reading as TempoWalletReading })(statusRequest());
    assert.equal(response.status, 502);
    assert.equal("balance" in await response.json(), false);
  }
});

async function withTempo(run: () => Promise<void>) {
  const env = { CARMELITA_TEMPO_TESTNET_ENABLED: "true", CARMELITA_PREVIEW_ISOLATED: "true", VERCEL_ENV: "preview" };
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try { await run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
