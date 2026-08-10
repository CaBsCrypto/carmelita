import assert from "node:assert/strict";
import test from "node:test";
import {
  externalMcpHeaders,
  forbiddenExternalToolNames,
  validateExternalMcpPilot,
  type ExternalMcpPilotClient,
} from "../scripts/agent-gateway-external-mcp-pilot";

function text(value: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

test("external MCP pilot adds auth and optional Vercel bypass headers", () => {
  assert.deepEqual(externalMcpHeaders("pat-secret", "bypass-secret"), {
    Authorization: "Bearer pat-secret",
    "User-Agent": "carmelita-external-mcp-pilot/0.1.0",
    "x-vercel-protection-bypass": "bypass-secret",
  });
  assert.equal(externalMcpHeaders("pat-secret")["x-vercel-protection-bypass"], undefined);
});

test("external MCP pilot rejects execution-like tool names", () => {
  assert.deepEqual(forbiddenExternalToolNames([
    { name: "list_capabilities" },
    { name: "approve_payment" },
    { name: "wallet-sign" },
    { name: "submit" },
    { name: "execute_action" },
    { name: "signed_receipt" },
  ]), ["approve_payment", "wallet-sign", "submit", "execute_action"]);
});

test("external MCP pilot lists and plans Testnet without execution", async () => {
  const calls: string[] = [];
  const client: ExternalMcpPilotClient = {
    async listTools() {
      return { tools: [{ name: "list_capabilities" }, { name: "plan_action" }, { name: "get_capability" }] };
    },
    async callTool(input) {
      calls.push(input.name);
      if (input.name === "list_capabilities") {
        return text({ environment: "testnet", capabilities: [] });
      }
      return text({
        plan: {
          environment: "testnet",
          safety: {
            fundsMoved: false,
            transactionPrepared: false,
            serverSideSigning: false,
            executionEnabled: false,
          },
        },
      });
    },
  };

  assert.deepEqual(await validateExternalMcpPilot(client), { toolCount: 3 });
  assert.deepEqual(calls, ["list_capabilities", "plan_action"]);
});

test("external MCP pilot fails closed when an unsafe tool is exposed", async () => {
  const client: ExternalMcpPilotClient = {
    async listTools() {
      return { tools: [{ name: "list_capabilities" }, { name: "plan_action" }, { name: "submit_transaction" }] };
    },
    async callTool() {
      throw new Error("must_not_call");
    },
  };
  await assert.rejects(validateExternalMcpPilot(client), /unsafe_tools_exposed:submit_transaction/);
});