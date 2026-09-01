import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";

test("MCP wallet context names all persisted testnet wallets deterministically", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active" },
    { address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", chainType: "solana", network: "solana:devnet", status: "active" },
  ]);
  assert.equal(context.walletsByNetwork.stellarTestnet?.network, "stellar:testnet");
  assert.equal(context.walletsByNetwork.avalancheFuji?.network, "avalanche:fuji");
  assert.equal(context.walletsByNetwork.solanaDevnet?.network, "solana:devnet");
  assert.deepEqual(context.walletReadiness, { complete: true, missingNetworks: [], suppressedStaleWallets: 0 });
  assert.doesNotMatch(JSON.stringify(context), /privateKey|secret|walletId/i);
});

test("MCP wallet context reports missing Fuji instead of inventing it", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
  ]);
  assert.equal(context.walletsByNetwork.avalancheFuji, null);
  assert.deepEqual(context.walletReadiness.missingNetworks, ["avalanche:fuji", "solana:devnet"]);
});

test("MCP reconnect view preserves active Stellar and suppresses its stale pending duplicate", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { address: "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBEZQ", chainType: "stellar", network: "stellar:testnet", status: "pending" },
    { address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active" },
    { address: "4nd126txEsFDzA5E6zpGFg7Jz4E7h9zE94iY1h4p8YmK", chainType: "solana", network: "solana:devnet", status: "active" },
  ]);

  assert.equal(context.walletsByNetwork.stellarTestnet?.status, "active");
  assert.equal(context.wallets.some((wallet) => wallet.status === "pending"), false);
  assert.equal(context.walletReadiness.complete, true);
  assert.equal(context.walletReadiness.suppressedStaleWallets, 1);
});
