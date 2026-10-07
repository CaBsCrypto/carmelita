import { getPrivyUserIdentity, verifyPrivyAccessToken } from "@/app/privy-stellar";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { connectionReadinessResponse } from "@/app/connect-chatgpt/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return connectionReadinessResponse(request, { verify: verifyPrivyAccessToken, identity: getPrivyUserIdentity, wallets: listPersistedUserWallets });
}
