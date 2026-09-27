import { listPersistedUserWallets } from "@/app/multichain-account";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { diagnoseEvmWallet, getErc20Balance } from "@/app/wallets/evm-rpc";
import { getWalletNetwork } from "@/app/wallets/networks";
import {
  CCTP_TESTNET,
  type CctpBridgeReadiness,
} from "@/app/connectors/circle-cctp";

export async function getCctpFujiToStellarContext(
  userId: string,
  dependencies = { listWallets: listPersistedUserWallets, diagnoseEvmWallet, getErc20Balance, getStellarTestnetAccount },
): Promise<CctpBridgeReadiness> {
  const wallets = (await dependencies.listWallets(userId)).filter((wallet) => wallet.userId === userId && wallet.status === "active");
  const source = wallets.find(
    (wallet) =>
      wallet.network === "avalanche:fuji" &&
      wallet.chainType === "ethereum",
  );
  const destination = wallets.find(
    (wallet) =>
      wallet.network === "stellar:testnet" &&
      wallet.chainType === "stellar",
  );

  const [fuji, fujiUsdc, stellar] = await Promise.all([
    source
      ? dependencies.diagnoseEvmWallet(getWalletNetwork("avalanche:fuji"), source.address)
        .catch(() => null)
      : null,
    source
      ? dependencies.getErc20Balance(
        getWalletNetwork("avalanche:fuji"),
        CCTP_TESTNET.avalanche.usdc,
        source.address,
        6,
      ).catch(() => null)
      : null,
    destination
      ? dependencies.getStellarTestnetAccount(destination.address).catch(() => null)
      : null,
  ]);
  const circleUsdc = stellar?.balances.find(
    (balance) =>
      balance.asset === "USDC" &&
      balance.issuer === CCTP_TESTNET.stellar.usdcIssuer,
  );
  const xlm = stellar?.balances.find((balance) => balance.asset === "XLM");
  return {
    sourceAddress: source?.address ?? null,
    destinationAddress: destination?.address ?? null,
    sourceGasReady: source ? fuji?.funded ?? null : false,
    sourceUsdcBalance: source ? fujiUsdc?.balance ?? null : null,
    destinationGasReady: destination
      ? stellar?.exists === true && Number(xlm?.balance ?? 0) > 0
      : false,
    destinationTrustlineReady: destination ? Boolean(circleUsdc) : false,
  };
}
