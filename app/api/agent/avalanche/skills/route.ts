import { NextResponse } from "next/server";
import { z } from "zod";
import { executeWebReadQuery } from "@/app/queries/adapters";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({ query: z.string().trim().min(2).max(120) }).strict();
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
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  try {
    const { user_id: userId } = await verifyPrivyAccessToken(bearerToken(request));
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "invalid_avaxskills_request" }, { status: 400 });
    return NextResponse.json(await executeWebReadQuery("avalanche.skills.search", { query: parsed.data.query }, userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "avaxskills_failed";
    const status = code === "avaxskills_timeout" ? 504 : code.startsWith("avaxskills_") ? 502 : 401;
    return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}