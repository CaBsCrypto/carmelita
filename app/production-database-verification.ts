import { createHash } from "node:crypto";

type Environment = Record<string, string | undefined>;
type DatabaseIdentity = { database_name: string; role_name: string };

/** Shared read-only connection verification. Callers must authenticate operational access. */
export async function verifyProductionDatabaseConnections(
  runtimeValue: string | undefined,
  env: Environment,
  query: (url: string) => Promise<DatabaseIdentity[]>,
) {
  try {
    if (env.VERCEL_ENV !== "production" ||
      Object.keys(env).some(key => key.startsWith("CARMELITA_PREVIEW_") && env[key] !== undefined)) throw new Error();
    const parse = (value: string | undefined) => {
      const url = new URL(value ?? "");
      const allowed = new Set(["sslmode", "channel_binding", "connect_timeout", "application_name"]);
      if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.username || !url.password || url.hash ||
        !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) || (url.port && url.port !== "5432") ||
        !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode") ?? "") ||
        [...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) throw new Error();
      return url;
    };
    const runtime = parse(runtimeValue);
    const direct = parse(env.DATABASE_URL_UNPOOLED);
    const identity = (url: URL) => `${url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}${url.pathname}`;
    const databaseFingerprint = createHash("sha256").update(identity(runtime)).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(env.CARMELITA_QA_DATABASE_FINGERPRINT ?? "") ||
      databaseFingerprint !== env.CARMELITA_PRODUCTION_DATABASE_FINGERPRINT ||
      databaseFingerprint === env.CARMELITA_QA_DATABASE_FINGERPRINT ||
      identity(runtime) !== identity(direct) || runtime.username !== direct.username || runtime.password !== direct.password ||
      direct.hostname.split(".")[0].endsWith("-pooler")) throw new Error();
    for (const url of [runtime, direct]) {
      const rows = await query(url.href);
      if (rows.length !== 1 || rows[0].database_name !== url.pathname.slice(1) ||
        rows[0].role_name !== decodeURIComponent(url.username)) throw new Error();
    }
    return { verified: true as const, databaseFingerprint };
  } catch {
    throw new Error("production_database_not_verified");
  }
}

/** Public health probe remains restricted to maintenance. */
export async function verifyProductionDatabase(
  runtimeValue: string | undefined,
  env: Environment,
  query: (url: string) => Promise<DatabaseIdentity[]>,
) {
  if (env.CARMELITA_MAINTENANCE_ENABLED !== "true") throw new Error("production_database_not_verified");
  return verifyProductionDatabaseConnections(runtimeValue, env, query);
}
