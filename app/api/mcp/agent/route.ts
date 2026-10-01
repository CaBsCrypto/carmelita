import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { getGatewayCapability, listGatewayCapabilities } from "@/app/agent-gateway/catalog";
import { createGatewayPlan } from "@/app/agent-gateway/service";
import { createGatewayAudit } from "@/app/agent-gateway/operations";
import { GATEWAY_API_VERSION, GATEWAY_ENVIRONMENT } from "@/app/agent-gateway/types";
import { avalancheCapabilityIdSchema, listAvalancheCapabilities, planAvalancheCapability } from "@/app/avalanche/capability-registry";
import { searchAvaxSkills } from "@/app/connectors/avaxskills";
import { getAgentConversation } from "@/app/agent-chat-store";
import { getAgentMcpContext } from "@/app/mcp/agent-context";
import { compareChains } from "@/app/market-data/defillama";
import { executeMarketRead } from "@/app/market-data/access";
import { getMarketQuotes, searchMarketAssets } from "@/app/market-data/service";
import { chainComparisonInputSchema, marketQuotesInputSchema, marketSearchInputSchema } from "@/app/market-data/types";
import {
  authenticateMcp,
  requireMcpSubject,
  publicMcpErrorCode,
  verifyAgentMcpToken,
} from "@/app/mcp/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const ok = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
const fail = (error: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({
        error: publicMcpErrorCode(error),
      }),
    },
  ],
});

let handler: ReturnType<typeof createMcpHandler> | null = null;

function getHandler() {
  return (handler ??= createMcpHandler(
    (server) => {
      server.registerTool(
        "search_market_assets",
        {
          title: "Search market assets",
          description: "Resolve a name, ticker, provider ID or Mainnet network and token address against market catalogs. Return candidates when a ticker is ambiguous; never select the first or largest asset automatically. No wallet is created or valued.",
          inputSchema: marketSearchInputSchema.shape,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async (input, extra) => {
          try {
            return ok(await executeMarketRead(extra.authInfo, async () => {
              const parsed = marketSearchInputSchema.parse(input);
              return searchMarketAssets(parsed.asset, parsed.limit);
            }));
          } catch (error) { return fail(error); }
        },
      );
      server.registerTool(
        "get_market_quotes",
        {
          title: "Get fresh market quotes",
          description: "Read USD market data for 1 to 10 assets. Preserve returned asset identities, sources, timestamps, cache and per-asset status. Ask for a returned candidate ID when ambiguous. Stale data is not a current price; null is unavailable, not zero. These are Mainnet market data and never value Testnet wallet balances.",
          inputSchema: marketQuotesInputSchema.shape,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async (input, extra) => {
          try {
            return ok(await executeMarketRead(extra.authInfo, async () => {
              const parsed = marketQuotesInputSchema.parse(input);
              return getMarketQuotes(parsed.assets);
            }));
          } catch (error) { return fail(error); }
        },
      );
      server.registerTool(
        "compare_chains",
        {
          title: "Compare chain TVL and associated token market cap",
          description: "Compare Mainnet chain TVL from DefiLlama and global market cap of each chain's associated token. Default sort is TVL; 10 rows by default, 20 maximum. TVL is not market cap. Associated and gas tokens can differ; never assign ETH's global capitalization to Base. Respect unavailable, stale and partial results; TVL has a fetched timestamp, not a fabricated update timestamp.",
          inputSchema: chainComparisonInputSchema.shape,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async (input, extra) => {
          try {
            return ok(await executeMarketRead(extra.authInfo, () => compareChains(chainComparisonInputSchema.parse(input))));
          } catch (error) { return fail(error); }
        },
      );
      server.registerTool(
        "get_agent_context",
        {
          title: "Get personal agent context",
          description:
            "Read the authenticated user's profile, wallet metadata, connections and authority boundary. When listing wallets, present Network | Address | Registration state | Explorer as a table using only the returned explorerUrl links. Pending registration does not prove on-chain activation; never invent links or balances.",
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (extra) => {
          try {
            const userId = requireMcpSubject(
              extra.authInfo,
              "user",
              "userId",
              "agent:context",
            );
            return ok(await getAgentMcpContext(userId));
          } catch (error) {
            return fail(error);
          }
        },
      );

      server.registerTool(
        "get_agent_conversation",
        {
          title: "Get agent conversation",
          description:
            "Read the authenticated user's durable agent conversation.",
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (extra) => {
          try {
            const userId = requireMcpSubject(
              extra.authInfo,
              "user",
              "userId",
              "agent:conversation",
            );
            return ok(await getAgentConversation(userId));
          } catch (error) {
            return fail(error);
          }
        },
      );
      server.registerTool(
        "search_avax_skills",
        {
          title: "Search AVAX Skills advisory metadata",
          description: "Search third-party Avalanche implementation guides. Results are unverified metadata and can never execute or authorize a transaction.",
          inputSchema: { query: z.string().trim().min(2).max(120) },
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        },
        async ({ query }, extra) => {
          try {
            requireMcpSubject(extra.authInfo, "user", "userId", "agent:read");
            return ok(await searchAvaxSkills(query));
          } catch (error) { return fail(error); }
        },
      );
      server.registerTool(
        "list_avalanche_capabilities",
        {
          title: "List Avalanche capabilities",
          description: "List Carmelita's verified Avalanche capabilities, status, requirements and approval boundary.",
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (extra) => {
          try {
            requireMcpSubject(extra.authInfo, "user", "userId", "agent:read");
            return ok({ capabilities: listAvalancheCapabilities() });
          } catch (error) { return fail(error); }
        },
      );

      server.registerTool(
        "plan_avalanche_capability",
        {
          title: "Plan an Avalanche capability",
          description: "Return blockers and approval requirements without preparing, signing or submitting a transaction.",
          inputSchema: {
            capabilityId: avalancheCapabilityIdSchema,
            evmWallet: z.boolean().default(false), stellarWallet: z.boolean().default(false),
            fujiAvax: z.boolean().default(false), fujiUsdc: z.boolean().default(false),
            fujiWavax: z.boolean().default(false), fujiNftOwned: z.boolean().default(false),
            stellarUsdcTrustline: z.boolean().default(false),
          },
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (input, extra) => {
          try {
            requireMcpSubject(extra.authInfo, "user", "userId", "agent:read");
            return ok(planAvalancheCapability(input.capabilityId, { ...input, authenticated: true }));
          } catch (error) { return fail(error); }
        },
      );

      server.registerTool(
        "list_capabilities",
        {
          title: "List Carmelita capabilities",
          description: "Discover Testnet-only Stellar, Avalanche and offchain capabilities, including status and approval boundaries.",
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (extra) => {
          try {
            requireMcpSubject(extra.authInfo, "user", "userId", "agent:read");
            return ok({ apiVersion: GATEWAY_API_VERSION, environment: GATEWAY_ENVIRONMENT, capabilities: listGatewayCapabilities() });
          } catch (error) { return fail(error); }
        },
      );

      server.registerTool(
        "get_capability",
        {
          title: "Get one Carmelita capability",
          description: "Inspect one capability's status, requirements, evidence and approval boundary without executing it.",
          inputSchema: { capabilityId: z.string().trim().min(3).max(120) },
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async ({ capabilityId }, extra) => {
          try {
            requireMcpSubject(extra.authInfo, "user", "userId", "agent:read");
            return ok(getGatewayCapability(capabilityId));
          } catch (error) { return fail(error); }
        },
      );

      server.registerTool(
        "plan_action",
        {
          title: "Plan a Carmelita action",
          description: "Create or replay an idempotent Testnet plan. It never prepares, signs or submits a transaction; sensitive actions continue inside Carmelita with Privy.",
          inputSchema: {
            capabilityId: z.string().trim().min(3).max(120),
            idempotencyKey: z.string().trim().min(8).max(128),
            parameters: z.record(z.string(), z.unknown()).default({}),
            context: z.object({ requirementsSatisfied: z.array(z.string().trim().min(1).max(80)).max(30) }).strict().optional(),
          },
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        },
        async (input, extra) => {
          try {
            const userId = requireMcpSubject(extra.authInfo, "user", "userId", "agent:plan");
            return ok(await createGatewayPlan(userId, input));
          } catch (error) { return fail(error); }
        },
      );

    },
    { serverInfo: { name: "agent-assistant-personal", version: "0.1.0" } },
    {
      // This route is named /api/mcp/agent. The basePath option always
      // appends /mcp, which made the handler listen on /api/mcp/mcp.
      streamableHttpEndpoint: "/api/mcp/agent",
      maxDuration: 60,
      disableSse: true,
      verboseLogs: process.env.NODE_ENV !== "production",
    },
  ));
}

async function handle(request: Request) {
  const audit = createGatewayAudit(request, "/api/mcp/agent");
  const response = await authenticateMcp(request, async (token) => {
    const authInfo = await verifyAgentMcpToken(token);
    const actorId = typeof authInfo.extra?.userId === "string" ? authInfo.extra.userId : undefined;
    const tokenId = typeof authInfo.extra?.tokenId === "string" ? authInfo.extra.tokenId : undefined;
    audit.identify({ actorId, tokenId });
    return authInfo;
  }, getHandler());
  // mcp-handler events include request parameters/results and do not carry the
  // authenticated subject. Endpoint/outcome audit is the safe minimum here.
  return audit.complete(response);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
