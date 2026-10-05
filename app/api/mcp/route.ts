import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { backend } from "@/app/commerce-backend";

export const runtime = "nodejs";
export const maxDuration = 60;

const ok = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
const fail = (error: unknown) => ({
  isError: true,
  content: [{
    type: "text" as const,
    text: JSON.stringify({
      error: error instanceof Error && error.message === "offer_not_found"
        ? "offer_not_found" : "commerce_catalog_unavailable",
    }),
  }],
});

let handler: ReturnType<typeof createMcpHandler> | null = null;
function getHandler() {
  return handler ?? (handler = createMcpHandler((server) => {
    server.registerTool("search_offers", {
      title: "Search public offers",
      description: "Search the public catalog. Listing an offer does not establish execution availability or authorize a purchase.",
      inputSchema: {
        query: z.string().max(120).default(""),
        kind: z.enum(["finance", "reservation", "task", "travel", "product", "service"]).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ query, kind }) => {
      try {
        return ok({ offers: await backend.searchOffers(query, kind), persistence: backend.mode(), executionEnabled: false });
      } catch (error) { return fail(error); }
    });
    server.registerTool("get_offer", {
      title: "Get public offer",
      description: "Get public catalog details. Read-only; does not prepare an operation or retrieve private receipts.",
      inputSchema: { offerId: z.string().min(1).max(128) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ offerId }) => {
      try { return ok(await backend.getOffer(offerId)); }
      catch (error) { return fail(error); }
    });
    // Legacy intent and receipt tools are deliberately unregistered: this public
    // endpoint has no owner identity. Direct calls must not reach their backend.
  }, { serverInfo: { name: "agente-asistente", version: "0.3.0" } }, {
    basePath: "/api", maxDuration: 60, disableSse: true,
    verboseLogs: process.env.NODE_ENV !== "production",
  }));
}

export const GET = (request: Request) => getHandler()(request);
export const POST = (request: Request) => getHandler()(request);
export const DELETE = (request: Request) => getHandler()(request);
