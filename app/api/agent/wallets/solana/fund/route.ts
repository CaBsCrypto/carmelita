import { NextResponse } from "next/server";
import { z } from "zod";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { getSolanaDevnetBalance, requestSolanaDevnetAirdrop } from "@/app/wallets/solana-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  explicitUserConfirmation: z.literal(true),
  solAmount: z.number().min(0.1).max(2).optional().default(1),
}).strict();

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

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid_origin" }, { status: 403 });
  }

  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    const input = requestSchema.parse(await request.json().catch(() => ({ explicitUserConfirmation: true })));

    const wallets = await listPersistedUserWallets(claims.user_id);
    const wallet = wallets.find(
      (candidate) =>
        candidate.chainType === "solana" &&
        candidate.network === "solana:devnet" &&
        candidate.status === "active",
    );

    if (!wallet) {
      return NextResponse.json(
        { error: "solana_not_activated", next: "activate_solana_devnet" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const airdrop = await requestSolanaDevnetAirdrop(wallet.address, input.solAmount);
    const balance = await getSolanaDevnetBalance(wallet.address).catch(() => null);

    return NextResponse.json(
      {
        success: true,
        network: "solana:devnet",
        walletAddress: wallet.address,
        signature: airdrop.signature,
        fundedAmount: airdrop.formatted,
        balance: balance ? balance.formatted : "Updating...",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "solana_fund_failed";
    return NextResponse.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
