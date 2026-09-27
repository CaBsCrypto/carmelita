import { persistWalletNetworks } from "@/app/multichain-account";
import { enabledEvmNetworks } from "@/app/wallets/networks";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import type { UserWallet, WalletNetworkId } from "@/app/wallets/types";

type Dependencies = {
  getOrCreateWallet: (userId: string, family: "evm") => Promise<UserWallet>;
  persistNetworks: (input: { userId: string; email: string | null; wallet: UserWallet; networks: WalletNetworkId[] }) => Promise<UserWallet>;
};

export async function ensureEvmTestnetWallet(
  input: { userId: string; email: string | null },
  dependencies: Dependencies = { getOrCreateWallet: getOrCreateUserWallet, persistNetworks: persistWalletNetworks },
) {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  const wallet = await dependencies.getOrCreateWallet(input.userId, "evm");
  if (wallet.family !== "evm" || wallet.chainType !== "ethereum" || wallet.owner !== "user") {
    throw new Error("privy_invalid_evm_wallet_response");
  }
  const networks = enabledEvmNetworks();
  const persisted = await dependencies.persistNetworks({ ...input, wallet, networks: networks.map((network) => network.id) });
  return {
    wallet: persisted,
    networks: networks.map(({ id, family, name, nativeAsset, chainId, explorerUrl, rollout }) => ({ id, family, name, nativeAsset, chainId, explorerUrl, rollout })),
    fundsMoved: false as const,
    signingRequired: false as const,
  };
}
