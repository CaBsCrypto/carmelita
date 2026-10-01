import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getErc20Balance } from "../app/wallets/evm-rpc";
import { getWalletNetwork } from "../app/wallets/networks";

test("chat leaves detailed wallet reads to the single authoritative registry panel", async () => {
  const chat = await readFile(new URL("../app/agent/agent-chat.tsx", import.meta.url), "utf8");
  // Mounting the former display-only selector would issue duplicate network
  // reads. Registry projection and its sole mounting are tested separately.
  assert.doesNotMatch(chat, /ContextWalletSelector/);
  assert.doesNotMatch(chat, /useWalletReadings/);
});

test("formats official Fuji ERC-20 balances for the selector", async () => {
  const wallet = `0x${"a".repeat(40)}`;
  const token = `0x${"b".repeat(40)}`;
  const fetcher: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.method, "eth_call");
    assert.equal(request.params[0].to, token);
    assert.equal(request.params[0].data, `0x70a08231${wallet.slice(2).padStart(64, "0")}`);
    return Response.json({ jsonrpc: "2.0", id: 1, result: `0x${"1312d00".padStart(64, "0")}` });
  };
  const result = await getErc20Balance(getWalletNetwork("avalanche:fuji"), token, wallet, 6, fetcher);
  assert.equal(result.balance, "20");
});
