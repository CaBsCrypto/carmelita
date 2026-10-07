import { getAdminIdentity, type AdminIdentity } from "@/app/admin/auth";
import { createWalletRecoveryHandler } from "@/app/admin/wallets/recovery-handler";
import { inspectWalletRecovery, recoverRegisteredWallets } from "@/app/admin/wallets/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let actor: AdminIdentity | null = null;
  return createWalletRecoveryHandler({
    admin: async () => { actor = await getAdminIdentity(); return actor; },
    inspect: inspectWalletRecovery,
    prepare: (privyDid, expectedEmail) => recoverRegisteredWallets({ privyDid, expectedEmail, actor: actor!.username }),
  })(request);
}
