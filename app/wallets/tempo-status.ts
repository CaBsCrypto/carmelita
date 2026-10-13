import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { isTempoTestnetEnabled, TEMPO_MODERATO_EXPLORER_URL } from "@/app/wallets/networks";
import { readTempoWallet, type TempoReadOptions } from "@/app/wallets/tempo";
import type { TempoWalletReading } from "@/app/wallets/types";

export type TempoStatusDependencies = {
  authenticate: (token: string) => Promise<{ user_id: string }>;
  wallets: (userId: string) => Promise<{ id: string; address: string; chainType: string; network: string; status: string; userId: string }[]>;
  read: (address: string, options?: TempoReadOptions) => Promise<TempoWalletReading>;
  enabled?: () => boolean;
};

export function createTempoStatusHandler(dependencies: TempoStatusDependencies = {
  authenticate: verifyPrivyAccessToken, wallets: listPersistedUserWallets, read: readTempoWallet,
}) {
  return async (request: Request) => {
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (!token) return respond({ error: "authentication_required" }, 401);
    let userId: string;
    try {
      userId = (await dependencies.authenticate(token)).user_id;
      if (!userId.startsWith("did:privy:")) throw new Error("invalid_privy_user_id");
    } catch { return respond({ error: "authentication_required" }, 401); }
    // Wallet/address/owner are always selected from the authenticated owner's bindings.
    if ([...new URL(request.url).searchParams.keys()].length) return respond({ error: "invalid_tempo_query" }, 400);
    if (!(dependencies.enabled ?? isTempoTestnetEnabled)()) return respond({ error: "tempo_disabled" }, 503);
    let wallets: Awaited<ReturnType<TempoStatusDependencies["wallets"]>>;
    try { wallets = await dependencies.wallets(userId); }
    catch { return respond({ error: "wallet_storage_unavailable" }, 503); }
    const candidates = wallets.filter((row) => row.chainType === "ethereum" && row.network === "tempo:moderato"
      && row.status === "active" && row.userId === userId);
    if (candidates.length === 0) return respond({ error: "tempo_network_not_registered" }, 409);
    if (candidates.length !== 1) return respond({ error: "wallet_identity_conflict" }, 409);
    try {
      const reading = await dependencies.read(candidates[0].address, { signal: request.signal });
      if (reading.address.toLowerCase() !== candidates[0].address.toLowerCase() || reading.network !== "tempo:moderato") {
        return respond({ error: "wallet_response_mismatch" }, 502);
      }
      if (reading.caip2 !== "eip155:42431" || reading.testnet !== true
        || (reading.status === "available" && reading.chainId !== 42431)) return respond({ error: "tempo_wrong_chain" }, 502);
      // Preserve the canonical presentation in UI, MCP, RPC response and explorer.
      return respond({ ...reading, address: candidates[0].address,
        explorerUrl: `${TEMPO_MODERATO_EXPLORER_URL}/address/${candidates[0].address}` }, reading.status === "available" ? 200
        : reading.status === "disabled" || reading.status === "misconfigured" ? 503 : 502);
    } catch { return respond({ error: "tempo_rpc_unavailable" }, 502); }
  };
}
