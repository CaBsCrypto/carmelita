import { getCanonicalEvmWallet, getCanonicalSolanaWallet, getCanonicalStellarWallet } from "@/app/multichain-account";
import { getExistingUserEvmWallet, listUserWalletFamilies, selectSolanaWallet, selectStellarWallet, type CanonicalEvmIdentity } from "@/app/wallets/privy";

type CanonicalWalletReader = (userId: string) => Promise<CanonicalEvmIdentity | null>;

type ExistingOAuthWalletDependencies = {
  canonicalStellar?: CanonicalWalletReader;
  canonicalEvm?: CanonicalWalletReader;
  canonicalSolana?: CanonicalWalletReader;
  listFamilies?: typeof listUserWalletFamilies;
};

/** Validate existing owner identities only; never activate, fund, create or persist a wallet. */
export async function assertExistingOAuthWallets(userId: string, dependencies: ExistingOAuthWalletDependencies = {}): Promise<void> {
  try {
    if (!userId.startsWith("did:privy:")) throw new Error("wallet_identity_conflict");
    const [stellar, evm, solana] = await Promise.all([
      (dependencies.canonicalStellar ?? getCanonicalStellarWallet)(userId),
      (dependencies.canonicalEvm ?? getCanonicalEvmWallet)(userId),
      (dependencies.canonicalSolana ?? getCanonicalSolanaWallet)(userId),
    ]);
    if (!stellar || !evm || !solana) throw new Error("oauth_existing_wallets_required");
    const families = await (dependencies.listFamilies ?? listUserWalletFamilies)(userId);
    const candidates = (family: "stellar" | "evm" | "solana", canonical: typeof evm) => {
      const wallets = families[family];
      if (!wallets.length) throw new Error("oauth_existing_wallets_required");
      if (wallets.some(wallet => wallet.family !== family || wallet.owner !== "user") ||
          wallets.filter(wallet => wallet.id === canonical.id).length !== 1) {
        throw new Error("wallet_identity_conflict");
      }
      return wallets.map(wallet => ({ id: wallet.id, address: wallet.address, chain_type: wallet.chainType }));
    };
    selectStellarWallet(candidates("stellar", stellar), { userId, canonical: stellar });
    selectSolanaWallet(candidates("solana", solana), { userId, canonical: solana });
    const evmCandidates = candidates("evm", evm);
    await getExistingUserEvmWallet(userId, {
      canonicalEvmWallet: async () => evm,
      listWallets: async () => evmCandidates,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "oauth_existing_wallets_required" || code === "wallet_identity_conflict") throw new Error(code);
    // Provider/SQL diagnostics may contain private request data.
    throw new Error("oauth_existing_wallets_unavailable");
  }
}
