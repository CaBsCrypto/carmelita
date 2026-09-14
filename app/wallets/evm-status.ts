import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { diagnoseEvmWallet } from "@/app/wallets/evm-rpc";
import { getWalletNetwork, isWalletNetworkEnabled, type WalletNetwork } from "@/app/wallets/networks";
import { walletNetworkIdSchema } from "@/app/wallets/types";

type WalletRow = { id: string; address: string; chainType: string; network: string; status: string };
type Dependencies = {
  authenticate: (token: string) => Promise<{ user_id: string }>;
  wallets: (userId: string) => Promise<WalletRow[]>;
  diagnose: (network: WalletNetwork, address: string) => Promise<Awaited<ReturnType<typeof diagnoseEvmWallet>>>;
};

export function createEvmStatusHandler(dependencies: Dependencies = {
  authenticate: verifyPrivyAccessToken, wallets: listPersistedUserWallets, diagnose: diagnoseEvmWallet,
}) {
  return async (request: Request) => {
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return respond({ error: "authentication_required" }, 401);
    let userId: string;
    try { userId = (await dependencies.authenticate(token)).user_id; }
    catch { return respond({ error: "authentication_required" }, 401); }

    const params = new URL(request.url).searchParams;
    const networkId = walletNetworkIdSchema.safeParse(params.get("network"));
    if (!networkId.success || params.getAll("network").length !== 1 || [...params.keys()].some((key) => key !== "network")) {
      return respond({ error: "invalid_evm_network" }, 400);
    }
    const network = getWalletNetwork(networkId.data);
    if (network.family !== "evm" || !network.testnet) return respond({ error: "invalid_evm_network" }, 400);
    if (!isWalletNetworkEnabled(network.id)) return respond({ error: "network_not_available" }, 409);

    let wallets: WalletRow[];
    try { wallets = await dependencies.wallets(userId); }
    catch { return respond({ error: "wallet_storage_unavailable" }, 503); }
    const wallet = wallets.find((row) => row.chainType === "ethereum" && row.network === network.id && row.status === "active");
    if (!wallet) return respond({ error: "evm_network_not_registered", network: network.id }, 409);

    try {
      const diagnostics = await dependencies.diagnose(network, wallet.address);
      return respond({ ...diagnostics, balances: { native: { asset: diagnostics.nativeAsset, balance: diagnostics.balance } } });
    } catch (error) {
      const code = error instanceof Error && error.message === "evm_chain_id_mismatch" ? error.message : "evm_balance_unavailable";
      return respond({ error: code, network: network.id }, 502);
    }
  };
}
