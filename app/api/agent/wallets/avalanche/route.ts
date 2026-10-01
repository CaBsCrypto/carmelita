import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { readAvalancheWalletPanel, withPersonalPanelReadDeadline } from "@/app/queries/personal-panels";
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
    return NextResponse.json(await withPersonalPanelReadDeadline(() => readAvalancheWalletPanel(claims.user_id)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code = error instanceof Error
      ? publicMcpErrorCode(error)
      : "avalanche_diagnostics_failed";
    if (code === "avalanche_not_activated") return NextResponse.json(
      { error: code, next: "activate_avalanche_fuji" }, { status: 409 },
    );
    const status = code === "database_not_configured" || code === "read_query_timeout" ? 503
      : code.startsWith("evm_rpc") ? 502
        : 401;
    return NextResponse.json({ error: code }, { status });
  }
}
