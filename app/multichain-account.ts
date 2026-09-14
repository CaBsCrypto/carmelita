import { neon } from "@neondatabase/serverless";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabaseUrl, getDb, hasDatabase } from "@/db";
import { agentWalletNetworks, agentWallets } from "@/db/schema";
import { assertNetworkMatchesFamily } from "@/app/wallets/networks";
import { PRIVY_CHAIN_TYPE_BY_FAMILY, type UserWallet, type WalletNetworkId } from "@/app/wallets/types";

type ExistingWalletIdentity = {
  id: string;
  userId: string;
  address: string;
};

function identityAddress(address: string) {
  return /^0x[\da-f]{40}$/i.test(address) ? address.toLowerCase() : address;
}

export function assertWalletIdentityAvailable(
  existing: ExistingWalletIdentity[],
  input: { id: string; userId: string; address: string },
) {
  for (const row of existing) {
    if (row.userId !== input.userId) throw new Error("wallet_ownership_conflict");
    const sameAddress = identityAddress(row.address) === identityAddress(input.address);
    if (row.id === input.id && !sameAddress) throw new Error("wallet_identity_conflict");
    if (sameAddress && row.id !== input.id) throw new Error("wallet_identity_conflict");
  }
}

export function walletCreatedActivityId(walletId: string, network: WalletNetworkId) {
  return `wallet-created:${walletId}:${network}`;
}

export type WalletPersistenceStatement = { text: string; parameters: unknown[] };
export type WalletPersistenceDependencies = {
  transaction: (statements: WalletPersistenceStatement[]) => Promise<void>;
};
export type PersistWalletNetworksInput = {
  userId: string;
  email: string | null;
  wallet: UserWallet;
  networks: WalletNetworkId[];
  status?: "active" | "pending";
};

const defaultDependencies: WalletPersistenceDependencies = {
  transaction: async (statements) => {
    const url = getDatabaseUrl();
    if (!url) throw new Error("database_not_configured");
    const client = neon(url);
    // Neon HTTP batches every statement in one transaction. Never retry a
    // transport failure here: the caller can safely repeat the same identity.
    await client.transaction(
      statements.map(({ text, parameters }) => client.query(text, parameters)),
      { isolationLevel: "ReadCommitted" },
    );
  },
};

function translatePersistenceError(error: unknown): never {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "23505" || code === "23503" || code === "22012") {
    throw new Error("wallet_identity_conflict", { cause: error });
  }
  throw error;
}

/** Exported so database acceptance exercises the exact production SQL. */
export function buildWalletPersistenceStatements(input: PersistWalletNetworksInput): WalletPersistenceStatement[] {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  if (!input.wallet.id || !input.wallet.address || input.wallet.owner !== "user" ||
    PRIVY_CHAIN_TYPE_BY_FAMILY[input.wallet.family] !== input.wallet.chainType) {
    throw new Error("wallet_identity_conflict");
  }
  const networks = [...new Set(input.networks)];
  if (networks.length === 0) throw new Error("invalid_wallet_networks");
  for (const network of networks) assertNetworkMatchesFamily(network, input.wallet.family);
  const status = input.status ?? "active";
  if (status !== "active" && status !== "pending") throw new Error("invalid_wallet_status");
  // Retain the original column for older deployments. Additional EVM networks
  // are bindings, never a replacement for the legacy Fuji association.
  const legacyNetwork = input.wallet.family === "evm" ? "avalanche:fuji" : networks[0];
  const statements: WalletPersistenceStatement[] = [{
    text: `INSERT INTO agent_users (id, email, status, last_seen_at, updated_at)
      VALUES ($1, $2, 'active', now(), now())
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, status = 'active', last_seen_at = now(), updated_at = now()`,
    parameters: [input.userId, input.email],
  }, {
    // A conflicting ID returns no row; division by zero rolls back the whole
    // transaction, including the profile update. Unique indexes cover races
    // involving another ID or the same EVM address with different casing.
    text: `WITH canonical AS (
      INSERT INTO agent_wallets (id, user_id, address, chain_type, network, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, now())
      ON CONFLICT (id) DO UPDATE SET
        status = CASE WHEN agent_wallets.network = ANY($7::text[]) THEN EXCLUDED.status ELSE agent_wallets.status END,
        updated_at = now()
      WHERE agent_wallets.user_id = EXCLUDED.user_id
        AND agent_wallets.chain_type = EXCLUDED.chain_type
        AND CASE WHEN agent_wallets.chain_type = 'ethereum'
          THEN lower(agent_wallets.address) = lower(EXCLUDED.address)
          ELSE agent_wallets.address = EXCLUDED.address END
      RETURNING id
    ) SELECT 1 / CASE WHEN count(*) = 1 THEN 1 ELSE 0 END AS wallet_identity_available FROM canonical`,
    parameters: [input.wallet.id, input.userId, input.wallet.address, input.wallet.chainType, legacyNetwork, status, networks],
  }, {
    text: `INSERT INTO agent_wallet_networks (wallet_id, user_id, network, status, updated_at)
      SELECT $1, $2, requested.network, $3, now() FROM unnest($4::text[]) AS requested(network)
      ON CONFLICT (wallet_id, network) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
    parameters: [input.wallet.id, input.userId, status, networks],
  }];
  if (input.wallet.created) {
    for (const network of networks) statements.push({
      text: `INSERT INTO agent_activities (id, user_id, event_type, summary, metadata)
        VALUES ($1, $2, 'wallet.created', $3, $4::jsonb) ON CONFLICT (id) DO NOTHING`,
      parameters: [
        walletCreatedActivityId(input.wallet.id, network), input.userId,
        `${input.wallet.family.toUpperCase()} wallet activated on ${network}`,
        JSON.stringify({ walletId: input.wallet.id, address: input.wallet.address, family: input.wallet.family,
          chainType: input.wallet.chainType, network, provider: "privy" }),
      ],
    });
  }
  return statements;
}

export async function persistWalletNetworks(
  input: PersistWalletNetworksInput,
  dependencies: WalletPersistenceDependencies = defaultDependencies,
) {
  const statements = buildWalletPersistenceStatements(input);
  try {
    await dependencies.transaction(statements);
  } catch (error) {
    translatePersistenceError(error);
  }
  return input.wallet;
}

export async function persistActivatedWallet(input: {
  userId: string;
  email: string | null;
  wallet: UserWallet;
  network: WalletNetworkId;
}, dependencies: WalletPersistenceDependencies = defaultDependencies) {
  return persistWalletNetworks({ ...input, networks: [input.network] }, dependencies);
}

export async function getCanonicalEvmWallet(userId: string) {
  return getCanonicalWallet(userId, "ethereum");
}

export async function getCanonicalStellarWallet(userId: string) {
  return getCanonicalWallet(userId, "stellar");
}

async function getCanonicalWallet(userId: string, chainType: "ethereum" | "stellar") {
  if (!userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  if (!hasDatabase()) throw new Error("database_not_configured");
  const wallets = await getDb().select({
    id: agentWallets.id, userId: agentWallets.userId, address: agentWallets.address, chainType: agentWallets.chainType,
  }).from(agentWallets).where(and(eq(agentWallets.userId, userId), eq(agentWallets.chainType, chainType))).limit(2);
  if (wallets.length > 1) throw new Error("wallet_identity_conflict");
  return wallets[0] ?? null;
}

export async function listPersistedUserWallets(userId: string) {
  if (!hasDatabase()) return [];
  return getDb().select({
    id: agentWallets.id,
    walletId: agentWallets.id,
    userId: agentWallets.userId,
    address: agentWallets.address,
    chainType: agentWallets.chainType,
    network: agentWalletNetworks.network,
    status: agentWalletNetworks.status,
    updatedAt: agentWalletNetworks.updatedAt,
  }).from(agentWallets)
    .innerJoin(agentWalletNetworks, and(eq(agentWalletNetworks.walletId, agentWallets.id), eq(agentWalletNetworks.userId, agentWallets.userId)))
    .where(eq(agentWallets.userId, userId))
    .orderBy(desc(agentWalletNetworks.updatedAt), asc(agentWallets.id), asc(agentWalletNetworks.network));
}

export async function setPersistedWalletNetworkStatus(input: {
  userId: string;
  walletId: string;
  network: WalletNetworkId;
  status: "active" | "pending";
}, dependencies: WalletPersistenceDependencies = defaultDependencies) {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  if (input.status !== "active" && input.status !== "pending") throw new Error("invalid_wallet_status");
  try {
    await dependencies.transaction([{
      text: `WITH updated AS (
        UPDATE agent_wallet_networks SET status = $4, updated_at = now()
        WHERE wallet_id = $1 AND user_id = $2 AND network = $3 RETURNING wallet_id
      ) SELECT 1 / CASE WHEN count(*) = 1 THEN 1 ELSE 0 END AS wallet_binding_available FROM updated`,
      parameters: [input.walletId, input.userId, input.network, input.status],
    }, {
      text: `UPDATE agent_wallets SET status = $4, updated_at = now()
        WHERE id = $1 AND user_id = $2 AND network = $3`,
      parameters: [input.walletId, input.userId, input.network, input.status],
    }]);
  } catch (error) {
    translatePersistenceError(error);
  }
}
