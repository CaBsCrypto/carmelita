import { decodePaymentSignatureHeader } from "@x402/core/http";
import { NextResponse } from "next/server";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { getAvalancheX402LiveConfig } from "@/app/x402-avalanche/config";
import { AvalancheX402FacilitatorHttpError, createAvalancheX402Facilitator } from "@/app/x402-avalanche/facilitator";
import {
  buildAvalancheX402Requirement,
  createAvalanchePaymentRequired,
  encodeAvalancheSettlementResponse,
  validateAvalanchePaymentSignature,
} from "@/app/x402-avalanche/protocol";
import { avalancheReportBodyHash, avalancheReportUrl } from "@/app/x402-avalanche/resource";
import { executeAvalancheX402Settlement } from "@/app/x402-avalanche/settlement";
import {
  createAvalancheMerchantReceiptVerifier,
  createFujiJsonRpcReceiptReader,
} from "@/app/x402-avalanche/merchant-receipt";
import {
  bindAvalancheX402Signature,
  deliverAvalancheX402Report,
  findAvalancheX402Payment,
  markAvalancheX402Terminal,
} from "@/app/x402-avalanche/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function paymentIdFromHeader(header: string) {
  const payload = decodePaymentSignatureHeader(header);
  const extension = payload.extensions?.carmelita as { paymentId?: unknown } | undefined;
  if (typeof extension?.paymentId !== "string") {
    throw new Error("avalanche_x402_payment_id_missing");
  }
  return extension.paymentId;
}

function challenge(resourceUrl: string, payTo: string) {
  const required = createAvalanchePaymentRequired({ resourceUrl, payTo });
  return NextResponse.json(required.paymentRequired, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": required.header,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let paymentId: string | null = null;
  try {
    const claims = await verifyPrivyAccessToken(bearerToken(request));
    userId = claims.user_id;
    const config = getAvalancheX402LiveConfig();
    if (!config.enabled || !config.payTo) {
      return NextResponse.json({ error: config.reason }, { status: 503 });
    }
    const resourceUrl = avalancheReportUrl(new URL(request.url).origin);
    const signatureHeader = request.headers.get("payment-signature");
    if (!signatureHeader) return challenge(resourceUrl, config.payTo);

    paymentId = paymentIdFromHeader(signatureHeader);
    let payment = await findAvalancheX402Payment(userId, paymentId);
    const requirement = buildAvalancheX402Requirement(config.payTo);
    await validateAvalanchePaymentSignature({
      header: signatureHeader,
      payment: payment.frozen_payment,
      requirement,
      method: "POST",
      resourceUrl,
      bodyHash: avalancheReportBodyHash(),
      nowSeconds: Math.floor(Date.now() / 1_000),
    });
    payment = (await bindAvalancheX402Signature({
      userId,
      paymentId,
      signatureHeader,
    })).row;

    if (payment.status !== "settled" && payment.status !== "delivered") {
      const facilitator = createAvalancheX402Facilitator();
      const payload = decodePaymentSignatureHeader(signatureHeader);
      const outcome = await executeAvalancheX402Settlement(
        { userId, paymentId, payload, requirement },
        {
          facilitator,
          receiptVerifier: createAvalancheMerchantReceiptVerifier(
            createFujiJsonRpcReceiptReader(),
          ),
        },
      );
      if (outcome.kind === "verification_failed") return challenge(resourceUrl, config.payTo);
      payment = outcome.payment;
    }

    const delivery = await deliverAvalancheX402Report(userId, paymentId);
    if (!payment.settlement) {
      payment = await findAvalancheX402Payment(userId, paymentId);
    }
    if (!payment.settlement) throw new Error("avalanche_x402_settlement_evidence_missing");
    return NextResponse.json(delivery.body, {
      headers: {
        "PAYMENT-RESPONSE": encodeAvalancheSettlementResponse(payment.settlement),
        "X-Carmelita-Delivery-Id": delivery.id,
        "X-Carmelita-Body-SHA256": delivery.body_hash,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof AvalancheX402FacilitatorHttpError && error.reason
      ? `${error.message}:${error.reason}`
      : error instanceof Error ? error.message : "avalanche_x402_resource_failed";
    if (userId && paymentId && message.includes("ambiguous")) {
      await markAvalancheX402Terminal({
        userId,
        paymentId,
        status: "reconciliation_required",
        error: message,
      }).catch(() => undefined);
    }
    const status = message.includes("settlement_in_progress") ? 409
      : message.includes("reconciliation_required") ? 409
        : message.includes("token") ? 401
          : message.includes("not_found") ? 404
            : message.includes("ambiguous") ? 503 : 400;
    return NextResponse.json({ error: message }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
