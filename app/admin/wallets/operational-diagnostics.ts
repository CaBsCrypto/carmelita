import { neon } from "@neondatabase/serverless";
import type { AdminIdentity } from "../auth";
import { verifyProductionDatabaseConnections } from "@/app/production-database-verification";

type Environment = Record<string, string | undefined>;
const expectedAdmins = ["cristian@browns.studio", "cabscryptocontacto@gmail.com"];
export async function readOperationalDiagnostics(identity: AdminIdentity, env: Environment = process.env,
  query = async (url: string): Promise<{ database_name: string; role_name: string }[]> => {
    const rows = await neon(url).query("SELECT current_database() AS database_name, current_user AS role_name", [], { fetchOptions: { signal: AbortSignal.timeout(10000) } });
    return rows as { database_name: string; role_name: string }[];
  }) {
  const admins = (env.CARMELITA_ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  if (identity.method !== "privy" || !admins.includes(identity.username.trim().toLowerCase())) return null;
  if (env.VERCEL_ENV !== "production") return null;
  const deployment = {
    commit: /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA ?? "") ? env.VERCEL_GIT_COMMIT_SHA : null,
    id: /^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID ?? "") ? env.VERCEL_DEPLOYMENT_ID : null,
  };
  const checks = {
    oauthResourceEnabled: env.CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED?.trim().toLowerCase() === "true",
    stytchConfigurationPresent: ["STYTCH_PROJECT_ID", "STYTCH_SECRET", "STYTCH_PROJECT_DOMAIN"].every(key => Boolean(env[key]?.trim())),
    publicOriginExpected: env.CARMELITA_PUBLIC_ORIGIN === "https://carmelita.browns.studio",
    evmExpansionEnabled: env.CARMELITA_EVM_TESTNET_EXPANSION_ENABLED === "true",
    bazaarDiscoveryDisabled: env.STELLAR_BAZAAR_DISCOVERY_ENABLED !== "true",
    expectedAdministratorsPresent: expectedAdmins.every(email => admins.includes(email)),
    onlyExpectedAdministrators: admins.length === expectedAdmins.length && admins.every(email => expectedAdmins.includes(email)),
  };
  try {
    const runtime = env.DATABASE_URL || env.DATABASE_URL_DATABASE_URL || env.DATABASE_URL_UNPOOLED;
    const result = await verifyProductionDatabaseConnections(runtime, env, query);
    return { checkedAt: new Date().toISOString(), deployment, databaseVerified: true,
      runtimeFingerprint: result.databaseFingerprint, migrationFingerprint: result.databaseFingerprint, checks };
  } catch {
    return { checkedAt: new Date().toISOString(), deployment, databaseVerified: false,
      runtimeFingerprint: null, migrationFingerprint: null, checks };
  }
}
