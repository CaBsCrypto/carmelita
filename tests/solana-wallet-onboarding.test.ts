import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";
import { getPrivyUserWalletExternalId, isValidWalletAddress } from "../app/wallets/privy";

test("isValidWalletAddress validates Solana Base58 addresses", () => {
  const validSolanaAddress = "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK";
  const invalidSolanaAddress = "0x1111111111111111111111111111111111111111";

  assert.equal(isValidWalletAddress("solana", validSolanaAddress), true);
  assert.equal(isValidWalletAddress("solana", invalidSolanaAddress), false);
});

test("getPrivyUserWalletExternalId generates aa_solana_ prefix", () => {
  const externalId = getPrivyUserWalletExternalId("did:privy:testuser", "solana");
  assert.match(externalId, /^aa_solana_[a-f0-9]{40}$/);
});

test("buildMcpWalletContext incorporates solana:devnet deterministically", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active" },
    { address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", chainType: "solana", network: "solana:devnet", status: "active" },
  ]);

  assert.equal(context.walletsByNetwork.stellarTestnet?.network, "stellar:testnet");
  assert.equal(context.walletsByNetwork.avalancheFuji?.network, "avalanche:fuji");
  assert.equal(context.walletsByNetwork.solanaDevnet?.network, "solana:devnet");
  assert.deepEqual(context.walletReadiness, {
    complete: true,
    missingNetworks: [],
    suppressedStaleWallets: 0,
  });
});
