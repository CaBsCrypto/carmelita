import { persistAgentAccount } from "@/app/agent-account";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { ensureAvalancheFujiWallet } from "@/app/wallets/avalanche-onboarding";
import { ensureSolanaDevnetWallet } from "@/app/wallets/solana-onboarding";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import type { UserWallet } from "@/app/wallets/types";
import { ensureEvmTestnetWallet } from "@/app/wallets/evm-onboarding";
import { hasDatabase, getDb } from "@/db";
import { sql } from "drizzle-orm";
import { persistWalletNetworks } from "@/app/multichain-account";

type StellarAccount = Awaited<ReturnType<typeof getStellarTestnetAccount>>;
type AgentAccount = Awaited<ReturnType<typeof persistAgentAccount>>;
type AvalancheAccount = Awaited<ReturnType<typeof ensureAvalancheFujiWallet>>;
type SolanaAccount = Awaited<ReturnType<typeof ensureSolanaDevnetWallet>>;

export type FamilyPreparation = { status: "ready" | "failed" | "conflict"; error: string | null; retryable: boolean };

export type WalletOnboardingDependencies = {
  updateStellarStatus?: (wallet: UserWallet, input: { userId: string; email: string | null }, activation: "active" | "pending") => Promise<unknown>;
  ensureEvmWallet?: typeof ensureEvmTestnetWallet;
  getOrCreateStellarWallet: (userId: string) => Promise<UserWallet>;
  getStellarAccount: (address: string) => Promise<StellarAccount>;
  persistStellarAccount: (input: {
    userId: string;
    email: string | null;
    wallet: UserWallet;
    activation: "active" | "pending" | "unknown";
  }) => Promise<AgentAccount>;
  ensureAvalancheWallet: (input: {
    userId: string;
    email: string | null;
  }) => Promise<AvalancheAccount>;
  ensureSolanaWallet: (input: {
    userId: string;
    email: string | null;
  }) => Promise<SolanaAccount>;
};

const defaultDependencies: WalletOnboardingDependencies = {
  ensureEvmWallet: ensureEvmTestnetWallet,
  updateStellarStatus: (wallet, input, activation) => persistWalletNetworks({ ...input, wallet, networks: ["stellar:testnet"], status: activation }),
  getOrCreateStellarWallet: (userId) => getOrCreateUserWallet(userId, "stellar"),
  getStellarAccount: address => getStellarTestnetAccount(address, AbortSignal.timeout(8000)),
  persistStellarAccount: async input => {
    try { return await persistAgentAccount(input); }
    catch (error) {
      if (error instanceof Error && error.message.includes("conflict")) throw error;
      throw new Error("wallet_persistence_unavailable", { cause: error });
    }
  },
  ensureAvalancheWallet: ensureAvalancheFujiWallet,
  ensureSolanaWallet: ensureSolanaDevnetWallet,
};

export async function provisionUserWallets(
  input: { userId: string; email: string | null },
  dependencies: WalletOnboardingDependencies = defaultDependencies,
) {
  if (!input.userId.startsWith("did:privy:")) {
    throw new Error("invalid_privy_user_id");
  }
  if (dependencies === defaultDependencies && !hasDatabase()) throw new Error("database_not_configured");

  if (dependencies === defaultDependencies) {
    try { await getDb().execute(sql`select 1`); }
    catch { throw new Error("wallet_persistence_unavailable"); }
  }
  let persistenceFailed = false;

  const capture = async <T>(work: () => Promise<T>): Promise<{ value: T | null; preparation: FamilyPreparation }> => {
    try { return { value: await work(), preparation: { status: "ready", error: null, retryable: false } }; }
    catch (error) {
      const message = error instanceof Error ? error.message.split(":")[0] : "wallet_preparation_failed";
      if (message === "wallet_persistence_unavailable" || message === "database_not_configured") persistenceFailed = true;
      const conflict = message.includes("conflict") || message.includes("ambiguous");
      // Do not expose raw provider/database messages or credentials in public responses.
      return { value: null, preparation: { status: conflict ? "conflict" : "failed", error: conflict ? "wallet_identity_conflict" : "wallet_preparation_failed", retryable: !conflict } };
    }
  };
  const [stellarResult, evmResult, solanaResult] = await Promise.all([
    capture(async () => {
      const wallet = await dependencies.getOrCreateStellarWallet(input.userId);
      if (wallet.family !== "stellar" || wallet.chainType !== "stellar" || wallet.owner !== "user") throw new Error("wallet_identity_conflict");
      // Persist identity before asking the network. Unknown does not downgrade an existing active registration.
      const agentAccount = await dependencies.persistStellarAccount({ ...input, wallet, activation: "unknown" });
      let account: StellarAccount | null = null;
      let activation: "active" | "pending" | "unknown" = "unknown";
      let readError: string | null = null;
      try { account = await dependencies.getStellarAccount(wallet.address); }
      catch { readError = "stellar_account_unavailable"; }
      if (account) {
        activation = account.exists ? "active" : "pending";
        await dependencies.updateStellarStatus?.(wallet, input, activation);
      }
      return { wallet, account, activation, agentAccount, readError };
    }),
    capture(async () => {
      if (dependencies.ensureEvmWallet) return dependencies.ensureEvmWallet(input);
      const avalanche = await dependencies.ensureAvalancheWallet(input);
      return { wallet: avalanche.wallet, networks: [avalanche.network], fundsMoved: false as const, signingRequired: false as const };
    }),
    capture(() => dependencies.ensureSolanaWallet(input)),
  ]);
  if (persistenceFailed) throw new Error("wallet_persistence_unavailable");
  const evm = evmResult.value;
  return {
    stellar: stellarResult.value?.wallet ?? null,
    avalanche: evm ? { wallet: evm.wallet, network: evm.networks.find(network => network.id === "avalanche:fuji")!, fundsMoved: false as const, signingRequired: false as const } : null,
    evm,
    solana: solanaResult.value,
    account: stellarResult.value?.account ?? null,
    activation: stellarResult.value?.activation ?? "unknown",
    agentAccount: stellarResult.value?.agentAccount ?? null,
    persistence: { configured: true, provider: "Neon Postgres" },
    preparation: { stellar: stellarResult.preparation, evm: evmResult.preparation, solana: solanaResult.preparation },
    reads: { stellar: { status: stellarResult.value?.account ? "ready" : "failed", error: stellarResult.value?.readError ?? (stellarResult.value ? null : "stellar_wallet_unavailable") } },
    fundsMoved: false as const,
    signingRequired: false as const,
  };
}
