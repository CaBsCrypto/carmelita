import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { backend } from "@/app/commerce-backend";
import { assertPreviewIsolation } from "@/app/preview-isolation";
import { maintenanceEnabled } from "@/app/maintenance";

// Acceptance checks must observe the deployed runtime, never a build-time response.
export const dynamic = "force-dynamic";

export function GET() {
  const deployment = {
    environment: process.env.VERCEL_ENV ?? "local",
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    url: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  };
  let previewIsolation: { verified: true; databaseFingerprint: string } | undefined;
  if (process.env.VERCEL_ENV === "preview") {
    try {
      const isolation = assertPreviewIsolation();
      const database = new URL(isolation.databaseUrl);
      const identity = `${database.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}/${database.pathname.slice(1)}`;
      previewIsolation = {
        verified: true,
        databaseFingerprint: createHash("sha256").update(identity).digest("hex"),
      };
    } catch {
      return NextResponse.json({
        service: "agente-asistente",
        status: "error",
        error: "preview_isolation_not_verified",
        previewIsolation: { verified: false },
        deployment,
        timestamp: new Date().toISOString(),
      }, { status: 503 });
    }
  }
  return NextResponse.json({
    service: "agente-asistente",
    status: "ok",
    maintenance: maintenanceEnabled(),
    environment: "stellar-testnet",
    persistence: backend.mode(),
    ...(previewIsolation ? { previewIsolation } : {}),
    deployment,
    custody: {
      userFunds: false,
      testnetDistributor: true,
    },
    payments: {
      commerceSandbox: "simulated",
      x402StellarTestnet: "enabled",
      mainnet: "disabled",
    },
    mcp: "/api/mcp",
    timestamp: new Date().toISOString(),
  });
}
