import assert from "node:assert/strict";
import test from "node:test";
import {
  getSolanaDevnetBalance,
  requestSolanaDevnetAirdrop,
} from "../app/wallets/solana-client";

test("getSolanaDevnetBalance queries Solana JSON-RPC and formats SOL balance", async () => {
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.method, "getBalance");
    assert.equal(body.params[0], "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK");

    return Response.json({
      jsonrpc: "2.0",
      result: {
        context: { slot: 100 },
        value: 2_500_000_000, // 2.5 SOL
      },
      id: 1,
    });
  };

  const balance = await getSolanaDevnetBalance(
    "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK",
    mockFetch,
  );

  assert.equal(balance.address, "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK");
  assert.equal(balance.lamports, 2_500_000_000);
  assert.equal(balance.sol, 2.5);
  assert.equal(balance.formatted, "2.5000 SOL");
});

test("requestSolanaDevnetAirdrop sends requestAirdrop JSON-RPC to Devnet", async () => {
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.method, "requestAirdrop");
    assert.equal(body.params[0], "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK");
    assert.equal(body.params[1], 1_000_000_000);

    return Response.json({
      jsonrpc: "2.0",
      result: "5K...solanaSignatureHash",
      id: 1,
    });
  };

  const result = await requestSolanaDevnetAirdrop(
    "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK",
    1,
    mockFetch,
  );

  assert.equal(result.signature, "5K...solanaSignatureHash");
  assert.equal(result.lamports, 1_000_000_000);
  assert.equal(result.formatted, "1 SOL");
});

test("Solana client rejects invalid Base58 address", async () => {
  await assert.rejects(
    () => getSolanaDevnetBalance("invalid-address!"),
    /invalid_solana_address/,
  );
  await assert.rejects(
    () => requestSolanaDevnetAirdrop("0x123"),
    /invalid_solana_address/,
  );
});
