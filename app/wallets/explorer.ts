import { WALLET_NETWORKS } from "./networks";
import { walletNetworkIdSchema } from "./types";
import { isValidWalletAddress } from "./privy";

export function walletExplorerUrl(networkId: string, address: string): string | null {
  const parsed = walletNetworkIdSchema.safeParse(networkId);
  if (!parsed.success) return null;
  const network = WALLET_NETWORKS[parsed.data];
  if (!isValidWalletAddress(network.family, address)) return null;
  const url = new URL(network.explorerUrl);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${network.family === "stellar" ? "account" : "address"}/${address}`;
  return url.toString();
}
