import { persistActivatedWallet } from "@/app/multichain-account";
import { getWalletNetwork, isTempoTestnetEnabled, TEMPO_MODERATO_EXPLORER_URL } from "@/app/wallets/networks";
import { getExistingUserEvmWallet, isValidWalletAddress } from "@/app/wallets/privy";
import { readTempoWallet, type TempoReadOptions } from "@/app/wallets/tempo";
import type { TempoWalletReading, UserWallet } from "@/app/wallets/types";

export type TempoOnboardingDependencies = {
  getExistingWallet: (userId: string) => Promise<UserWallet>;
  read: (address: string, options?: TempoReadOptions) => Promise<TempoWalletReading>;
  persistWallet: (input: { userId: string; email: string | null; wallet: UserWallet; network: "tempo:moderato" }) => Promise<UserWallet>;
};

/** Explicit association only: verifies Moderato before writing the existing EVM identity. */
export async function ensureTempoTestnetWallet(
  input: { userId: string; email: string | null; signal?: AbortSignal },
  dependencies: TempoOnboardingDependencies = {
    getExistingWallet: getExistingUserEvmWallet, read: readTempoWallet, persistWallet: persistActivatedWallet,
  },
) {
  if (!input.userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
  if (!isTempoTestnetEnabled()) throw new Error("tempo_disabled");
  const wallet = await dependencies.getExistingWallet(input.userId);
  if (!wallet.id || wallet.family !== "evm" || wallet.chainType !== "ethereum" || wallet.owner !== "user"
    || wallet.created || !isValidWalletAddress("evm", wallet.address)) throw new Error("wallet_identity_conflict");
  const result = await dependencies.read(wallet.address, { signal: input.signal });
  if (result.status !== "available") throw new Error(result.error.code);
  if (result.network !== "tempo:moderato" || result.chainId !== 42431 || result.caip2 !== "eip155:42431"
    || result.testnet !== true || result.address.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("wallet_response_mismatch");
  const tempo = { ...result, address: wallet.address, explorerUrl: `${TEMPO_MODERATO_EXPLORER_URL}/address/${wallet.address}` };
  input.signal?.throwIfAborted();
  const persisted = await dependencies.persistWallet({ userId: input.userId, email: input.email, wallet, network: "tempo:moderato" });
  if (persisted.id !== wallet.id || persisted.address !== wallet.address) throw new Error("wallet_identity_conflict");
  const network = getWalletNetwork("tempo:moderato");
  return {
    wallet: persisted,
    network: {
      id: network.id, family: network.family, name: network.name, testnet: network.testnet,
      nativeAsset: network.nativeAsset, balanceKind: network.balanceKind, balanceToken: network.balanceToken,
      readOnly: true, chainId: network.chainId, explorerUrl: network.explorerUrl, faucetUrl: network.faucetUrl,
      rollout: network.rollout,
    },
    tempo, fundsMoved: false as const, signingRequired: false as const,
  };
}
