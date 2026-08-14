import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpWalletContext } from "../app/mcp/agent-context";

test("MCP wallet context names both persisted testnet wallets deterministically", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
    { address: "0x1111111111111111111111111111111111111111", chainType: "ethereum", network: "avalanche:fuji", status: "active" },
  ]);
  assert.equal(context.walletsByNetwork.stellarTestnet?.network, "stellar:testnet");
  assert.equal(context.walletsByNetwork.avalancheFuji?.network, "avalanche:fuji");
  assert.deepEqual(context.walletReadiness, { complete: true, missingNetworks: [] });
  assert.doesNotMatch(JSON.stringify(context), /privateKey|secret|walletId/i);
});

test("MCP wallet context reports missing Fuji instead of inventing it", () => {
  const context = buildMcpWalletContext([
    { address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", chainType: "stellar", network: "stellar:testnet", status: "active" },
  ]);
  assert.equal(context.walletsByNetwork.avalancheFuji, null);
  assert.deepEqual(context.walletReadiness.missingNetworks, ["avalanche:fuji"]);
});
