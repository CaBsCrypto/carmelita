import { NextResponse } from "next/server";
import { z } from "zod";
import { executeWebReadQuery } from "@/app/queries/adapters";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pairs") }).strict(),
  z.object({
    action: z.literal("quote"),
    amount: z.string().trim().min(1).max(40),
    assetIn: z.string().trim().min(2).max(10),
    assetOut: z.string().trim().min(2).max(10),
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
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
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
        { error: "invalid_dexalot_request" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const input = parsed.data;
    const result = input.action === "pairs"
      ? await executeWebReadQuery("dexalot.markets.list", {}, userId)
      : await executeWebReadQuery("dexalot.quote.read", { amount: input.amount, assetIn: input.assetIn, assetOut: input.assetOut }, userId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error
      ? error.message.split(":")[0]
      : "dexalot_failed";
    const status = code === "dexalot_timeout" ? 504
      : code.startsWith("dexalot_") ? 502
        : 401;
    return NextResponse.json({ error: code }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

