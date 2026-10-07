export const MCP_URL = "https://carmelita.browns.studio/api/mcp/agent";
export const OPENAI_GUIDE = "https://developers.openai.com/plugins/deploy/connect-chatgpt";

/** Server configuration only; never derive an OAuth resource from the browser host. */
export function connectionConfiguration(env: { CARMELITA_PUBLIC_ORIGIN?: string; VERCEL_ENV?: string }) {
  if (env.VERCEL_ENV === "production") return { mcpUrl: MCP_URL, environment: "production" as const };
  try {
    const origin = new URL(env.CARMELITA_PUBLIC_ORIGIN || (env.VERCEL_ENV === "preview" ? "" : "https://carmelita.browns.studio"));
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("invalid_origin");
    const production = origin.origin === "https://carmelita.browns.studio";
    if (env.VERCEL_ENV === "preview" && production) throw new Error("preview_requires_qa_origin");
    return { mcpUrl: origin.origin + "/api/mcp/agent", environment: production ? "production" as const : "qa" as const };
  } catch { return { mcpUrl: null, environment: "unavailable" as const }; }
}
