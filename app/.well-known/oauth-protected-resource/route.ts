import { NextResponse } from "next/server";
import {
  stytchOAuthResourceServerEnabled,
  stytchProtectedResourceMetadata,
} from "@/app/mcp/stytch-oauth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function GET() {
  if (!stytchOAuthResourceServerEnabled()) {
    return NextResponse.json({ error: "not_found" }, {
      status: 404,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
  try {
    return NextResponse.json(stytchProtectedResourceMetadata(), {
      headers: { ...corsHeaders, "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return NextResponse.json({ error: "oauth_resource_server_unavailable" }, {
      status: 503,
      headers: { ...corsHeaders, "Cache-Control": "no-store" },
    });
  }
}

export function OPTIONS() {
  return new Response(null, {
    status: stytchOAuthResourceServerEnabled() ? 204 : 404,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}