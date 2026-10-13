import { createTempoStatusHandler } from "@/app/wallets/tempo-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createTempoStatusHandler();
