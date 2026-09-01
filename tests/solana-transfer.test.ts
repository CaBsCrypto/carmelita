import assert from "node:assert/strict";
import test from "node:test";
import { isValidWalletAddress } from "../app/wallets/privy";
import { buildSolanaTransferTransaction } from "../app/wallets/solana-transfer";

const fromAddress = "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK";
const toAddress = "9aE456txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK";

test("isValidWalletAddress validates Solana Base58 public key addresses", () => {
  assert.equal(isValidWalletAddress("solana", fromAddress), true);
  assert.equal(isValidWalletAddress("solana", toAddress), true);
  assert.equal(isValidWalletAddress("solana", "invalid-short"), false);
  assert.equal(isValidWalletAddress("solana", "0x1111111111111111111111111111111111111111"), false);
});

test("buildSolanaTransferTransaction validates input addresses and amounts", async () => {
  await assert.rejects(
    () => buildSolanaTransferTransaction({ fromAddress: "bad", toAddress, solAmount: 0.1 }),
    /invalid_from_solana_address/,
  );

  await assert.rejects(
    () => buildSolanaTransferTransaction({ fromAddress, toAddress: "bad", solAmount: 0.1 }),
    /invalid_to_solana_address/,
  );

  await assert.rejects(
    () => buildSolanaTransferTransaction({ fromAddress, toAddress, solAmount: -1 }),
    /invalid_sol_amount/,
  );
});
