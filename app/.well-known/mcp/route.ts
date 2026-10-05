import { NextResponse } from "next/server";
import { listReadQueries } from "@/app/queries/registry";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    name: "agent-assistant MCP gateway",
    description:
      "MCP gateway for a public read-only catalog, personal Testnet discovery and planning, read-only Mainnet market data, and service-provider catalogs.",
    transport: "streamable-http",
    surfaces: {
      sandbox: {
        endpoint: origin + "/api/mcp",
        authentication: "public read-only catalog",
        purpose:
          "Public offer discovery only. Legacy intent operations and private receipt lookup are disabled.",
        tools: ["search_offers", "get_offer"],
        executionEnabled: false,
      },
      personalAgent: {
        endpoint: origin + "/api/mcp/agent",
        authentication: "OAuth bearer authorization bound to the existing Privy identity, or scoped personal diagnostic token",
        scopes: ["agent:read", "agent:plan", "agent:context", "agent:conversation"],
        purpose:
          "Read authenticated context and conversation, discover capabilities, query Mainnet market prices and chain TVL, and create non-executable Testnet plans.",
        marketReadTools: ["search_market_assets", "get_market_quotes", "compare_chains"],
        readQueries: listReadQueries(),
        webQueryEndpoint: origin + "/api/agent/queries",
        toolCatalogRefresh: "Internal changes share one server. Tool or parameter changes require refreshing ChatGPT discovery and validating the returned catalog.",
      },
      serviceProvider: {
        endpoint: origin + "/api/mcp/provider",
        authentication: "scoped provider bearer token",
        scopes: ["provider:read", "provider:offers:write"],
        purpose:
          "Create, update, publish, pause and archive provider-owned service offers.",
      },
    },
    agentApi: {
      baseEndpoint: origin + "/api/v1",
      discovery: origin + "/api/v1/capabilities",
      authentication: "scoped user authorization for state and non-executable planning",
      environment: "testnet",
      execution: "disabled through the Gateway; no approval, transaction preparation, signing or submission",
    },
    outboundConnectors: {
      description:
        "The personal agent also consumes external MCP servers and APIs after user consent.",
      current: ["Notion MCP", "Travala MCP", "CoinGecko API", "CoinMarketCap Public API", "DefiLlama API"],
    },
    security: {
      custody: false,
      payments: {
        commerceSandbox: "disabled",
        x402StellarTestnet: "explicit-user-approval",
        mainnet: "disabled",
      },
      providerTokens: "SHA-256 hashes at rest; raw token returned once",
      personalTokens: "SHA-256 hashes at rest; raw token returned once",
      oauth: "Existing OAuth issuer, identity binding and granted scopes are preserved. Diagnostic tokens do not replace visible user consent.",
    },
  });
}
