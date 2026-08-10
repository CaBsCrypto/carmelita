import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

type PilotTool = { name: string };
type PilotCallResult = { isError?: boolean; content?: unknown };

export interface ExternalMcpPilotClient {
  listTools(): Promise<{ tools: PilotTool[] }>;
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<PilotCallResult>;
}

const FORBIDDEN_TOOL_SEGMENT = /(^|[_-])(approve|sign|submit|execute)([_-]|$)/i;

export function forbiddenExternalToolNames(tools: PilotTool[]) {
  return tools.map((tool) => tool.name).filter((name) => FORBIDDEN_TOOL_SEGMENT.test(name));
}

export function externalMcpHeaders(token: string, bypass?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "User-Agent": "carmelita-external-mcp-pilot/0.1.0",
  };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  return headers;
}

function resultJson(result: PilotCallResult, tool: string) {
  assert.notEqual(result.isError, true, `${tool}_returned_error`);
  assert.ok(Array.isArray(result.content), `${tool}_content_missing`);
  const text = result.content
    .filter((item): item is { type: "text"; text: string } =>
      Boolean(item && typeof item === "object" && "type" in item && item.type === "text" && "text" in item && typeof item.text === "string"))
    .map((item) => item.text)
    .join("\n");
  assert.ok(text, `${tool}_text_missing`);
  return JSON.parse(text) as Record<string, unknown>;
}

export async function validateExternalMcpPilot(client: ExternalMcpPilotClient) {
  const listedTools = await client.listTools();
  const names = listedTools.tools.map((tool) => tool.name);
  for (const required of ["list_capabilities", "plan_action"]) {
    assert.ok(names.includes(required), `required_tool_missing:${required}`);
  }
  const forbidden = forbiddenExternalToolNames(listedTools.tools);
  assert.deepEqual(forbidden, [], `unsafe_tools_exposed:${forbidden.join(",")}`);

  const capabilities = resultJson(await client.callTool({
    name: "list_capabilities",
    arguments: {},
  }), "list_capabilities");
  assert.equal(capabilities.environment, "testnet", "capabilities_not_testnet");

  const plan = resultJson(await client.callTool({
    name: "plan_action",
    arguments: {
      capabilityId: "stellar.wallet.status",
      idempotencyKey: `external-pilot-${randomUUID()}`,
      parameters: { environment: "testnet" },
      context: { requirementsSatisfied: ["stellar_wallet"] },
    },
  }), "plan_action");
  const planRecord = plan.plan as Record<string, unknown> | undefined;
  assert.equal(planRecord?.environment, "testnet", "plan_not_testnet");
  const safety = planRecord?.safety as Record<string, unknown> | undefined;
  assert.equal(safety?.fundsMoved, false, "pilot_moved_funds");
  assert.equal(safety?.transactionPrepared, false, "pilot_prepared_transaction");
  assert.equal(safety?.serverSideSigning, false, "pilot_enabled_server_signing");
  assert.equal(safety?.executionEnabled, false, "pilot_enabled_execution");

  return { toolCount: names.length };
}

export async function runExternalMcpPilot(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = env.CARMELITA_MCP_URL?.trim();
  const token = env.CARMELITA_MCP_TOKEN?.trim();
  const bypass = env.CARMELITA_VERCEL_BYPASS?.trim();
  assert.ok(endpoint, "CARMELITA_MCP_URL_required");
  assert.ok(token, "CARMELITA_MCP_TOKEN_required");
  const url = new URL(endpoint);
  assert.ok(["http:", "https:"].includes(url.protocol), "CARMELITA_MCP_URL_invalid_protocol");

  const client = new Client(
    { name: "carmelita-external-mcp-pilot", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: externalMcpHeaders(token, bypass) },
  });
  try {
    await client.connect(transport);
    return await validateExternalMcpPilot({
      listTools: () => client.listTools(),
      callTool: async (input) => {
        const result = await client.callTool(input);
        return {
          isError: "isError" in result && typeof result.isError === "boolean"
            ? result.isError
            : undefined,
          content: "content" in result ? result.content : undefined,
        };
      },
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}

const isDirectRun = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  runExternalMcpPilot()
    .then(({ toolCount }) => {
      console.log("Carmelita external MCP pilot: PASS");
      console.log("- Streamable HTTP connection: PASS");
      console.log(`- tools discovered: ${toolCount}`);
      console.log("- list_capabilities Testnet: PASS");
      console.log("- plan_action Testnet without execution: PASS");
      console.log("- approve/sign/submit/execute tools absent: PASS");
    })
    .catch(() => {
      console.error("Carmelita external MCP pilot: FAIL (external_mcp_pilot_failed)");
      process.exitCode = 1;
    });
}