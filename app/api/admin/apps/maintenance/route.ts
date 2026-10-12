import { z } from "zod";
import { getAdminIdentity } from "@/app/admin/auth";
import { appFailure, appResponse, hasSameAppRequestOrigin } from "@/app/apps/http";
import { pruneExpiredBazaarInputs } from "@/app/bazaar/consumer-store";
export const runtime = "nodejs";
const input = z.object({ operation: z.literal("prune-expired-inputs") }).strict();
export async function POST(request: Request) {
  try { if (!await getAdminIdentity()) return appResponse({ error: "apps_admin_required" }, 401); if (!hasSameAppRequestOrigin(request)) throw new Error("apps_invalid_origin"); input.parse(await request.json()); return appResponse(await pruneExpiredBazaarInputs()); }
  catch (error) { return appFailure(error); }
}
