import { NextResponse } from "next/server";
import { persistAgentAccount } from "@/app/agent-account";
import { ensureAvalancheFujiWallet } from "@/app/wallets/avalanche-onboarding";
import { getOrCreateUserWallet } from "@/app/wallets/privy";
import {
  PRIVY_WALLET_ARCHITECTURE,
  getPrivyStellarReadiness,
  getPrivyUserIdentity,
  getStellarTestnetAccount,
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
    const wallet = await getOrCreateUserWallet(claims.user_id, "stellar");
    const account = await getStellarTestnetAccount(wallet.address);
    const activation: "active" | "pending" = account.exists
      ? "active"
      : "pending";

    const identity = await getPrivyUserIdentity(claims.user_id).catch(() => ({
      id: claims.user_id,
      email: null,
    }));
    const agentAccount = await persistAgentAccount({
      userId: claims.user_id,
      email: identity.email,
      wallet,
      activation,
    });
    const avalanche = await ensureAvalancheFujiWallet({
      userId: claims.user_id,
      email: identity.email,
    });

    return NextResponse.json(
      {
        user: { id: claims.user_id, email: identity.email },
        wallet,
        wallets: {
          stellar: wallet,
          avalanche: avalanche.wallet,
        },
        avalanche,
        account,
        activation,
        ...agentAccount,
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
      : code === "wallet_ownership_conflict" || code === "wallet_identity_conflict"
        ? 409
        : code === "privy_access_token_missing" || code === "invalid_privy_user_id"
          ? 401
          : 500;
    return NextResponse.json({ error: code }, { status });
  }
}