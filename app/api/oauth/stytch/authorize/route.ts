import { NextResponse } from "next/server";
import { getPrivyUserIdentity, verifyPrivyAccessToken } from "@/app/privy-stellar";
import { linkOAuthSubject } from "@/app/services/oauth-subject-link-store";
import { readStytchConnectedAppsConfig } from "@/app/stytch/connected-apps-config";
import {
  parseOAuthAuthorizationRequest,
  StytchConnectedAppsClient,
} from "@/app/stytch/connected-apps-client";
import { hasSameRequestOrigin } from "@/app/stytch/request-security";

export const dynamic = "force-dynamic";

function bearer(request: Request) {
  const value = request.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ")) throw new Error("privy_access_token_missing");
  return value.slice(7).trim();
}

export async function POST(request: Request) {
  try {
    if (!hasSameRequestOrigin(request)) throw new Error("invalid_origin");
    const claims = await verifyPrivyAccessToken(bearer(request));
    const body = (await request.json()) as { query?: unknown; consentGranted?: unknown };
    if (typeof body.query !== "string" || body.query.length > 8_192 || typeof body.consentGranted !== "boolean") {
      throw new Error("oauth_authorization_request_invalid");
    }
    const identity = await getPrivyUserIdentity(claims.user_id);
    if (!identity.email) throw new Error("stytch_email_required");
    const oauthRequest = parseOAuthAuthorizationRequest(body.query);
    const config = readStytchConnectedAppsConfig();
    const client = new StytchConnectedAppsClient(config);
    const stytchUserId = await client.ensureUserForPrivy(identity.id, identity.email);
    await linkOAuthSubject({
      issuer: config.issuer,
      subject: stytchUserId,
      privyDid: claims.user_id,
    });
    const result = await client.submitAuthorization(oauthRequest, stytchUserId, body.consentGranted);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store", Vary: "Authorization" },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "oauth_authorization_failed";
    const status = code === "invalid_origin" ? 403 : code.startsWith("stytch_config_") ? 503 : 400;
    return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
