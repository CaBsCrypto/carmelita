import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getNotionAccessToken } from "@/app/connectors/notion-oauth";

type TextContent = { type: "text"; text: string };

export function textFromResult(content: unknown) {
  if (!Array.isArray(content)) throw new Error("notion_response_invalid");
  const text = content
    .filter(
      (item): item is TextContent =>
        Boolean(
          item &&
            typeof item === "object" &&
            "type" in item &&
            item.type === "text" &&
            "text" in item &&
            typeof item.text === "string",
        ),
    )
    .map((item) => item.text)
    .join("\n\n");
  if (!text.trim()) throw new Error("notion_response_invalid");
  return text.slice(0, 12_000);
}

async function withNotionClient<T>(
  userId: string,
  operation: (client: Client) => Promise<T>,
) {
  const token = await getNotionAccessToken(userId);
  const client = new Client(
    { name: "agent-assistant", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.notion.com/mcp"),
    {
      requestInit: {
        headers: {
          Authorization: "Bearer " + token,
          "User-Agent": "agent-assistant/0.1.0",
        },
      },
    },
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { await client.connect(transport); return operation(client); })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { void client.close().catch(() => undefined); reject(new Error("notion_request_timeout")); }, 20_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    await client.close().catch(() => undefined);
  }
}

export async function searchNotion(userId: string, query: string) {
  return withNotionClient(userId, async (client) => {
    const tools = await client.listTools();
    const searchTool = tools.tools.find(
      (tool) => tool.name === "notion-search" || tool.name === "search",
    );
    if (!searchTool) throw new Error("notion_search_tool_unavailable");

    const result = await client.callTool({
      name: searchTool.name,
      arguments: { query: query.slice(0, 500) },
    });
    if (result.isError) throw new Error("notion_search_failed");
    return { tool: searchTool.name, ...normalizeNotionSearchResult(result) };
  });
}
export type NotionSource = { title: string; url: string };
export function normalizeNotionSearchResult(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("notion_response_invalid");
  const result = value as { content?: unknown; structuredContent?: unknown };
  const text = textFromResult(result.content);
  const sources: NotionSource[] = [];
  let empty = false;
  const visit = (value: unknown, depth = 0) => {
    if (depth > 8 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { for (const item of value.slice(0, 100)) visit(item, depth + 1); return; }
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.results) && record.results.length === 0) empty = true;
    if (typeof record.title === "string" && typeof record.url === "string") {
      try {
        const url = new URL(record.url);
        if (url.protocol === "https:" && !url.username && !url.password && record.title.trim() && !sources.some(source => source.url === url.href)) {
          sources.push({ title: record.title.slice(0, 300), url: url.href });
        }
      } catch { /* Invalid source URLs are never rendered. */ }
    }
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(result.structuredContent);
  try { visit(JSON.parse(text)); } catch { /* Non-JSON responses require explicit links. */ }
  for (const match of text.matchAll(/\[([^\]\n]{1,300})\]\((https:\/\/[^\s)]+)\)/g)) visit({ title: match[1], url: match[2] });
  if (!sources.length && !empty) throw new Error("notion_sources_unavailable");
  return { text, sources: sources.slice(0, 50), empty: !sources.length && empty };
}
