import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { searchStellarBazaar } from "@/app/connectors/stellar-bazaar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  try {
    return !origin || (Boolean(host) && new URL(origin).origin === new URL(request.url).origin);
  } catch {
    return false;
  }
}

async function auth(request: Request) {
  if (!sameOrigin(request)) throw new Error("stellar_bazaar_invalid_origin");
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!accessToken) throw new Error("stellar_bazaar_authorization_required");
  try {
    return (await verifyPrivyAccessToken(accessToken)).user_id;
  } catch {
    throw new Error("stellar_bazaar_authorization_invalid");
  }
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "stellar_bazaar_request_failed";
  const status = message === "stellar_bazaar_invalid_origin" ? 403
    : message.includes("authorization_required") || message.includes("authorization_invalid") ? 401
      : message === "stellar_bazaar_query_invalid" ? 400
        : message === "stellar_bazaar_unavailable" || message === "stellar_bazaar_invalid_response" ? 502
          : message === "stellar_bazaar_amount_invalid" ? 502
            : 400;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    await auth(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => key !== "query") || params.getAll("query").length > 1) {
      throw new Error("stellar_bazaar_query_invalid");
    }
    const query = params.get("query") ?? "";
    const result = await searchStellarBazaar(query);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
