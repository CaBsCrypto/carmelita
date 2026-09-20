import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { getAvalancheX402LiveConfig } from "@/app/x402-avalanche/config";
import { discoverAvalancheX402 } from "@/app/x402-avalanche/discovery";
import { freezeAvalancheX402Payment, buildTransferWithAuthorizationTypedData } from "@/app/x402-avalanche/payment";
import { buildAvalancheX402Requirement, createAvalanchePaymentRequired } from "@/app/x402-avalanche/protocol";
import { avalancheReportBodyHash, avalancheReportUrl } from "@/app/x402-avalanche/resource";
import { findAvalancheX402Payment, prepareAvalancheX402Payment } from "@/app/x402-avalanche/store";
import { hasDatabase } from "@/db";
import { listPersistedUserWallets } from "@/app/multichain-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), requestId: z.string().trim().min(8).max(100) }),
  z.object({ action: z.literal("status"), paymentId: z.string().trim().min(20).max(160) }),
]);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function auth(request: Request) {
  if (!sameOrigin(request)) throw new Error("invalid_origin");
  const claims = await verifyPrivyAccessToken(bearerToken(request));
  return claims.user_id;
}

async function avalancheWallet(userId: string) {
  if (!hasDatabase()) throw new Error("database_not_configured");
  const wallet = (await listPersistedUserWallets(userId)).find((candidate) =>
    candidate.userId === userId && candidate.chainType === "ethereum"
    && candidate.network === "avalanche:fuji" && candidate.status === "active",
  );
  if (!wallet) throw new Error("avalanche_wallet_not_ready");
  return { id: wallet.id, address: wallet.address };
}

function publicPayment(row: Awaited<ReturnType<typeof findAvalancheX402Payment>>) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    resourceUrl: row.resource_url,
    network: row.network,
    asset: "USDC",
    assetContract: row.asset_contract,
    payTo: row.pay_to,
    amountAtomic: row.amount_atomic,
    amountDisplay: "0.01",
    status: row.status,
    transactionHash: row.transaction_hash,
    error: row.error,
    expiresAt: row.expires_at,
    typedData: buildTransferWithAuthorizationTypedData(row.frozen_payment),
  };
}

export async function POST(request: Request) {
  try {
    const userId = await auth(request);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new Error("avalanche_x402_invalid_request");

    if (parsed.data.action === "status") {
      const row = await findAvalancheX402Payment(userId, parsed.data.paymentId);
      return NextResponse.json({ payment: publicPayment(row) }, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const config = getAvalancheX402LiveConfig();
    if (!config.enabled || !config.payTo) {
      return NextResponse.json({ error: config.reason }, { status: 503 });
    }
    const facilitator = await discoverAvalancheX402();
    if (!facilitator.ready || !facilitator.evidence) {
      return NextResponse.json({
        error: "avalanche_x402_facilitator_not_ready",
        blockers: facilitator.blockers,
      }, { status: 503 });
    }
    const wallet = await avalancheWallet(userId);
    const resourceUrl = avalancheReportUrl(new URL(request.url).origin);
    const requirement = buildAvalancheX402Requirement(config.payTo);
    const nonce = `0x${createHash("sha256").update(
      `carmelita:avalanche-x402:${userId}:${parsed.data.requestId}`,
    ).digest("hex")}` as `0x${string}`;
    const payment = freezeAvalancheX402Payment({
      requirement,
      resourceUrl,
      method: "POST",
      bodyHash: avalancheReportBodyHash(),
      payer: wallet.address,
      nonce,
      nowSeconds: Math.floor(Date.now() / 1_000),
    });
    const idempotencyKey = createHash("sha256").update(
      `avalanche-x402:${userId}:${parsed.data.requestId}`,
    ).digest("hex");
    const prepared = await prepareAvalancheX402Payment({
      userId,
      idempotencyKey,
      walletId: wallet.id,
      payment,
      requirement,
    });
    const challenge = createAvalanchePaymentRequired({
      resourceUrl,
      payTo: config.payTo,
    });
    return NextResponse.json({
      replayed: prepared.replayed,
      facilitator: facilitator.evidence,
      requiresExplicitApproval: true,
      payment: publicPayment(prepared.row),
      paymentRequired: challenge.paymentRequired,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "avalanche_x402_prepare_failed";
    const status = message.includes("not_ready") || message.includes("idempotency_conflict")
      ? 409
      : message.includes("database_not_configured") ? 503
        : message.includes("token") || message.includes("origin") ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
