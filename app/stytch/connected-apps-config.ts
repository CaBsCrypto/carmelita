export type StytchConnectedAppsConfig = {
  projectId: string;
  secret: string;
  issuer: string;
  publicOrigin: string;
  resource: string;
  authorizationUrl: string;
  defaultScopes: string[];
};

function required(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`stytch_config_missing_${key.toLowerCase()}`);
  return value;
}

function origin(value: string, label: string, allowLocalhost = false) {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error(`stytch_config_invalid_${label}`);
  }
  if (url.protocol !== "https:" && !(allowLocalhost && local && url.protocol === "http:")) {
    throw new Error(`stytch_config_invalid_${label}`);
  }
  return url.origin;
}

export function readStytchConnectedAppsConfig(
  env: NodeJS.ProcessEnv = process.env,
): StytchConnectedAppsConfig {
  const publicOrigin = origin(
    required(env, "CARMELITA_PUBLIC_ORIGIN"),
    "public_origin",
    env.NODE_ENV !== "production",
  );
  const issuer = origin(required(env, "STYTCH_PROJECT_DOMAIN"), "project_domain");
  const defaultScopes = (env.STYTCH_CONNECTED_APPS_SCOPES ||
    "agent:read agent:plan agent:context agent:conversation")
    .split(/[ ,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    projectId: required(env, "STYTCH_PROJECT_ID"),
    secret: required(env, "STYTCH_SECRET"),
    issuer,
    publicOrigin,
    resource: `${publicOrigin}/api/mcp/agent`,
    authorizationUrl: `${publicOrigin}/oauth/authorize`,
    defaultScopes: [...new Set(defaultScopes)],
  };
}
