import { eq } from "drizzle-orm";
import { getAdminIdentity } from "@/app/admin/auth";
import { preparationAdminHandler } from "@/app/admin/wallets/preparation-api";
import { preparationCatalog, walletPreparationEnabled } from "@/app/wallets/preparation-config";
import { getStatus, retryTransient } from "@/app/wallets/preparation-store";
import { getDb } from "@/db";
import { agentUsers } from "@/db/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = preparationAdminHandler({
  identity: getAdminIdentity, enabled: walletPreparationEnabled, catalog: preparationCatalog,
  exists: async (userId) => (await getDb().select({ id: agentUsers.id }).from(agentUsers).where(eq(agentUsers.id, userId)).limit(1)).length === 1,
  status: getStatus, retry: retryTransient,
});
export const GET = handle;
export const POST = handle;
