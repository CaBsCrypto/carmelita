import { readQueryDefinitions } from "@/app/queries/registry";
import { executeMcpReadQuery } from "@/app/queries/adapters";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createGatewayPlan } from "@/app/agent-gateway/service";
import { getGatewayCapability } from "@/app/agent-gateway/catalog";
import { createNativeGatewayPlan, projectNativeAvalanchePlan } from "@/app/bazaar/native-channel-boundary";
import { createGatewayAudit } from "@/app/agent-gateway/operations";
import { avalancheCapabilityIdSchema, planAvalancheCapability } from "@/app/avalanche/capability-registry";
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
      for (const query of readQueryDefinitions) {
        server.registerTool(query.toolName, {
          title: query.title, description: query.description,
          inputSchema: query.inputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        }, async (input, extra) => {
          try { return ok(await executeMcpReadQuery(query.id, input, extra.authInfo)); }
          catch (error) { return fail(error); }
        });
      }
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
            return ok(projectNativeAvalanchePlan(planAvalancheCapability(input.capabilityId, { ...input, authenticated: true })));
          } catch (error) { return fail(error); }
        },
      );

      server.registerTool(
        "plan_action",
        {
          title: "Plan a Carmelita action",
          description: "Create or replay a non-financial plan with agent:plan permission. It never prepares or executes an operation. Financial and cross-chain requests return blocked metadata without signing, submitting or offering a checkout handoff.",
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
            return ok(await createNativeGatewayPlan(userId, input, { getCapability: getGatewayCapability, createPlan: createGatewayPlan }));
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
