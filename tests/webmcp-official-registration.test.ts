import assert from "node:assert/strict";
import test from "node:test";
import {
  detectWebMcpStatus,
  registerCarmelitaWebMcpTools,
  type WebMcpToolDefinition,
} from "../app/webmcp-client";

test("detectWebMcpStatus returns false outside browser environment", () => {
  const status = detectWebMcpStatus();
  assert.equal(status.supported, false);
  assert.equal(status.source, "none");
  assert.equal(status.flagInstructionsNeeded, true);
});

test("registerCarmelitaWebMcpTools registers tools into mock document.modelContext", async () => {
  const registeredTools: WebMcpToolDefinition[] = [];

  const mockModelContext = {
    registerTool: async (tool: WebMcpToolDefinition) => {
      registeredTools.push(tool);
    },
  };

  // Mock global document.modelContext
  const originalDocument = globalThis.document;
  // @ts-expect-error Mocking global document for test
  globalThis.document = { modelContext: mockModelContext };

  try {
    const status = await registerCarmelitaWebMcpTools(async () => "mock-token");
    assert.equal(status.supported, true);
    assert.equal(status.source, "document.modelContext");
    assert.equal(status.toolsRegistered.length, 3);
    assert.ok(status.toolsRegistered.includes("carmelita_get_multichain_wallets"));
    assert.ok(status.toolsRegistered.includes("carmelita_fund_solana_devnet"));
    assert.ok(status.toolsRegistered.includes("carmelita_get_solana_status"));
  } finally {
    globalThis.document = originalDocument;
  }
});
