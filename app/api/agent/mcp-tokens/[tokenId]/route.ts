import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { revokePersonalMcpToken } from "@/app/services/personal-mcp-token-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); const host = request.headers.get("host"); if (!origin || !host) return true; try { return new URL(origin).host === host; } catch { return false; } }
function bearerToken(request: Request) { const [scheme, token] = (request.headers.get("authorization") ?? "").split(" "); return scheme?.toLowerCase() === "bearer" ? token?.trim() ?? "" : ""; }
function errorResponse(error: unknown) { const code = error instanceof Error ? error.message.split(":")[0] : "personal_mcp_token_request_failed"; const status = code === "invalid_origin" ? 403 : code === "personal_mcp_token_not_found" ? 404 : code === "database_not_configured" ? 503 : 401; return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } }); }
export async function DELETE(request: Request, context: { params: Promise<{ tokenId: string }> }) {
  try {
    if (!sameOrigin(request)) throw new Error("invalid_origin"); const claims = await verifyPrivyAccessToken(bearerToken(request));
    const { tokenId } = await context.params; if (!tokenId) throw new Error("personal_mcp_token_not_found");
    const credential = await revokePersonalMcpToken(claims.user_id, tokenId);
    return NextResponse.json({ credential }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
