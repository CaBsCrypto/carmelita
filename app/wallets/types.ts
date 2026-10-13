import { z } from "zod";

export const walletFamilySchema = z.enum(["stellar", "evm", "solana"]);
export type WalletFamily = z.infer<typeof walletFamilySchema>;

export const privyChainTypeSchema = z.enum(["stellar", "ethereum", "solana"]);
export type PrivyChainType = z.infer<typeof privyChainTypeSchema>;

export const walletNetworkIdSchema = z.enum([
  "stellar:testnet",
  "base:sepolia",
  "solana:devnet",
  "avalanche:fuji",
  "bnb:testnet",
  "tempo:moderato",
]);
export type WalletNetworkId = z.infer<typeof walletNetworkIdSchema>;

export type TempoReadErrorCode =
  | "tempo_disabled"
  | "tempo_configuration_incomplete"
  | "tempo_wrong_chain"
  | "tempo_rpc_timeout"
  | "tempo_rpc_unavailable"
  | "tempo_rpc_invalid_response"
  | "tempo_token_metadata_mismatch"
  | "tempo_invalid_address";

export type TempoTokenBalance = {
  standard: "TIP-20";
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  balanceAtomic: string;
  balance: string;
  metadataVerified: true;
};

type TempoReadingContext = {
  network: "tempo:moderato";
  caip2: "eip155:42431";
  testnet: true;
  address: string;
  queriedAt: string;
  explorerUrl: string;
};

export type TempoWalletReading = TempoReadingContext & (
  | {
      status: "available";
      chainId: 42431;
      token: TempoTokenBalance;
      block: {
        number: string;
        hash: `0x${string}`;
        /** Unix timestamp in seconds, represented as a decimal integer string. */
        timestamp: string;
      };
    }
  | {
      status: "disabled" | "misconfigured" | "wrong_network" | "unavailable";
      token: null;
      block: null;
      error: { code: TempoReadErrorCode; message: string };
    }
);

export type UserWallet = {
  id: string;
  address: string;
  family: WalletFamily;
  chainType: PrivyChainType;
  created: boolean;
  owner: "user";
};

export const PRIVY_CHAIN_TYPE_BY_FAMILY: Record<WalletFamily, PrivyChainType> = {
  stellar: "stellar",
  evm: "ethereum",
  solana: "solana",
};

export function familyForPrivyChainType(chainType: PrivyChainType): WalletFamily {
  if (chainType === "ethereum") return "evm";
  return chainType;
}
