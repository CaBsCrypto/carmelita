export type PreviewIsolationEnvironment = Record<string, string | undefined>;

export type PreviewIsolation = {
  databaseUrl: string;
  migrationDatabaseUrl: string;
  previewOrigin: string;
  deployment: string;
};

const productionOrigins = new Set([
  "carmelita-agent.vercel.app",
  "agente-asistente.vercel.app",
]);

/** Messages contain configuration names only: never include URLs or credentials. */
function reject(reason: string): never {
  throw new Error(`preview_isolation_${reason}`);
}

function required(env: PreviewIsolationEnvironment, key: string): string {
  const value = env[key]?.trim();
  if (!value) reject(`missing_${key}`);
  return value;
}

function normalizeDatabaseHost(host: string): string {
  return host.toLowerCase().replace(/-pooler(?=\.)/, "");
}

function databaseHost(value: string, key: string): string {
  // Require a hostname, rather than a connection string or suffix allowlist.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value)) {
    reject(`invalid_${key}`);
  }
  return normalizeDatabaseHost(value);
}

function databaseConnection(value: string, expectedHost: string, key: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return reject(`invalid_${key}`);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.username ||
    !parsed.password ||
    parsed.pathname.length < 2 ||
    parsed.pathname.slice(1).includes("/") ||
    parsed.hash ||
    (parsed.port && parsed.port !== "5432") ||
    normalizeDatabaseHost(parsed.hostname) !== expectedHost
  ) {
    reject(`invalid_${key}`);
  }
  // libpq-style overrides must not redirect a checked URL to another database.
  const safeParameters = new Set(["sslmode", "channel_binding", "connect_timeout", "application_name"]);
  for (const key of parsed.searchParams.keys()) {
    if (!safeParameters.has(key)) reject("database_connection_override");
    if (parsed.searchParams.getAll(key).length !== 1) reject("database_connection_override");
  }
  if (!["require", "verify-ca", "verify-full"].includes(parsed.searchParams.get("sslmode") ?? "")) {
    reject("database_tls_required");
  }
  return parsed;
}

function sameDatabase(left: URL, right: URL): boolean {
  return (
    left.pathname === right.pathname &&
    left.username === right.username &&
    left.password === right.password
  );
}

/** Local acceptance runners must use the same dedicated connections as Vercel Preview. */
export function requiresPreviewDatabaseIsolation(env: PreviewIsolationEnvironment = process.env): boolean {
  return env.VERCEL_ENV === "preview" || env.CARMELITA_PREVIEW_ISOLATED === "true" ||
    env.CARMELITA_PREVIEW_DATABASE_URL !== undefined || env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED !== undefined;
}

/** Fail closed before acceptance writes or migrations. Does not read env files. */
export function assertPreviewIsolation(
  env: PreviewIsolationEnvironment = process.env,
): PreviewIsolation {
  if (env.CARMELITA_PREVIEW_ISOLATED !== "true") reject("not_enabled");
  if (env.VERCEL_ENV === "production" || env.VERCEL_TARGET_ENV === "production") {
    reject("production_environment");
  }
  const host = databaseHost(required(env, "CARMELITA_PREVIEW_DATABASE_HOST"), "CARMELITA_PREVIEW_DATABASE_HOST");
  if (env.CARMELITA_PRODUCTION_DATABASE_HOST) {
    const productionHost = databaseHost(env.CARMELITA_PRODUCTION_DATABASE_HOST.trim(), "CARMELITA_PRODUCTION_DATABASE_HOST");
    if (host === productionHost) reject("production_database");
  }

  // Marketplace-managed DATABASE_URL* values can change during deployment. Preview
  // runtime and migrations select only these dedicated branch-scoped connections.
  const databaseUrl = required(env, "CARMELITA_PREVIEW_DATABASE_URL");
  const migrationDatabaseUrl = required(env, "CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED");
  const runtime = databaseConnection(databaseUrl, host, "CARMELITA_PREVIEW_DATABASE_URL");
  const migration = databaseConnection(migrationDatabaseUrl, host, "CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED");
  if (migration.hostname.toLowerCase().split(".")[0].endsWith("-pooler")) {
    reject("migration_connection_pooled");
  }
  if (!sameDatabase(runtime, migration)) reject("database_connections_disagree");

  const originValue = required(env, "CARMELITA_PREVIEW_ORIGIN");
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    return reject("invalid_origin");
  }
  if (
    origin.protocol !== "https:" || origin.username || origin.password || origin.port ||
    origin.pathname !== "/" || origin.search || origin.hash ||
    productionOrigins.has(origin.hostname.replace(/\.$/, ""))
  ) {
    reject("invalid_origin");
  }

  const deployment = required(env, "CARMELITA_PREVIEW_DEPLOYMENT");
  if (/\s/.test(deployment)) reject("invalid_deployment");
  if (deployment.includes(":")) {
    let target: URL;
    try {
      target = new URL(deployment);
    } catch {
      return reject("invalid_deployment");
    }
    if (target.protocol !== "https:" || target.username || target.password ||
      target.pathname !== "/" || target.search || target.hash || target.port ||
      productionOrigins.has(target.hostname.replace(/\.$/, ""))) {
      reject("invalid_deployment");
    }
  } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(deployment) || productionOrigins.has(deployment.toLowerCase().replace(/\.$/, ""))) {
    reject("invalid_deployment");
  }

  return { databaseUrl, migrationDatabaseUrl, previewOrigin: origin.origin, deployment };
}
