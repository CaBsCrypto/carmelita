import { NextResponse } from "next/server";
import { preparationCatalog, walletPreparationEnabled, workerAuthorized } from "@/app/wallets/preparation-config";
import { listDueUsers } from "@/app/wallets/preparation-store";
import { processPreparationUser } from "@/app/wallets/preparation-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!workerAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (new URL(request.url).search) return NextResponse.json({ error: "parameters_not_allowed" }, { status: 400 });
  if (!walletPreparationEnabled()) return NextResponse.json({ enabled: false });
  const started = Date.now();
  let processed = 0;
  try {
    const users = await listDueUsers(preparationCatalog(), 5);
    for (const userId of users) {
      if (Date.now() - started > 180_000) break;
      await processPreparationUser(userId);
      processed++;
    }
    return NextResponse.json({ processed }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "preparation_worker_unavailable", processed }, { status: 503 });
  }
}
