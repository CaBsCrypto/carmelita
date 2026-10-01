import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { readConnectionsPanel, withPersonalPanelReadDeadline } from "@/app/queries/personal-panels";
import { publicMcpErrorCode } from "@/app/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function GET(request: Request) {
  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    return NextResponse.json(
      await withPersonalPanelReadDeadline(() => readConnectionsPanel(claims.user_id)),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof Error ? publicMcpErrorCode(error) : "connections_failed";
    return NextResponse.json({ error: code }, { status: code === "read_query_timeout" ? 503 : 401 });
  }
}
