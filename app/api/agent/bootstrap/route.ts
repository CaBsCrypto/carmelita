import { NextResponse } from "next/server";
import { provisionUserWallets } from "@/app/wallets/onboarding";
import { hasDatabase } from "@/db";
import {
  PRIVY_WALLET_ARCHITECTURE,
  getPrivyStellarReadiness,
  getPrivyUserIdentity,
  verifyPrivyAccessToken,
} from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    if (!hasDatabase()) throw new Error("database_not_configured");
    const identity = await getPrivyUserIdentity(claims.user_id).catch(() => ({
      id: claims.user_id,
      email: null,
    }));
    const onboarding = await provisionUserWallets({
      userId: claims.user_id,
      email: identity.email,
    });

    return NextResponse.json(
      {
        user: { id: claims.user_id, email: identity.email },
        wallet: onboarding.stellar,
        wallets: {
          stellar: onboarding.stellar,
          avalanche: onboarding.avalanche.wallet,
          solana: onboarding.solana.wallet,
          evm: onboarding.evm.wallet,
        },
        avalanche: onboarding.avalanche,
        solana: onboarding.solana,
        evm: onboarding.evm,
        account: onboarding.account,
        activation: onboarding.activation,
        ...onboarding.agentAccount,
        readiness: getPrivyStellarReadiness(),
        walletArchitecture: PRIVY_WALLET_ARCHITECTURE,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code =
      error instanceof Error ? error.message.split(":")[0] : "bootstrap_failed";
    const status = code === "privy_not_configured" || code === "database_not_configured"
      ? 503
      : code.includes("conflict") || code === "privy_evm_wallet_ambiguous"
        ? 409
        : code === "privy_access_token_missing" || code === "invalid_privy_user_id"
          ? 401
          : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
