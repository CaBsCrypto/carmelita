import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { readSolanaWalletPanel, withPersonalPanelReadDeadline } from "@/app/queries/personal-panels";
import { publicMcpErrorCode } from "@/app/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    return NextResponse.json(
      await withPersonalPanelReadDeadline(() => readSolanaWalletPanel(claims.user_id)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? publicMcpErrorCode(error) : "solana_status_failed";
    if (message === "solana_not_activated") return NextResponse.json(
      { error: message }, { status: 404, headers: { "Cache-Control": "no-store" } },
    );
    return NextResponse.json(
      { error: message },
      { status: message === "read_query_timeout" ? 503 : message === "solana_balance_unavailable" ? 502 : message.includes("access_token") ? 401 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
