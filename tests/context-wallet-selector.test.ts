import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getErc20Balance } from "../app/wallets/evm-rpc";
import { getWalletNetwork } from "../app/wallets/networks";

test("Live Context mounts the compact multichain wallet selector", async () => {
  const chat = await readFile(new URL("../app/agent/agent-chat.tsx", import.meta.url), "utf8");
  const selector = await readFile(new URL("../app/agent/context-wallet-selector.tsx", import.meta.url), "utf8");
  assert.match(chat, /<ContextWalletSelector/);
  assert.match(selector, /<details className="context-wallet-selector"/);
  assert.match(selector, /aria-label=\{t\.open\}/);
  assert.match(selector, /Stellar Testnet/);
  assert.match(selector, /Fuji · 43113/);
  assert.match(selector, /Solana Devnet/);
  assert.match(selector, /filter\(Boolean\)\.length/);
  assert.match(selector, /balances\?\.usdc\.balance/);
});

test("formats official Fuji ERC-20 balances for the selector", async () => {
  const wallet = `0x${"a".repeat(40)}`;
  const token = `0x${"b".repeat(40)}`;
  const fetcher: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.method, "eth_call");
    assert.equal(request.params[0].to, token);
    assert.equal(request.params[0].data, `0x70a08231${wallet.slice(2).padStart(64, "0")}`);
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1312d00" });
  };
  const result = await getErc20Balance(getWalletNetwork("avalanche:fuji"), token, wallet, 6, fetcher);
  assert.equal(result.balance, "20");
});
