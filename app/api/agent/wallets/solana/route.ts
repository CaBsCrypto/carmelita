import { NextResponse } from "next/server";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { getSolanaDevnetBalance } from "@/app/wallets/solana-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function GET(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    const wallets = await listPersistedUserWallets(claims.user_id);
    const solanaWallet = wallets.find(
      (candidate) =>
        candidate.chainType === "solana" &&
        candidate.network === "solana:devnet" &&
        candidate.status === "active",
    );

    if (!solanaWallet) {
      return NextResponse.json(
        { error: "solana_not_activated" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const balanceInfo = await getSolanaDevnetBalance(solanaWallet.address).catch(() => ({
      address: solanaWallet.address,
      lamports: 0,
      sol: 0,
      formatted: "0.0000 SOL",
    }));

    return NextResponse.json(
      {
        address: solanaWallet.address,
        network: "solana:devnet",
        nativeAsset: "SOL",
        balance: balanceInfo.formatted,
        sol: balanceInfo.sol,
        lamports: balanceInfo.lamports,
        explorerUrl: `https://explorer.solana.com/address/${solanaWallet.address}?cluster=devnet`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "solana_status_failed";
    return NextResponse.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
