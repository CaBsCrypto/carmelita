import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  createAdminSessionToken,
  getAdminIdentity,
  isPasswordAdminConfigured,
  verifyAdminCredentials,
} from "@/app/admin/auth";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

export async function GET() {
  const identity = await getAdminIdentity();
  return NextResponse.json(
    {
      authenticated: Boolean(identity),
      identity,
      passwordConfigured: isPasswordAdminConfigured(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ status: "invalid_origin" }, { status: 403 });
  }

  if (!isPasswordAdminConfigured()) {
    return NextResponse.json(
      { status: "admin_not_configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (
    !parsed.success ||
    !verifyAdminCredentials(parsed.data.username, parsed.data.password)
  ) {
    return NextResponse.json(
      { status: "invalid_credentials" },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ status: "authenticated" });
  response.cookies.set(
    ADMIN_COOKIE,
    createAdminSessionToken(parsed.data.username),
    adminCookieOptions(),
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ status: "invalid_origin" }, { status: 403 });
  }

  const response = NextResponse.json({ status: "signed_out" });
  response.cookies.set("aa_admin_privy", "", { ...adminCookieOptions(), maxAge: 0 });
  response.cookies.set(ADMIN_COOKIE, "", {
    ...adminCookieOptions(),
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
