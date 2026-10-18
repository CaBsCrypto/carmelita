import { createBazaarNativeLinkHandler } from "@/app/bazaar/native-link-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const POST = createBazaarNativeLinkHandler();
