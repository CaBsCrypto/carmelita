import { NextResponse } from "next/server";
import { z } from "zod";
import { avalancheCapabilityIdSchema, planAvalancheCapability } from "@/app/avalanche/capability-registry";
import { executeWebReadQuery } from "@/app/queries/adapters";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const contextSchema = z.object({ authenticated: z.boolean().optional(), evmWallet: z.boolean().optional(), stellarWallet: z.boolean().optional(), fujiAvax: z.boolean().optional(), fujiUsdc: z.boolean().optional(), stellarUsdcTrustline: z.boolean().optional() }).strict();
const requestSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("list") }).strict(), z.object({ action: z.literal("plan"), capabilityId: avalancheCapabilityIdSchema, context: contextSchema.optional() }).strict()]);
function bearerToken(request: Request) { const value = request.headers.get("authorization") ?? ""; return value.startsWith("Bearer ") ? value.slice(7).trim() : ""; }
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); const host = request.headers.get("host"); if (!origin || !host) return true; try { return new URL(origin).host === host; } catch { return false; } }
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_avalanche_capability_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const input = parsed.data;
    const result = input.action === "list" ? await executeWebReadQuery("avalanche.capabilities.list", {}, claims.user_id) : planAvalancheCapability(input.capabilityId, { ...input.context, authenticated: true });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "invalid_privy_token" }, { status: 401, headers: { "Cache-Control": "no-store" } }); }
}
