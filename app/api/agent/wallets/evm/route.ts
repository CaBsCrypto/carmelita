import { createEvmStatusHandler } from "@/app/wallets/evm-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = createEvmStatusHandler();
