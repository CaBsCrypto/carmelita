import { NextResponse } from "next/server";
import { z } from "zod";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import {
  buildSolanaTransferTransaction,
  sendSolanaRawTransaction,
} from "@/app/wallets/solana-transfer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("plan"),
    toAddress: z.string().min(32).max(44),
    solAmount: z.number().positive(),
  }),
  z.object({
    action: z.literal("execute"),
    signedTransactionBase64: z.string().min(10),
  }),
]);

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
    const input = requestSchema.parse(await request.json());

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
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (input.action === "plan") {
      const plan = await buildSolanaTransferTransaction({
        fromAddress: solanaWallet.address,
        toAddress: input.toAddress,
        solAmount: input.solAmount,
      });
      return NextResponse.json({ success: true, plan }, { headers: { "Cache-Control": "no-store" } });
    }

    const receipt = await sendSolanaRawTransaction({
      signedTransactionBase64: input.signedTransactionBase64,
    });
    return NextResponse.json({ success: true, receipt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "solana_transfer_failed";
    return NextResponse.json(
      { error: message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
