import { z } from "zod";
import type { PreparationJobState } from "@/app/wallets/preparation-store";
const input = z.object({ userId: z.string().min(1).max(200).regex(/^did:privy:[A-Za-z0-9_-]+$/) }).strict();
type Dependencies = {
  identity: () => Promise<{ method: string } | null>;
  enabled: () => boolean;
  catalog: () => string;
  exists: (userId: string) => Promise<boolean>;
  status: (userId: string, catalog: string) => Promise<PreparationJobState[]>;
  retry: (userId: string, catalog: string) => Promise<number>;
};
export function preparationAdminHandler(deps: Dependencies) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
    const identity = await deps.identity();
    if (identity?.method !== "privy") return json({ error: "privy_admin_required" }, 401);
    if (!deps.enabled()) return json({ error: "wallet_preparation_disabled" }, 404);
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (request.method === "POST" && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "invalid_origin" }, 403);
    let body: unknown;
    try { body = request.method === "POST" ? await request.json() : Object.fromEntries(new URL(request.url).searchParams); }
    catch { return json({ error: "invalid_input" }, 400); }
    const parsed = input.safeParse(body);
    if (!parsed.success) return json({ error: "invalid_input" }, 400);
    try {
      const { userId } = parsed.data;
      if (!await deps.exists(userId)) return json({ error: "user_not_found" }, 404);
      const catalog = deps.catalog();
      const retried = request.method === "POST" ? await deps.retry(userId, catalog) : undefined;
      return json({ jobs: await deps.status(userId, catalog), ...(retried === undefined ? {} : { retried }) });
    } catch { return json({ error: "wallet_preparation_unavailable" }, 503); }
  };
}
