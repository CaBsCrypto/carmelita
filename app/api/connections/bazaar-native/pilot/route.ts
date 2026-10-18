import { createPilotWebHandler } from "@/app/bazaar/pilot-signer-web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const handler = createPilotWebHandler();
export const GET = handler;
export const POST = handler;
