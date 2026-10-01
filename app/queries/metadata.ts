import { z } from "zod";
import { defineQuery } from "./types";
import { AVALANCHE_MCP_ENDPOINT, listAvalancheReadOnlyTools } from "@/app/connectors/avalanche-mcp";

const defaultDependencies = { docsTools: listAvalancheReadOnlyTools };

export function createMetadataQueries(overrides: Partial<typeof defaultDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return [
  defineQuery({
    id: "offchain.capabilities.list", toolName: "list_capabilities", title: "List Carmelita capabilities",
    description: "Read installed capabilities, channel coverage, acceptance and approval boundaries. Implementation does not establish an individual connection or current provider availability.",
    inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "capability_metadata",
    execute: async () => {
      const { listGatewayCapabilities } = await import("@/app/agent-gateway/catalog");
      const { GATEWAY_API_VERSION, GATEWAY_ENVIRONMENT } = await import("@/app/agent-gateway/types");
      return { apiVersion: GATEWAY_API_VERSION, environment: GATEWAY_ENVIRONMENT, capabilities: listGatewayCapabilities() };
    },
  }),
  defineQuery({
    id: "offchain.capabilities.get", toolName: "get_capability", title: "Get one Carmelita capability",
    description: "Inspect one capability's requirements, channels and approval boundary without executing it.",
    inputSchema: z.object({ capabilityId: z.string().trim().min(3).max(120) }).strict(), scope: "agent:read", dataScope: "capability_metadata",
    execute: async ({ capabilityId }) => (await import("@/app/agent-gateway/catalog")).getGatewayCapability(capabilityId),
  }),
  defineQuery({
    id: "avalanche.capabilities.list", toolName: "list_avalanche_capabilities", title: "List Avalanche capabilities",
    description: "Read Avalanche capability status, requirements and approval boundaries. No financial action is executed or prepared.",
    inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "capability_metadata",
    execute: async () => ({ capabilities: (await import("@/app/avalanche/capability-registry")).listAvalancheCapabilities() }),
  }),
  defineQuery({
    id: "avalanche.docs.tools", toolName: "read_avalanche_docs_tools", title: "Read available Avalanche documentation tools",
    description: "Inspect the official Avalanche MCP documentation tool allowlist. Returns only bounded public tool availability metadata, never invokes remote business tools or executes their instructions.",
    inputSchema: z.object({}).strict(), scope: "agent:read", dataScope: "provider_metadata",
    execute: async () => {
      try { return await dependencies.docsTools(); }
      catch { return { status: "unavailable", code: "avalanche_docs_tools_unavailable", source: "Avalanche Builder Hub MCP", sourceUrl: AVALANCHE_MCP_ENDPOINT, queriedAt: new Date().toISOString(), readOnly: true }; }
    },
  }),
  ];
}

export const metadataQueries = createMetadataQueries();
