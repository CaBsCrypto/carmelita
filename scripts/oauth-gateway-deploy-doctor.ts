import { readStytchConnectedAppsConfig } from "../app/stytch/connected-apps-config";
import {
  readStytchOAuthResourceConfig,
  stytchOAuthResourceServerEnabled,
} from "../app/mcp/stytch-oauth";

const names = [
  "CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED",
  "CARMELITA_PUBLIC_ORIGIN",
  "STYTCH_PROJECT_ID",
  "STYTCH_SECRET",
  "STYTCH_PROJECT_DOMAIN",
  "STYTCH_CONNECTED_APPS_SCOPES",
  "STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "DATABASE_URL",
  "DATABASE_URL_DATABASE_URL",
] as const;

function present(name: (typeof names)[number]) {
  return Boolean(process.env[name]?.trim());
}

const enabled = stytchOAuthResourceServerEnabled();
const environment = Object.fromEntries(names.map((name) => [name, present(name) ? "present" : "missing"]));
const result: Record<string, unknown> = {
  ok: true,
  mode: enabled ? "enabled" : "disabled-safe",
  environment,
};

if (enabled) {
  try {
    const connectedApps = readStytchConnectedAppsConfig();
    const resourceServer = readStytchOAuthResourceConfig();
    result.oauth = {
      issuerConfigured: true,
      publicOriginProtocol: new URL(connectedApps.publicOrigin).protocol,
      resourcePath: new URL(resourceServer.resource).pathname,
      authorizationPath: new URL(connectedApps.authorizationUrl).pathname,
      scopes: connectedApps.defaultScopes,
      audienceMode: resourceServer.expectedAudience ? "strict" : "dynamic-client",
    };
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : "oauth_gateway_config_invalid";
  }
} else {
  result.note = "OAuth endpoints remain fail-closed until the resource-server flag is explicitly enabled.";
}

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
