import assert from "node:assert/strict";
import test from "node:test";
import { fetchWalletReadings, readingMatchesWallet, type WalletReading, type WalletRow } from "../app/agent/wallet-readings";

const address = `0x${"a".repeat(40)}`;
const wallets: WalletRow[] = ["avalanche:fuji", "bnb:testnet", "base:sepolia"].map((network) => ({ id: "same-privy-wallet", address, chainType: "ethereum", network, status: "active" }));
const metadata = wallets.map((wallet) => ({ id: wallet.network, family: "evm", name: wallet.network, nativeAsset: "test", rollout: "experimental" }));
const status = (network: string, chainId: number, balance: string): WalletReading => ({ address, network, chainId, balance, nativeAsset: "test", explorerUrl: "https://test.example/address" });

test("one EVM identity keeps three independent balances, including zero", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, options) => {
    const path = String(input);
    calls.push(path);
    assert.equal(options?.method, undefined, "UI must only read balances");
    assert.equal(options?.signal?.aborted, false);
    if (path === "/api/agent/wallets") return Response.json({ wallets, networks: metadata });
    if (path.endsWith("/avalanche")) return Response.json(status("avalanche:fuji", 43113, "2.1"));
    if (path.includes("bnb%3Atestnet")) return Response.json(status("bnb:testnet", 97, "0"));
    return Response.json(status("base:sepolia", 84532, "0.125"));
  };
  const result = await fetchWalletReadings("test-token", new AbortController().signal, fetcher);
  assert.equal(result.wallets.length, 3);
  assert.equal(new Set(result.wallets.map((wallet) => wallet.id)).size, 1);
  assert.deepEqual(Object.values(result.readings).map((reading) => reading.balance).sort(), ["0", "0.125", "2.1"]);
  assert.deepEqual(result.failedNetworks, []);
  assert.equal(calls.length, 4);
});

test("failed RPC or wrong network cannot replace a missing balance with zero or another chain", async () => {
  const fetcher: typeof fetch = async (input) => {
    const path = String(input);
    if (path === "/api/agent/wallets") return Response.json({ wallets, networks: metadata });
    if (path.endsWith("/avalanche")) return Response.json(status("avalanche:fuji", 43113, "7"));
    if (path.includes("bnb%3Atestnet")) return Response.json({ error: "evm_rpc_failed" }, { status: 502 });
    return Response.json(status("bnb:testnet", 97, "99"));
  };
  const result = await fetchWalletReadings("test-token", new AbortController().signal, fetcher);
  assert.deepEqual(Object.keys(result.readings), ["avalanche:fuji"]);
  assert.deepEqual(result.failedNetworks.sort(), ["base:sepolia", "bnb:testnet"]);
});

test("stale account responses, changed addresses and Mainnet results are rejected", async () => {
  assert.equal(readingMatchesWallet(wallets[1], { ...status("bnb:testnet", 97, "0"), address: `0x${"b".repeat(40)}` }), false);
  assert.equal(readingMatchesWallet(wallets[1], status("bnb:testnet", 56, "0")), false);
  assert.equal(readingMatchesWallet(wallets[1], { ...status("bnb:testnet", 97, "0"), address: address.toUpperCase().replace("0X", "0x") }), true);
  const controller = new AbortController();
  const fetcher: typeof fetch = async (input) => {
    if (String(input) === "/api/agent/wallets") return Response.json({ wallets, networks: metadata });
    controller.abort();
    return Response.json(status("bnb:testnet", 97, "100"));
  };
  await assert.rejects(fetchWalletReadings("test-token", controller.signal, fetcher), { name: "AbortError" });
});

test("disabled networks are not requested and HTTP auth failure publishes no wallet snapshot", async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input) === "/api/agent/wallets") return Response.json({ wallets, networks: metadata.map((network) => ({ ...network, rollout: network.id === "avalanche:fuji" ? "experimental" : "planned" })) });
    assert.equal(String(input), "/api/agent/wallets/avalanche");
    return Response.json(status("avalanche:fuji", 43113, "0"));
  };
  const result = await fetchWalletReadings("test-token", new AbortController().signal, fetcher);
  assert.deepEqual(result.wallets.map((wallet) => wallet.network), ["avalanche:fuji"]);
  await assert.rejects(fetchWalletReadings("expired-token", new AbortController().signal, async () => Response.json({}, { status: 401 })), /wallet_list_unavailable/);
});
