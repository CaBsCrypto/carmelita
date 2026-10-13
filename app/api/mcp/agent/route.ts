import { readQueryDefinitions } from "@/app/queries/registry";
import { executeMcpReadQuery } from "@/app/queries/adapters";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createGatewayPlan } from "@/app/agent-gateway/service";
import { getGatewayCapability } from "@/app/agent-gateway/catalog";
import { createNativeGatewayPlan, projectNativeAvalanchePlan } from "@/app/bazaar/native-channel-boundary";
import { createGatewayAudit } from "@/app/agent-gateway/operations";
import { avalancheCapabilityIdSchema, planAvalancheCapability } from "@/app/avalanche/capability-registry";
import { readTempoExistingWallet, tempoExistingWalletInputSchema } from "@/app/mcp/tempo-existing-wallet";
import { associateTempoWallet, tempoWalletAssociationInputSchema } from "@/app/mcp/tempo-wallet-association";
import { agentOAuthBearerChallenge } from "@/app/mcp/stytch-oauth";
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
        "read_tempo_existing_evm_wallet",
        {
          title: "Use my existing EVM wallet to read Tempo",
          description: "Read Tempo Moderato testnet (42431) using the authenticated owner's existing canonical EVM wallet, verified against Privy. Use this even if discovery returns no registered Tempo association. Returns the existing address and real PathUSD contract, exact atomic/formatted balance, block/hash/time, or a genuine error. No address or owner can be selected by input. Does not create a wallet, persist an association, move funds, sign, or establish a registered Tempo binding; tempoRegistrationChecked=false. Requires only agent:read. To save a Tempo association, use associate_tempo_testnet_wallet with the user's explicit instruction and its separate OAuth permission.",
          inputSchema: tempoExistingWalletInputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
          _meta: { securitySchemes: [{ type: "oauth2", scopes: ["agent:read"] }] },
        },
        async (input, extra) => {
          try { return ok(await readTempoExistingWallet(input, extra.authInfo, { signal: extra.signal })); }
          catch (error) { return fail(error); }
        },
      );
      server.registerTool(
        "associate_tempo_testnet_wallet",
        {
          title: "Associate my existing EVM wallet with Tempo",
          description: "Save an idempotent Tempo Moderato testnet (42431) association for the authenticated owner's canonical existing EVM wallet. Call only after the user explicitly asks to connect or save this association in the chat; set explicitUserConfirmation=true for that instruction. Requires agent:read and the separate OAuth grant agent:wallet:associate. Verify SQL and Privy ownership and a successful real PathUSD RPC reading before saving. Return address, contract, exact balance, block/hash/time and the saved association. Never create a wallet, change its address, fund, sign or send a transaction. No owner, address, wallet ID, network or RPC URL may be supplied. Feature may be disabled; never silently substitute a read-only result for a saved association.",
          inputSchema: tempoWalletAssociationInputSchema,
          annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
          _meta: { securitySchemes: [{ type: "oauth2", scopes: ["agent:read", "agent:wallet:associate"] }] },
        },
        async (input, extra) => {
          try { return ok(await associateTempoWallet(input, extra.authInfo, { signal: extra.signal })); }
          catch (error) {
            const requiredScope = error instanceof Error && error.message === "mcp_scope_required:agent:wallet:associate"
              ? "agent:wallet:associate" : error instanceof Error && error.message === "mcp_scope_required:agent:read" ? "agent:read" : undefined;
            if (!requiredScope) return fail(error);
            return { ...fail(error), _meta: { "mcp/www_authenticate": [agentOAuthBearerChallenge({
              error: "insufficient_scope", requiredScope,
              errorDescription: "Authorize reading and associating your existing EVM wallet with Tempo to continue.",
            })] } };
          }
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
