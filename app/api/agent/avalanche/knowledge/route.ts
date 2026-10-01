import { executeWebReadQuery } from "@/app/queries/adapters";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({
    action: z.literal("search"),
    query: z.string().trim().min(2).max(200),
    source: z.enum(["docs", "academy", "integrations", "blog"]).optional(),
    limit: z.number().int().min(1).max(5).optional(),
  }).strict(),
]);

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  try {
    const { user_id: userId } = await verifyPrivyAccessToken(bearerToken(request));
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_avalanche_knowledge_request" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const input = parsed.data;
    const result = input.action === "list"
      ? await executeWebReadQuery("avalanche.docs.tools", {}, userId)
      : await executeWebReadQuery("avalanche.docs.search", {
          query: input.query,
          source: input.source,
          limit: input.limit,
        }, userId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error
      ? error.message.split(":")[0]
      : "avalanche_knowledge_failed";
    const status = code === "avalanche_mcp_timeout" ? 504
      : code === "avalanche_mcp_docs_search_unavailable" ? 503
        : code.startsWith("avalanche_mcp_") ? 502
          : 401;
    return NextResponse.json({ error: code }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
