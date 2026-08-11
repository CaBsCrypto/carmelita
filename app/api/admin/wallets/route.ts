import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/app/admin/auth";
import { listAdminWalletRegistry } from "@/app/admin/wallets/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await getAdminIdentity();
  if (!identity) {
    return NextResponse.json({ error: "admin_auth_required" }, { status: 401 });
  }

  try {
    return NextResponse.json(await listAdminWalletRegistry(), {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "wallet_registry_failed";
    return NextResponse.json(
      { error: code },
      { status: code === "database_not_configured" ? 503 : 500 },
    );
  }
}
