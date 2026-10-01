import { executeWebReadQuery } from "@/app/queries/adapters";
import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { travalaSearchInput } from "@/app/travala";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}
function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  try {
    const { user_id: userId } = await verifyPrivyAccessToken(bearerToken(request));
    const parsed = travalaSearchInput.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_travel_search" }, { status: 400 });
    }
    return NextResponse.json(await executeWebReadQuery("offchain.travala.hotel_search", parsed.data, userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0] : "travel_search_failed";
    const status = code.startsWith("privy_") ? 401 : 502;
    return NextResponse.json({ error: code }, { status });
  }
}
