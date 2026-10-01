import assert from "node:assert/strict";
import test from "node:test";
import { getErc20Balance } from "../app/wallets/evm-rpc";
import { getWalletNetwork } from "../app/wallets/networks";

const wallet = `0x${"a".repeat(40)}`;
const token = `0x${"b".repeat(40)}`;
const network = getWalletNetwork("avalanche:fuji");
function fetchBalance(result: unknown): typeof fetch {
  return async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.method, "eth_call");
    assert.equal(request.params[0].to, token);
    assert.equal(request.params[0].data, `0x70a08231${wallet.slice(2).padStart(64, "0")}`);
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
}

test("ERC20 balance rejects coerced primitives, malformed hex and non-ABI quantities", async () => {
  for (const value of [true, false, null, 0, 1, {}, [], "", "0x", "0x1", "0x00", "-1", "1", `0x${"g".repeat(64)}`, `0x${"0".repeat(63)}`, `0x${"0".repeat(65)}`]) {
    await assert.rejects(getErc20Balance(network, token, wallet, 6, fetchBalance(value)), /evm_rpc_(invalid_erc20_balance|failed)/);
  }
});

test("ERC20 correct ABI zero remains a measured zero, not unavailability", async () => {
  const result = await getErc20Balance(network, token, wallet, 6, fetchBalance(`0x${"0".repeat(64)}`));
  assert.deepEqual(result, { tokenAddress: token, walletAddress: wallet, atomic: "0", balance: "0", decimals: 6 });
});

test("ERC20 one ABI word preserves exact decimal precision and contract identity", async () => {
  const result = await getErc20Balance(network, token, wallet, 6, fetchBalance(`0x${BigInt(1_234_567).toString(16).padStart(64, "0")}`));
  assert.equal(result.atomic, "1234567");
  assert.equal(result.balance, "1.234567");
  assert.equal(result.tokenAddress, token);
  assert.equal(result.walletAddress, wallet);
});
