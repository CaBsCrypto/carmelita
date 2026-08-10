import { NextResponse } from "next/server";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    name: "agent-assistant MCP gateway",
    description:
      "Bidirectional MCP gateway for personal agents, service providers and commerce orchestration.",
    transport: "streamable-http",
    surfaces: {
      sandbox: {
        endpoint: origin + "/api/mcp",
        authentication: "public sandbox",
        purpose:
          "Offer discovery, intent preparation, policy and duplicate-resistant demo receipts.",
      },
      personalAgent: {
        endpoint: origin + "/api/mcp/agent",
        authentication: "Privy bearer bridge or scoped carmelita_user_ personal token",
        scopes: ["agent:read", "agent:chat", "agent:plan"],
        purpose:
          "Use the authenticated user's context, connected tools and non-executing Testnet action planner.",
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
      authentication: "scoped personal bearer token for user state and planning",
      environment: "testnet",
      execution: "disabled; approvals and signing remain inside Carmelita with Privy",
    },
    outboundConnectors: {
      description:
        "The personal agent also consumes external MCP servers and APIs after user consent.",
      current: ["Notion MCP", "Travala MCP", "CoinMarketCap API"],
    },
    security: {
      custody: false,
      payments: {
        commerceSandbox: "simulated",
        x402StellarTestnet: "explicit-user-approval",
        mainnet: "disabled",
      },
      providerTokens: "SHA-256 hashes at rest; raw token returned once",
      personalTokens: "SHA-256 hashes at rest; raw token returned once",
      oauth: "OAuth 2.1 remains the public production milestone; scoped PAT is the Testnet bridge",
    },
  });
}
