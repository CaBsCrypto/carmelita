import { createHandoffHandler } from "@/app/bazaar/pilot-handoff-web";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=60;
const handler=createHandoffHandler();
export const GET=handler;
export const POST=handler;
