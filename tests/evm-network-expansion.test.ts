import assert from "node:assert/strict";
import test from "node:test";
import { enabledEvmNetworks, isEvmExpansionEnabled, getWalletNetwork } from "../app/wallets/networks";
import { ensureEvmTestnetWallet } from "../app/wallets/evm-onboarding";
import { selectEvmWallet, getPrivyUserWalletExternalId } from "../app/wallets/privy";
import { createEvmStatusHandler } from "../app/wallets/evm-status";
import { diagnoseEvmWallet } from "../app/wallets/evm-rpc";
import type { UserWallet } from "../app/wallets/types";

const userId = "did:privy:evm-expansion-a";
const address = `0x${"aB".repeat(20)}`;
const externalId = getPrivyUserWalletExternalId(userId, "evm");
const wallet: UserWallet = { id: "canonical-evm", address, chainType: "ethereum", family: "evm", created: false, owner: "user" };
const candidate = { id: wallet.id, address, chain_type: "ethereum", external_id: externalId };
const canonical = { id: wallet.id, address, userId, chainType: "ethereum" };

async function expanded(operation: () => Promise<void>) {
  const keys = ["VERCEL_ENV", "CARMELITA_PREVIEW_ISOLATED", "CARMELITA_EVM_TESTNET_EXPANSION_ENABLED"] as const;
  const before = keys.map((key) => process.env[key]);
  Object.assign(process.env, { VERCEL_ENV: "preview", CARMELITA_PREVIEW_ISOLATED: "true", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true" });
  try { await operation(); } finally {
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
  }
}

test("expansion requires explicit activation and isolates Preview from Production", () => {
  const env = { VERCEL_ENV: "preview", CARMELITA_PREVIEW_ISOLATED: "true", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true" };
  assert.equal(isEvmExpansionEnabled(env), true);
  for (const override of [{ VERCEL_ENV: "production" }, { CARMELITA_PREVIEW_ISOLATED: "false" }, { CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: undefined }]) {
    assert.equal(isEvmExpansionEnabled({ ...env, ...override }), false);
  }
  assert.equal(isEvmExpansionEnabled({ VERCEL_ENV: "production", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true" }), true);
  assert.equal(isEvmExpansionEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(isEvmExpansionEnabled({ VERCEL_ENV: "development", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true" }), false);
  assert.equal(isEvmExpansionEnabled({ VERCEL_ENV: "production", CARMELITA_EVM_TESTNET_EXPANSION_ENABLED: "true", CARMELITA_PREVIEW_DATABASE_URL: "" }), false);
});

test("automatic onboarding resolves one EVM wallet and persists all three networks atomically", async () => expanded(async () => {
  let resolutions = 0;
  const persisted: string[][] = [];
  const first = await ensureEvmTestnetWallet({ userId, email: null }, {
    getOrCreateWallet: async () => { resolutions++; return wallet; },
    persistNetworks: async (input) => { persisted.push(input.networks); assert.equal(input.wallet.id, wallet.id); return input.wallet; },
  });
  assert.equal(resolutions, 1);
  assert.deepEqual(persisted, [["avalanche:fuji", "bnb:testnet", "base:sepolia"]]);
  assert.deepEqual(first.networks.map((network) => network.chainId), [43113, 97, 84532]);
  assert.equal(first.wallet.address, address);
  assert.equal(first.signingRequired, false);
  assert.equal(first.fundsMoved, false);
}));

test("canonical EVM selection is stable across list order and address casing", () => {
  const other = { ...candidate, id: "other-wallet", address: `0x${"c".repeat(40)}`, external_id: "other" };
  for (const candidates of [[other, { ...candidate, address: address.toLowerCase() }], [candidate, other]]) {
    assert.equal(selectEvmWallet(candidates, { userId, externalId, canonical })?.id, wallet.id);
    assert.equal(selectEvmWallet(candidates, { userId, externalId, canonical })?.address, address);
  }
});

test("canonical identity mismatch cannot fall back to another wallet", () => {
  for (const candidates of [[], [{ ...candidate, id: "other" }], [{ ...candidate, address: `0x${"c".repeat(40)}` }]]) {
    assert.throws(() => selectEvmWallet(candidates, { userId, externalId, canonical }), /wallet_identity_conflict/);
  }
  assert.throws(() => selectEvmWallet([candidate], { userId: "did:privy:other", externalId, canonical }), /wallet_identity_conflict/);
});

test("unpersisted EVM selection prefers exact external identity, rejects ambiguous legacy wallets", () => {
  const other = { ...candidate, id: "other", external_id: "legacy" };
  assert.equal(selectEvmWallet([other, candidate], { userId, externalId, canonical: null })?.id, wallet.id);
  assert.throws(() => selectEvmWallet([other, { ...candidate, external_id: "legacy2" }], { userId, externalId, canonical: null }), /ambiguous/);
  assert.equal(selectEvmWallet([other], { userId, externalId, canonical: null })?.id, "other");
});

function request(query: string, token = "qa-token") {
  return new Request(`https://preview.example/api/agent/wallets/evm?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}
function statusDependencies() {
  const reads: string[] = [];
  const dependencies = {
    authenticate: async (token: string) => { assert.equal(token, "qa-token"); return { user_id: userId }; },
    wallets: async (owner: string) => { assert.equal(owner, userId); return enabledEvmNetworks().map((network) => ({ ...wallet, network: network.id, status: "active" })); },
    diagnose: async (network: ReturnType<typeof getWalletNetwork>, selectedAddress: string) => {
      assert.equal(selectedAddress, address);
      reads.push(network.id);
      return { network: network.id, chainId: network.chainId!, address, balance: network.id === "bnb:testnet" ? "2" : "1", balanceWei: "1", nativeAsset: network.nativeAsset, gasPriceWei: "1", nonce: 0, funded: true, explorerUrl: `${network.explorerUrl}/address/${address}`, faucetUrl: undefined };
    },
  };
  return { dependencies, reads };
}

test("EVM status reads only authenticated owner and requested enabled network", async () => expanded(async () => {
  const { dependencies, reads } = statusDependencies();
  const handler = createEvmStatusHandler(dependencies);
  for (const [network, balance] of [["bnb:testnet", "2"], ["base:sepolia", "1"]]) {
    const response = await handler(request(`network=${network}`));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.balance, balance); assert.equal(body.address, address);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(reads, ["bnb:testnet", "base:sepolia"]);
}));

test("EVM status rejects unauthenticated, arbitrary owner/address/RPC and Mainnet selectors", async () => expanded(async () => {
  const { dependencies, reads } = statusDependencies();
  const handler = createEvmStatusHandler(dependencies);
  assert.equal((await handler(request("network=bnb:testnet", ""))).status, 401);
  for (const query of ["network=bnb:mainnet", "network=stellar:testnet", "network=base:sepolia&network=bnb:testnet", "network=bnb:testnet&userId=other", "network=bnb:testnet&address=other", "network=bnb:testnet&rpc=https://other.example"]) {
    assert.equal((await handler(request(query))).status, 400);
  }
  assert.deepEqual(reads, []);
}));

test("disabled networks, missing bindings and RPC failures are explicit and never zero balance", async () => expanded(async () => {
  const { dependencies, reads } = statusDependencies();
  process.env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED = "false";
  assert.equal((await createEvmStatusHandler(dependencies)(request("network=bnb:testnet"))).status, 409);
  process.env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED = "true";
  assert.equal((await createEvmStatusHandler({ ...dependencies, wallets: async () => [] })(request("network=bnb:testnet"))).status, 409);
  for (const message of ["timeout", "evm_chain_id_mismatch"]) {
    const response = await createEvmStatusHandler({ ...dependencies, diagnose: async () => { throw new Error(message); } })(request("network=bnb:testnet"));
    assert.equal(response.status, 502);
    assert.equal("balance" in await response.json(), false);
  }
  assert.deepEqual(reads, []);
}));

test("RPC diagnostics reject wrong chain and use independent balances on all three EVMs", async () => expanded(async () => {
  for (const network of enabledEvmNetworks()) {
    const fetcher: typeof fetch = async (_url, init) => {
      assert.ok(init?.signal);
      const { method } = JSON.parse(String(init?.body));
      const results: Record<string, string> = { eth_chainId: `0x${network.chainId!.toString(16)}`, eth_getBalance: "0x0", eth_gasPrice: "0x1", eth_getTransactionCount: "0x0" };
      return Response.json({ jsonrpc: "2.0", id: 1, result: results[method] });
    };
    assert.equal((await diagnoseEvmWallet(network, address, fetcher)).balance, "0");
    for (const wrong of [56, 1, network.chainId === 97 ? 43113 : 97]) {
      const wrongFetcher: typeof fetch = async (url, init) => JSON.parse(String(init?.body)).method === "eth_chainId"
        ? Response.json({ result: `0x${wrong.toString(16)}` }) : fetcher(url, init);
      await assert.rejects(diagnoseEvmWallet(network, address, wrongFetcher), /evm_chain_id_mismatch/);
    }
  }
}));

test("malformed RPC balances are rejected instead of coerced to zero", async () => {
  const network = getWalletNetwork("avalanche:fuji");
  for (const invalid of [null, 0, -1, "-1", "", "0", "0x00", {}, "0x"]) {
    const fetcher: typeof fetch = async (_url, init) => {
      const { method } = JSON.parse(String(init?.body));
      const result = method === "eth_chainId" ? "0xa869" : method === "eth_getBalance" ? invalid : "0x0";
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    };
    await assert.rejects(diagnoseEvmWallet(network, address, fetcher), /evm_rpc_invalid_quantity/);
  }
});
