import type { SettleResponse, VerifyResponse } from "@x402/core/types";
import { AvalancheX402FacilitatorHttpError, type AvalancheX402Facilitator } from "./facilitator";
import {
  createAvalancheMerchantChallenge,
  encodeAvalancheMerchantSettlement,
  type AvalancheMerchantResource,
  validateAvalancheMerchantPayment,
} from "./merchant-protocol";
import type {
  AvalancheMerchantPaymentStore,
  MerchantPaymentRecord,
} from "./merchant-store";
import type { AvalancheSettlementEvidence } from "./evidence";

export type AvalancheMerchantSettlementEvidence = AvalancheSettlementEvidence;

export interface AvalancheMerchantReceiptVerifier {
  verify(input: {
    settlement: SettleResponse;
    record: MerchantPaymentRecord;
  }): Promise<AvalancheMerchantSettlementEvidence>;
}

export type AvalancheMerchantPaymentResult =
  | {
      kind: "payment_required";
      status: 402;
      paymentRequired: string;
    }
  | {
      kind: "paid";
      status: 200;
      record: MerchantPaymentRecord;
      paymentResponse: string;
      evidence: AvalancheMerchantSettlementEvidence | null;
      replayed: boolean;
    }
  | {
      kind: "in_progress";
      status: 409;
      record: MerchantPaymentRecord;
    }
  | {
      kind: "reconciliation_required";
      status: 503;
      record: MerchantPaymentRecord;
    }
  | {
      kind: "payment_failed";
      status: 402;
      record: MerchantPaymentRecord;
    };

type ProcessInput = {
  paymentSignature?: string | null;
  resource: AvalancheMerchantResource;
  bodyHash: string;
  nowSeconds: number;
  store: AvalancheMerchantPaymentStore;
  facilitator: AvalancheX402Facilitator;
  receiptVerifier: AvalancheMerchantReceiptVerifier;
};

function paymentKey(record: MerchantPaymentRecord) {
  return {
    merchantId: record.merchantId,
    resourceId: record.resourceId,
    paymentIdentifier: record.paymentIdentifier,
  };
}

function validVerifyResponse(response: VerifyResponse, payer: string) {
  return response.isValid === true &&
    (typeof response.payer !== "string" || response.payer.toLowerCase() === payer);
}

function safeReason(error: unknown) {
  if (error instanceof AvalancheX402FacilitatorHttpError) {
    return error.reason ? `${error.message}:${error.reason}` : error.message;
  }
  if (error instanceof Error && /^[a-z0-9_.:-]{1,160}$/i.test(error.message)) {
    return error.message;
  }
  return "merchant_x402_upstream_error";
}

function isDefinitiveSettlementFailure(error: unknown) {
  return error instanceof AvalancheX402FacilitatorHttpError &&
    error.status >= 400 && error.status < 500;
}

function evidenceFromRecord(record: MerchantPaymentRecord): AvalancheMerchantSettlementEvidence | null {
  if (!record.settlement?.success || !record.transactionHash) return null;
  return {
    transactionHash: record.transactionHash,
    network: "eip155:43113",
    payer: record.authorization.from,
    payTo: record.authorization.to,
    asset: record.requirement.asset,
    amountAtomic: record.authorization.value,
  };
}

export async function processAvalancheMerchantPayment(
  input: ProcessInput,
): Promise<AvalancheMerchantPaymentResult> {
  if (!input.paymentSignature) {
    return {
      kind: "payment_required",
      status: 402,
      paymentRequired: createAvalancheMerchantChallenge(
        input.resource,
        input.bodyHash,
      ).header,
    };
  }

  const validated = await validateAvalancheMerchantPayment({
    header: input.paymentSignature,
    resource: input.resource,
    bodyHash: input.bodyHash,
    nowSeconds: input.nowSeconds,
  });

  const claim = await input.store.claim({
    resource: input.resource,
    paymentIdentifier: validated.paymentIdentifier,
    fingerprint: validated.fingerprint,
    signatureHash: validated.signatureHash,
    authorization: validated.authorization,
    requirement: validated.requirement,
    payload: validated.payload,
  });
  let record = claim.record;

  if (record.status === "delivered" || record.status === "settled") {
    return {
      kind: "paid",
      status: 200,
      record,
      paymentResponse: encodeAvalancheMerchantSettlement(record.settlement!),
      evidence: evidenceFromRecord(record),
      replayed: true,
    };
  }
  if (record.status === "settling") {
    return { kind: "in_progress", status: 409, record };
  }
  if (record.status === "reconciliation_required") {
    return { kind: "reconciliation_required", status: 503, record };
  }
  if (record.status === "failed") {
    return { kind: "payment_failed", status: 402, record };
  }

  let verification: VerifyResponse;
  try {
    verification = await input.facilitator.verify(record.payload, record.requirement);
  } catch (error) {
    record = await input.store.fail({
      ...paymentKey(record),
      status: "failed",
      error: safeReason(error),
    });
    return { kind: "payment_failed", status: 402, record };
  }
  if (!validVerifyResponse(verification, record.authorization.from)) {
    record = await input.store.fail({
      ...paymentKey(record),
      status: "failed",
      error: "merchant_x402_verification_rejected",
    });
    return { kind: "payment_failed", status: 402, record };
  }

  try {
    record = await input.store.beginSettlement(paymentKey(record));
    if (record.status === "settled" || record.status === "delivered") {
      return {
        kind: "paid",
        status: 200,
        record,
        paymentResponse: encodeAvalancheMerchantSettlement(record.settlement!),
        evidence: evidenceFromRecord(record),
        replayed: true,
      };
    }
  } catch (error) {
    if (error instanceof Error && error.message === "merchant_x402_settlement_in_progress") {
      return { kind: "in_progress", status: 409, record };
    }
    throw error;
  }

  let settlement: SettleResponse;
  try {
    settlement = await input.facilitator.settle(record.payload, record.requirement);
  } catch (error) {
    const status = isDefinitiveSettlementFailure(error)
      ? "failed"
      : "reconciliation_required";
    record = await input.store.fail({
      ...paymentKey(record),
      status,
      error: safeReason(error),
    });
    return status === "failed"
      ? { kind: "payment_failed", status: 402, record }
      : { kind: "reconciliation_required", status: 503, record };
  }

  if (!settlement.success || !settlement.transaction) {
    record = await input.store.fail({
      ...paymentKey(record),
      status: "reconciliation_required",
      error: "merchant_x402_settlement_evidence_missing",
    });
    return { kind: "reconciliation_required", status: 503, record };
  }

  let evidence: AvalancheMerchantSettlementEvidence;
  try {
    evidence = await input.receiptVerifier.verify({ settlement, record });
  } catch (error) {
    record = await input.store.fail({
      ...paymentKey(record),
      status: "reconciliation_required",
      error: safeReason(error),
    });
    return { kind: "reconciliation_required", status: 503, record };
  }

  if (
    evidence.transactionHash.toLowerCase() !== settlement.transaction.toLowerCase() ||
    evidence.payer.toLowerCase() !== record.authorization.from ||
    evidence.payTo.toLowerCase() !== record.authorization.to ||
    evidence.asset.toLowerCase() !== record.requirement.asset.toLowerCase() ||
    evidence.amountAtomic !== record.authorization.value
  ) {
    record = await input.store.fail({
      ...paymentKey(record),
      status: "reconciliation_required",
      error: "merchant_x402_settlement_evidence_mismatch",
    });
    return { kind: "reconciliation_required", status: 503, record };
  }

  record = await input.store.settle({
    ...paymentKey(record),
    settlement,
  });
  return {
    kind: "paid",
    status: 200,
    record,
    paymentResponse: encodeAvalancheMerchantSettlement(settlement),
    evidence,
    replayed: false,
  };
}

function canonicalDeliveryHash(value: unknown) {
  const json = JSON.stringify(value, (_, candidate) => {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return Object.fromEntries(
        Object.entries(candidate as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right)),
      );
    }
    return candidate;
  });
  return globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  ).then((digest) => Buffer.from(digest).toString("hex"));
}

export async function deliverAvalancheMerchantResource(input: {
  store: AvalancheMerchantPaymentStore;
  record: MerchantPaymentRecord;
  body: unknown;
}) {
  const bodyHash = await canonicalDeliveryHash(input.body);
  return input.store.deliver({
    ...paymentKey(input.record),
    body: input.body,
    bodyHash,
  });
}