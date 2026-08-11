import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { resolveOAuthSubjectForPrivy } from "@/app/services/oauth-subject-link-store";
import { StytchConnectedAppsClient } from "@/app/stytch/connected-apps-client";
import { readStytchConnectedAppsConfig } from "@/app/stytch/connected-apps-config";
import { hasSameRequestOrigin } from "@/app/stytch/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const revokeSchema = z.object({
  connectedAppId: z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/),
});

function bearerToken(request: Request) {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" ? token?.trim() ?? "" : "";
}

async function ownStytchSubject(request: Request) {
  const config = readStytchConnectedAppsConfig();
  const token = bearerToken(request);
  if (!token) throw new Error("privy_access_token_missing");
  const claims = await verifyPrivyAccessToken(token);
  const subject = await resolveOAuthSubjectForPrivy({ issuer: config.issuer, privyDid: claims.user_id });
  return { config, subject };
}

function responseError(error: unknown) {
  const code = error instanceof z.ZodError
    ? "stytch_connected_app_id_invalid"
    : error instanceof Error
      ? error.message.split(":", 1)[0]
      : "stytch_connected_apps_request_failed";
  const status = code === "stytch_config_disabled" ? 404
    : code.startsWith("stytch_config_") || code === "database_not_configured" ? 503
    : code === "invalid_origin" ? 403
    : code === "stytch_connected_app_not_found" || code === "stytch_subject_link_not_found" ? 404
    : code === "stytch_connected_app_id_invalid" ? 400
    : code.startsWith("stytch_connected_apps_") || code === "stytch_connected_app_revoke_failed" ? 502
    : 401;
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    const { config, subject } = await ownStytchSubject(request);
    if (!subject) return NextResponse.json({ connectedApps: [] }, { headers: { "Cache-Control": "no-store" } });
    const connectedApps = await new StytchConnectedAppsClient(config).listConnectedApps(subject);
    return NextResponse.json({ connectedApps }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!hasSameRequestOrigin(request)) throw new Error("invalid_origin");
    const { config, subject } = await ownStytchSubject(request);
    if (!subject) throw new Error("stytch_subject_link_not_found");
    const input = revokeSchema.parse(await request.json());
    const result = await new StytchConnectedAppsClient(config).revokeConnectedApp(subject, input.connectedAppId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}