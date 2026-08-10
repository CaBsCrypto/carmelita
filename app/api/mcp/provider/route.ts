import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  authenticateMcp,
  requireMcpSubject,
  publicMcpErrorCode,
  verifyProviderMcpToken,
} from "@/app/mcp/auth";
import {
  getServiceProvider,
  listProviderOffers,
  setProviderOfferStatus,
  upsertProviderOffer,
} from "@/app/services/provider-store";

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
        "get_service_provider",
        {
          title: "Get service provider profile",
          description:
            "Read the authenticated service provider identity and status.",
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (extra) => {
          try {
            const providerId = requireMcpSubject(
              extra.authInfo,
              "provider",
              "providerId",
              "provider:read",
            );
            return ok(await getServiceProvider(providerId));
          } catch (error) {
            return fail(error);
          }
        },
      );

      server.registerTool(
        "list_service_offers",
        {
          title: "List provider offers",
          description:
            "List draft, published, paused and archived offers owned by this provider.",
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (extra) => {
          try {
            const providerId = requireMcpSubject(
              extra.authInfo,
              "provider",
              "providerId",
              "provider:read",
            );
            return ok({ offers: await listProviderOffers(providerId) });
          } catch (error) {
            return fail(error);
          }
        },
      );

      server.registerTool(
        "upsert_service_offer",
        {
          title: "Create or update a service offer",
          description:
            "Create a draft offer or update the provider offer with the same externalId. Publishing is separate.",
          inputSchema: {
            externalId: z.string().trim().min(1).max(120),
            title: z.string().trim().min(1).max(160),
            description: z.string().trim().min(1).max(2000),
            kind: z.enum([
              "finance",
              "reservation",
              "task",
              "travel",
              "product",
              "service",
            ]),
            amount: z.number().nonnegative().max(1_000_000),
            currency: z.literal("USDC"),
            network: z.enum(["stellar-testnet", "base-sepolia", "avalanche-fuji", "offchain-demo"]),
            metadata: z.record(z.string(), z.unknown()).optional(),
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (input, extra) => {
          try {
            const providerId = requireMcpSubject(
              extra.authInfo,
              "provider",
              "providerId",
              "provider:offers:write",
            );
            return ok({
              offer: await upsertProviderOffer(providerId, input),
              notice:
                "Offer remains draft until set_service_offer_status publishes it.",
            });
          } catch (error) {
            return fail(error);
          }
        },
      );

      server.registerTool(
        "set_service_offer_status",
        {
          title: "Set service offer status",
          description:
            "Publish, pause, archive or return an offer to draft. Only this provider's offers can change.",
          inputSchema: {
            offerId: z.string().trim().min(1),
            status: z.enum(["draft", "published", "paused", "archived"]),
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async ({ offerId, status }, extra) => {
          try {
            const providerId = requireMcpSubject(
              extra.authInfo,
              "provider",
              "providerId",
              "provider:offers:write",
            );
            return ok({
              offer: await setProviderOfferStatus(
                providerId,
                offerId,
                status,
              ),
            });
          } catch (error) {
            return fail(error);
          }
        },
      );
    },
    { serverInfo: { name: "agent-assistant-provider", version: "0.1.0" } },
    {
      // Keep the transport endpoint aligned with this concrete Next.js route.
      // A basePath would append /mcp and make /api/mcp/provider return 404.
      streamableHttpEndpoint: "/api/mcp/provider",
      maxDuration: 60,
      disableSse: true,
      verboseLogs: process.env.NODE_ENV !== "production",
    },
  ));
}

async function handle(request: Request) {
  return authenticateMcp(request, verifyProviderMcpToken, getHandler());
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
