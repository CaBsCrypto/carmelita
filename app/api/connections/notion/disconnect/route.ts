import { NextResponse } from "next/server";
import { disconnectNotion } from "@/app/connectors/notion-oauth";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  let userId: string;
  try {
    const auth = request.headers.get("authorization") ?? "";
    const claims = await verifyPrivyAccessToken(auth.startsWith("Bearer ") ? auth.slice(7).trim() : "");
    userId = claims.user_id;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await disconnectNotion(userId), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "connection_disconnect_failed" }, { status: 503 });
  }
}
