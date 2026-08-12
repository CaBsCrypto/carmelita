import { createHash } from "node:crypto";
import {
  readStytchConnectedAppsConfig,
  type StytchConnectedAppsConfig,
} from "./connected-apps-config";

export type OAuthAuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  responseType: "code";
  scopes: string[];
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
  prompt?: string;
  resources: string[];
};

export type StytchPreflight = {
  client: { clientId: string; clientName: string; clientDescription?: string };
  requestedScopes: string[];
  consentRequired: boolean;
};

export type ConnectedAppSummary = {
  id: string;
  name: string;
  description?: string;
  clientType: "first_party" | "first_party_public" | "third_party" | "third_party_public" | "unknown";
  scopes: string[];
};

const connectedAppTypes = new Set(["first_party", "first_party_public", "third_party", "third_party_public"]);

function pathIdentifier(value: unknown, errorCode: string) {
  if (typeof value !== "string") throw new Error(errorCode);
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || !/^[A-Za-z0-9_-]+$/.test(normalized)) throw new Error(errorCode);
  return normalized;
}

export function validateConnectedAppId(value: unknown) {
  return pathIdentifier(value, "stytch_connected_app_id_invalid");
}

function connectedAppSummary(value: unknown): ConnectedAppSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("stytch_connected_apps_response_invalid");
  const item = value as Record<string, unknown>;
  const id = validateConnectedAppId(item.connected_app_id);
  const rawName = typeof item.name === "string" ? item.name.trim() : "";
  const rawDescription = typeof item.description === "string" ? item.description.trim() : "";
  const clientType = typeof item.client_type === "string" && connectedAppTypes.has(item.client_type)
    ? item.client_type as ConnectedAppSummary["clientType"]
    : "unknown";
  const scopes = typeof item.scopes_granted === "string"
    ? [...new Set(item.scopes_granted.split(/\s+/).filter((scope) => /^[a-z][a-z0-9:_-]{0,99}$/i.test(scope)))].slice(0, 32)
    : [];
  return {
    id,
    name: (rawName || "Connected AI assistant").slice(0, 120),
    description: rawDescription ? rawDescription.slice(0, 500) : undefined,
    clientType,
    scopes,
  };
}
type FetchLike = typeof fetch;

function optional(params: URLSearchParams, name: string) {
  return params.get(name)?.trim() || undefined;
}

function validatedRedirect(value: string) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.username || url.password || (url.protocol !== "https:" && !localHttp)) {
    throw new Error("oauth_authorization_request_invalid");
  }
  return url;
}

export function parseOAuthAuthorizationRequest(raw: string | URLSearchParams) {
  const params = typeof raw === "string" ? new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw) : raw;
  const clientId = optional(params, "client_id");
  const redirectUri = optional(params, "redirect_uri");
  if (!clientId || !redirectUri) throw new Error("oauth_authorization_request_invalid");
  try {
    validatedRedirect(redirectUri);
  } catch {
    throw new Error("oauth_authorization_request_invalid");
  }
  if (params.get("response_type") !== "code") throw new Error("oauth_response_type_unsupported");
  const codeChallenge = optional(params, "code_challenge");
  const codeChallengeMethod = optional(params, "code_challenge_method");
  if (codeChallengeMethod && codeChallengeMethod !== "S256") throw new Error("oauth_pkce_method_unsupported");
  if (!codeChallenge || codeChallengeMethod !== "S256") throw new Error("oauth_pkce_required");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(codeChallenge)) throw new Error("oauth_pkce_challenge_invalid");

  return {
    clientId,
    redirectUri,
    responseType: "code",
    scopes: (optional(params, "scope") || "").split(/\s+/).filter(Boolean),
    state: optional(params, "state"),
    nonce: optional(params, "nonce"),
    codeChallenge,
    codeChallengeMethod: codeChallengeMethod as "S256" | undefined,
    prompt: optional(params, "prompt"),
    resources: params.getAll("resource").map((resource) => resource.trim()).filter(Boolean),
  } satisfies OAuthAuthorizationRequest;
}

export function assertOAuthResource(request: OAuthAuthorizationRequest, expectedResource: string) {
  const resources = [...new Set(request.resources)];
  if (resources.length !== 1 || resources[0] !== expectedResource) {
    throw new Error("oauth_resource_invalid");
  }
}

export function stytchExternalIdForPrivy(privyDid: string) {
  return `privy|${createHash("sha256").update(privyDid).digest("hex")}`;
}

function preflightBody(request: OAuthAuthorizationRequest, userId: string) {
  return {
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: request.responseType,
    scopes: request.scopes,
    prompt: request.prompt,
    user_id: pathIdentifier(userId, "stytch_user_id_invalid"),
  };
}

function submitBody(request: OAuthAuthorizationRequest) {
  return {
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: request.responseType,
    scopes: request.scopes,
    state: request.state,
    nonce: request.nonce,
    code_challenge: request.codeChallenge,
    prompt: request.prompt,
    resources: request.resources,
  };
}

export class StytchConnectedAppsClient {
  constructor(
    private readonly config: StytchConnectedAppsConfig = readStytchConnectedAppsConfig(),
    private readonly fetcher: FetchLike = fetch,
  ) {}

  private async request(path: string, init: RequestInit) {
    const response = await this.fetcher(`${this.config.issuer}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.projectId}:${this.config.secret}`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return { response, body };
  }

  async preflightAuthorization(request: OAuthAuthorizationRequest, userId: string): Promise<StytchPreflight> {
    assertOAuthResource(request, this.config.resource);
    const { response, body } = await this.request("/v1/idp/oauth/authorize/start", {
      method: "POST",
      body: JSON.stringify(preflightBody(request, userId)),
    });
    if (!response.ok || !body) throw new Error("stytch_oauth_preflight_failed");
    const client = (body.client ?? body.connected_app ?? {}) as Record<string, unknown>;
    const rawScopeResults = body.scope_results ?? body.connected_app_scope_results;
    const scopeResults = Array.isArray(rawScopeResults)
      ? rawScopeResults as Array<Record<string, unknown>>
      : [];
    if (scopeResults.some((result) => result.is_grantable !== true)) {
      throw new Error("stytch_oauth_scope_not_grantable");
    }
    const requestedScopes = scopeResults.length > 0
      ? scopeResults.map((result) => String(result.scope)).filter(Boolean)
      : request.scopes;
    return {
      client: {
        clientId: String(client.client_id ?? request.clientId),
        clientName: String(client.client_name ?? client.name ?? "Connected AI assistant"),
        clientDescription: typeof client.client_description === "string" ? client.client_description : undefined,
      },
      requestedScopes,
      consentRequired: body.consent_required !== false,
    };
  }

  async listConnectedApps(userId: string): Promise<ConnectedAppSummary[]> {
    const subject = pathIdentifier(userId, "stytch_user_id_invalid");
    const { response, body } = await this.request(`/v1/users/${encodeURIComponent(subject)}/connected_apps`, {
      method: "GET",
    });
    if (!response.ok || !Array.isArray(body?.connected_apps)) {
      throw new Error("stytch_connected_apps_list_failed");
    }
    return body.connected_apps.map(connectedAppSummary);
  }

  async revokeConnectedApp(userId: string, connectedAppId: string) {
    const subject = pathIdentifier(userId, "stytch_user_id_invalid");
    const appId = validateConnectedAppId(connectedAppId);
    const connectedApps = await this.listConnectedApps(subject);
    if (!connectedApps.some((app) => app.id === appId)) {
      throw new Error("stytch_connected_app_not_found");
    }
    const { response } = await this.request(
      `/v1/users/${encodeURIComponent(subject)}/connected_apps/${encodeURIComponent(appId)}/revoke`,
      { method: "POST", body: "{}" },
    );
    if (!response.ok) throw new Error("stytch_connected_app_revoke_failed");
    return { connectedAppId: appId, revoked: true as const };
  }
  async ensureUserForPrivy(privyDid: string, email: string) {
    const externalId = stytchExternalIdForPrivy(privyDid);
    const existing = await this.request(`/v1/users/${encodeURIComponent(externalId)}`, { method: "GET" });
    if (existing.response.ok && typeof existing.body?.user_id === "string") return existing.body.user_id;
    if (existing.response.status !== 404) throw new Error("stytch_user_lookup_failed");

    const created = await this.request("/v1/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        external_id: externalId,
        trusted_metadata: { identity_provider: "privy" },
      }),
    });
    if (created.response.ok && typeof created.body?.user_id === "string") return created.body.user_id;

    if (created.response.status === 409) {
      const raced = await this.request(`/v1/users/${encodeURIComponent(externalId)}`, { method: "GET" });
      if (raced.response.ok && typeof raced.body?.user_id === "string") return raced.body.user_id;
    }
    throw new Error("stytch_user_create_failed");
  }

  async submitAuthorization(request: OAuthAuthorizationRequest, userId: string, consentGranted: boolean) {
    assertOAuthResource(request, this.config.resource);
    const { response, body } = await this.request("/v1/idp/oauth/authorize", {
      method: "POST",
      body: JSON.stringify({
        ...submitBody(request),
        user_id: userId,
        consent_granted: consentGranted,
      }),
    });
    if (!response.ok || typeof body?.redirect_uri !== "string") {
      throw new Error("stytch_oauth_authorization_failed");
    }
    let redirect: URL;
    try {
      redirect = validatedRedirect(body.redirect_uri);
    } catch {
      throw new Error("stytch_oauth_redirect_invalid");
    }
    const requestedRedirect = validatedRedirect(request.redirectUri);
    if (redirect.origin !== requestedRedirect.origin || redirect.pathname !== requestedRedirect.pathname) {
      throw new Error("stytch_oauth_redirect_invalid");
    }
    return { redirectUri: redirect.toString() };
  }
}
