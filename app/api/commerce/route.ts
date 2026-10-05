import { NextRequest, NextResponse } from "next/server";
import { backend } from "@/app/commerce-backend";

export const runtime = "nodejs";

export async function GET(r: NextRequest) {
  if ((r.nextUrl.searchParams.get("query") ?? "").length > 120) {
    return NextResponse.json({ error: "invalid_catalog_query" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return NextResponse.json({
      mode: "catalog", executionEnabled: false, persistence: backend.mode(),
      offers: await backend.searchOffers(r.nextUrl.searchParams.get("query") ?? ""),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "commerce_catalog_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST() {
  // Reject before reading a body or contacting storage, including receipt lookup
  // and replay. A client-provided actorId is not an authenticated owner.
  return NextResponse.json({ error: "commerce_demo_disabled" }, {
    status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" },
  });
}
