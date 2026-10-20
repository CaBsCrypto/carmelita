import { createWorkspaceReadHandler } from "@/app/bazaar/workspace-read-web";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const POST = createWorkspaceReadHandler();
