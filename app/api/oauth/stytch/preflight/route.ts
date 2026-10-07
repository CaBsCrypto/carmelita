import { NextResponse } from "next/server";
import { getPrivyUserIdentity, verifyPrivyAccessToken } from "@/app/privy-stellar";
import {
  parseOAuthAuthorizationRequest,
  StytchConnectedAppsClient,
} from "@/app/stytch/connected-apps-client";
import { readStytchConnectedAppsConfig } from "@/app/stytch/connected-apps-config";
import { hasSameRequestOrigin } from "@/app/stytch/request-security";
import { normalizeOAuthAuthenticationError, publicOAuthError } from "@/app/stytch/public-error";

export const dynamic = "force-dynamic";

function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ")) throw new Error("privy_access_token_missing");
  return value.slice(7).trim();
}

export async function POST(request: Request) {
  try {
    if (!hasSameRequestOrigin(request)) throw new Error("invalid_origin");
    const claims = await verifyPrivyAccessToken(bearer(request)).catch((error: unknown) => {
      throw normalizeOAuthAuthenticationError(error);
    });
    const body = (await request.json()) as { query?: unknown };
    if (typeof body.query !== "string" || body.query.length > 8_192) {
      throw new Error("oauth_authorization_request_invalid");
    }
    const identity = await getPrivyUserIdentity(claims.user_id);
    if (identity.id !== claims.user_id) throw new Error("privy_identity_mismatch");
    if (!identity.email) throw new Error("stytch_email_required");
    const oauthRequest = parseOAuthAuthorizationRequest(body.query);
    const config = readStytchConnectedAppsConfig();
    const client = new StytchConnectedAppsClient(config);
    const stytchUserId = await client.ensureUserForPrivy(identity.id, identity.email);
    const preflight = await client.preflightAuthorization(oauthRequest, stytchUserId);
    return NextResponse.json(preflight, {
      headers: { "Cache-Control": "no-store", Vary: "Authorization" },
    });
  } catch (error) {
    const { code, status } = publicOAuthError(error, "preflight");
    return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
