import { NextResponse } from "next/server";
import { adminCookieOptions } from "@/app/admin/auth";
import { getPrivyAdminIdentity } from "@/app/admin/privy-auth";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const identity = token ? await getPrivyAdminIdentity(token) : null;
  if (!identity) return NextResponse.json({ error: "access_denied" }, { status: 403 });
  const response = NextResponse.json({ authenticated: true }, {
    headers: { "Cache-Control": "no-store" },
  });
  // Reverify the token and the current allowlist on every protected request.
  response.cookies.set("aa_admin_privy", token, { ...adminCookieOptions(), maxAge: 3600 });
  return response;
}
