import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { requireMcpSubject } from "@/app/mcp/auth";
import { readTempoExistingWallet, type TempoExistingWalletDependencies } from "@/app/mcp/tempo-existing-wallet";
import { persistActivatedWallet } from "@/app/multichain-account";
import { getExistingUserEvmWallet } from "@/app/wallets/privy";
import { isTempoTestnetEnabled } from "@/app/wallets/networks";
import type { UserWallet } from "@/app/wallets/types";

export const tempoWalletAssociationInputSchema = z.object({ explicitUserConfirmation: z.literal(true) }).strict();

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
export type TempoWalletAssociationDependencies = Omit<Partial<TempoExistingWalletDependencies>, "enabled"> & {
  env?: RuntimeEnvironment;
  persistWallet?: (input: {
    userId: string; email: null; wallet: UserWallet; network: "tempo:moderato"; preserveUserActivity: true;
  }) => Promise<UserWallet>;
};

export function isTempoChatAssociationEnabled(env: RuntimeEnvironment = process.env) {
  return env.CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED === "true" && isTempoTestnetEnabled(env);
}

const persistenceErrors = new Set(["wallet_identity_conflict", "wallet_ownership_conflict", "wallet_persistence_unavailable", "database_not_configured"]);

/** Explicit owner-authorized registry association only; never creates, funds or signs a wallet. */
export async function associateTempoWallet(input: unknown, authInfo: AuthInfo | undefined, dependencies: TempoWalletAssociationDependencies = {}) {
  const userId = requireMcpSubject(authInfo, "user", "userId", "agent:wallet:associate");
  requireMcpSubject(authInfo, "user", "userId", "agent:read");
  tempoWalletAssociationInputSchema.parse(input);
  const env = dependencies.env ?? process.env;
  if (!isTempoChatAssociationEnabled(env)) throw new Error("tempo_chat_association_disabled");
  let existingWallet: UserWallet | undefined;
  const reading = await readTempoExistingWallet({}, authInfo, {
    ...dependencies,
    enabled: () => isTempoTestnetEnabled(env),
    getExistingWallet: async (owner, options) => {
      const wallet = await (dependencies.getExistingWallet ?? getExistingUserEvmWallet)(owner, options);
      // Capture request-local identity before the reader/provider can return additional data.
      existingWallet = { id: wallet.id, address: wallet.address, owner: wallet.owner, created: wallet.created,
        family: wallet.family, chainType: wallet.chainType };
      return wallet;
    },
  });
  if (reading.tempo.status !== "available") throw new Error(reading.tempo.error.code);
  if (!existingWallet || existingWallet.address.toLowerCase() !== reading.evm.address.toLowerCase()) throw new Error("wallet_identity_conflict");
  const wallet: UserWallet = { id: existingWallet.id, address: reading.evm.address, owner: "user", created: false,
    family: "evm", chainType: "ethereum" };
  if (!isTempoChatAssociationEnabled(env)) throw new Error("tempo_chat_association_disabled");
  if (dependencies.signal?.aborted) throw new Error("tempo_rpc_unavailable");
  let persisted: UserWallet;
  try {
    persisted = await (dependencies.persistWallet ?? persistActivatedWallet)({
      userId, email: null, wallet, network: "tempo:moderato", preserveUserActivity: true,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    throw new Error(persistenceErrors.has(code) ? code : "wallet_persistence_unavailable");
  }
  if (persisted.id !== wallet.id || persisted.address.toLowerCase() !== wallet.address.toLowerCase()
    || persisted.owner !== "user" || persisted.family !== "evm" || persisted.chainType !== "ethereum" || persisted.created !== false) {
    throw new Error("wallet_identity_conflict");
  }
  return {
    associated: true as const,
    associationPersisted: true as const,
    association: { network: "tempo:moderato" as const, address: wallet.address },
    source: reading.source, evm: reading.evm, tempo: reading.tempo,
    // The SQL write ran, including on idempotent replay; this is not a newly inserted row count.
    registryChanged: true as const, walletCreated: false as const, fundsMoved: false as const, signingRequired: false as const,
  };
}
