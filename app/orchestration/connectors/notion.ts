import type { AgentConnector } from "@/app/orchestration/connector";
import { listUserConnections } from "@/app/connectors/notion-oauth";
import { searchNotion } from "@/app/connectors/notion-mcp";

export function createNotionWorkflowConnector(search = searchNotion): AgentConnector {
  return {
    id: "notion",
    capabilities: [{
      id: "workspace.search",
      operation: "read",
      description: "Search the authenticated user's Notion workspace",
    }],
    async connectionStatus(context) {
      const connections = await listUserConnections(context.userId);
      return connections.some(
        (item) => item.provider === "notion" && item.status === "active",
      )
        ? "connected"
        : "missing";
    },
    async prepare(context, capability) {
      const query = String(context.parameters.query ?? context.request)
        .trim()
        .slice(0, 500);
      if (!query) throw new Error("notion_query_required");
      return {
        connectorId: "notion",
        capability,
        operation: "read",
        summary: `Search the connected Notion workspace for: ${query}`,
        parameters: { query },
        immutable: { query, access: "read-only", userId: context.userId },
      };
    },
    async execute(context, action) {
      const query = String(action.immutable.query ?? "");
      const result = await search(context.userId, query);
      return { tool: result.tool, text: result.text, sources: result.sources, empty: result.empty, query };
    },
    async verify(_context, execution) {
      const tool = String(execution.tool ?? "");
      const text = String(execution.text ?? "");
      return [{
        kind: "notion_mcp_response",
        reference: tool ? `notion:${tool}` : "notion:missing-tool",
        verified: Boolean(tool && text && (execution.empty === true || (Array.isArray(execution.sources) && execution.sources.length > 0))),
        metadata: { responseLength: text.length, access: "read-only" },
      }];
    },
  };
}
