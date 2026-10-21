import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agentExternalConnections,
  agentOauthStates,
} from "@/db/schema";

const PROVIDER = "notion";
const MCP_RESOURCE = "https://mcp.notion.com/mcp";

type OAuthMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
};

type ClientRegistration = {
  client_id: string;
  client_secret?: string;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

function encryptionKey() {
  const configured = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!configured) throw new Error("connector_encryption_not_configured");
  const decoded = Buffer.from(configured, "base64");
  if (decoded.length !== 32) {
    throw new Error("connector_encryption_key_invalid");
  }
  return decoded;
}

export function encryptConnectorSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptConnectorSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("connector_secret_invalid");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function stateId(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function discoverOAuth() {
  const resourceMetadataResponse = await fetch(
    "https://mcp.notion.com/.well-known/oauth-protected-resource/mcp",
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000), cache: "no-store" },
  );
  if (!resourceMetadataResponse.ok) {
    throw new Error("notion_oauth_discovery_failed");
  }
  const resource = (await resourceMetadataResponse.json()) as {
    authorization_servers?: string[];
  };
  const issuer = resource.authorization_servers?.[0];
  if (!issuer) throw new Error("notion_oauth_issuer_missing");

  const metadataResponse = await fetch(
    new URL("/.well-known/oauth-authorization-server", issuer),
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000), cache: "no-store" },
  );
  if (!metadataResponse.ok) throw new Error("notion_oauth_metadata_failed");
  const metadata = (await metadataResponse.json()) as OAuthMetadata;
  if (
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.registration_endpoint
  ) {
    throw new Error("notion_oauth_metadata_incomplete");
  }
  return metadata;
}

async function registerClient(
  metadata: OAuthMetadata,
  redirectUri: string,
  appOrigin: string,
) {
  const response = await fetch(metadata.registration_endpoint!, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: "agent-assistant",
      client_uri: appOrigin,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("notion_client_registration_failed");
  }
  const client = (await response.json()) as ClientRegistration;
  if (!client.client_id) throw new Error("notion_client_id_missing");
  return client;
}

export async function startNotionOAuth(userId: string, appOrigin: string) {
  const db = getDb();
  const redirectUri =
    appOrigin.replace(/\/$/, "") + "/api/connections/notion/callback";
  const metadata = await discoverOAuth();
  const client = await registerClient(metadata, redirectUri, appOrigin);
  const { verifier, challenge } = pkce();
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(agentOauthStates).values({
    id: stateId(state),
    userId,
    provider: PROVIDER,
    codeVerifierEncrypted: encryptConnectorSecret(verifier),
    clientId: client.client_id,
    clientSecretEncrypted: client.client_secret
      ? encryptConnectorSecret(client.client_secret)
      : null,
    authorizationEndpoint: metadata.authorization_endpoint,
    tokenEndpoint: metadata.token_endpoint,
    redirectUri,
    expiresAt,
  });

  // A generation marker makes disconnect/new authorization win over a late callback.
  await db.insert(agentExternalConnections).values({
    id: randomUUID(), userId, provider: PROVIDER, status: "connecting",
    accessTokenEncrypted: "", metadata: { oauthAttempt: stateId(state) },
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [agentExternalConnections.userId, agentExternalConnections.provider],
    set: { status: "connecting", metadata: { oauthAttempt: stateId(state) }, updatedAt: new Date() },
  });

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP_RESOURCE,
    prompt: "consent",
  }).toString();

  return { authorizationUrl: authorizationUrl.toString(), expiresAt };
}

export async function completeNotionOAuth(code: string, state: string, db = getDb()) {
  const stateKey = stateId(state);
  const rows = await db
    .delete(agentOauthStates)
    .where(
      and(
        eq(agentOauthStates.id, stateKey),
        eq(agentOauthStates.provider, PROVIDER),
        gt(agentOauthStates.expiresAt, new Date()),
      ),
    )
    .returning();
  const pending = rows[0];
  if (!pending) throw new Error("oauth_state_invalid_or_expired");


  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: pending.clientId,
    redirect_uri: pending.redirectUri,
    code_verifier: decryptConnectorSecret(pending.codeVerifierEncrypted),
    resource: MCP_RESOURCE,
  });
  if (pending.clientSecretEncrypted) {
    params.set(
      "client_secret",
      decryptConnectorSecret(pending.clientSecretEncrypted),
    );
  }

  const tokenResponse = await fetch(pending.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!tokenResponse.ok) {
    throw new Error("notion_token_exchange_failed");
  }

  const tokens = (await tokenResponse.json()) as TokenResponse;
  if (!tokens.access_token) throw new Error("notion_access_token_missing");
  const tokenExpiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  const saved = await db.update(agentExternalConnections).set({
    status: "active",
    accessTokenEncrypted: encryptConnectorSecret(tokens.access_token),
    refreshTokenEncrypted: tokens.refresh_token ? encryptConnectorSecret(tokens.refresh_token) : null,
    tokenExpiresAt,
    scopes: tokens.scope ? tokens.scope.split(" ").filter(Boolean) : [],
    metadata: {
      transport: "streamable-http", resource: MCP_RESOURCE,
      tokenType: tokens.token_type ?? "Bearer", clientId: pending.clientId,
      clientSecretEncrypted: pending.clientSecretEncrypted, tokenEndpoint: pending.tokenEndpoint,
    },
    updatedAt: new Date(),
  }).where(and(
    eq(agentExternalConnections.userId, pending.userId),
    eq(agentExternalConnections.provider, PROVIDER),
    eq(agentExternalConnections.status, "connecting"),
    sql`${agentExternalConnections.metadata}->>'oauthAttempt' = ${stateKey}`,
  )).returning({ id: agentExternalConnections.id });
  if (!saved.length) throw new Error("notion_connection_superseded");

  return { userId: pending.userId, provider: PROVIDER };
}

export async function listUserConnections(userId: string) {
  const db = getDb();
  return db
    .select({
      provider: agentExternalConnections.provider,
      status: agentExternalConnections.status,
      scopes: agentExternalConnections.scopes,
      tokenExpiresAt: agentExternalConnections.tokenExpiresAt,
      updatedAt: agentExternalConnections.updatedAt,
    })
    .from(agentExternalConnections)
    .where(eq(agentExternalConnections.userId, userId));
}
export async function getNotionAccessToken(userId: string, db = getDb()) {
  const rows = await db
    .select()
    .from(agentExternalConnections)
    .where(
      and(
        eq(agentExternalConnections.userId, userId),
        eq(agentExternalConnections.provider, PROVIDER),
      ),
    )
    .limit(1);
  const connection = rows[0];
  if (!connection || connection.status !== "active") {
    throw new Error("notion_not_connected");
  }

  const currentGeneration = and(
    eq(agentExternalConnections.id, connection.id),
    eq(agentExternalConnections.status, "active"),
    eq(agentExternalConnections.accessTokenEncrypted, connection.accessTokenEncrypted),
    eq(agentExternalConnections.updatedAt, connection.updatedAt),
  );

  if (
    !connection.tokenExpiresAt ||
    connection.tokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptConnectorSecret(connection.accessTokenEncrypted);
  }

  if (!connection.refreshTokenEncrypted) {
    await db
      .update(agentExternalConnections)
      .set({ status: "reauth_required", updatedAt: new Date() })
      .where(currentGeneration);
    throw new Error("notion_reauth_required");
  }

  const metadata = connection.metadata ?? {};
  const clientId =
    typeof metadata.clientId === "string" ? metadata.clientId : null;
  const tokenEndpoint =
    typeof metadata.tokenEndpoint === "string"
      ? metadata.tokenEndpoint
      : "https://mcp.notion.com/token";
  if (!clientId) throw new Error("notion_refresh_metadata_missing");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: decryptConnectorSecret(connection.refreshTokenEncrypted),
    client_id: clientId,
    resource: MCP_RESOURCE,
  });
  if (typeof metadata.clientSecretEncrypted === "string") {
    params.set(
      "client_secret",
      decryptConnectorSecret(metadata.clientSecretEncrypted),
    );
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!response.ok) {
    if (response.status !== 400 && response.status !== 401) {
      throw new Error("notion_refresh_unavailable");
    }
    await db
      .update(agentExternalConnections)
      .set({ status: "reauth_required", updatedAt: new Date() })
      .where(currentGeneration);
    throw new Error("notion_reauth_required");
  }

  const refreshed = (await response.json()) as TokenResponse;
  if (!refreshed.access_token) throw new Error("notion_refresh_failed");
  const tokenExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000)
    : null;

  const refreshedRows = await db
    .update(agentExternalConnections)
    .set({
      status: "active",
      accessTokenEncrypted: encryptConnectorSecret(refreshed.access_token),
      refreshTokenEncrypted: refreshed.refresh_token
        ? encryptConnectorSecret(refreshed.refresh_token)
        : connection.refreshTokenEncrypted,
      tokenExpiresAt,
      scopes: refreshed.scope
        ? refreshed.scope.split(" ").filter(Boolean)
        : connection.scopes,
      updatedAt: new Date(),
    })
    .where(currentGeneration).returning({ id: agentExternalConnections.id });
  if (!refreshedRows.length) throw new Error("notion_connection_superseded");

  return refreshed.access_token;
}
/** Local revocation: does not claim to revoke the grant at the external provider. */
export async function disconnectNotion(userId: string, db = getDb()) {
  await db.update(agentExternalConnections).set({
    status: "disconnected", accessTokenEncrypted: "", refreshTokenEncrypted: null,
    tokenExpiresAt: null, scopes: [], metadata: {}, updatedAt: new Date(),
  }).where(and(eq(agentExternalConnections.userId, userId), eq(agentExternalConnections.provider, PROVIDER)));
  await db.delete(agentOauthStates).where(and(eq(agentOauthStates.userId, userId), eq(agentOauthStates.provider, PROVIDER)));
  return { provider: PROVIDER, status: "disconnected", providerRevocation: "not_performed" } as const;
}
