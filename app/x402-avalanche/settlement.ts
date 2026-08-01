import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { BYTES32 } from "./config";
import type { AvalancheX402Facilitator } from "./facilitator";
import type { AvalancheMerchantReceiptVerifier } from "./merchant";
import type { MerchantPaymentRecord } from "./merchant-store";
import {
  type AvalancheX402Row,
  type SqlClient,
  claimAvalancheX402Settlement,
  markAvalancheX402Terminal,
  recordAvalancheX402Settlement,
} from "./store";

export type AvalancheX402SettlementOutcome =
  | { kind: "verification_failed"; payment: AvalancheX402Row }
  | { kind: "settled"; payment: AvalancheX402Row };

/**
 * Only an explicit facilitator rejection is a definitive "not settled" answer.
 * Everything else (5xx, network failure, timeout/abort, malformed payload, or
 * a record conflict after settle) is ambiguous: the transfer may already be
 * broadcast, so the payment is quarantined for reconciliation instead of being
 * failed or left wedged in `settling`. When in doubt, quarantine.
 */
const DEFINITIVE_FACILITATOR_REJECTIONS = new Set([400, 402, 422]);

function isDefinitiveFacilitatorRejection(message: string) {
  const match = /^avalanche_x402_facilitator_http_(\d{3})(?::[a-zA-Z0-9_.:-]+)?$/.exec(message);
  return match !== null && DEFINITIVE_FACILITATOR_REJECTIONS.has(Number(match[1]));
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function quarantine(
  input: { userId: string; paymentId: string; cause: string },
  sql: SqlClient | undefined,
): Promise<Error> {
  const message = `avalanche_x402_settle_ambiguous:${input.cause}`;
  await markAvalancheX402Terminal({
    userId: input.userId,
    paymentId: input.paymentId,
    status: "reconciliation_required",
    error: message,
  }, sql);
  return new Error(message);
}

/**
 * A `success: true` settle payload must bind to the persisted payment before it
 * is recorded: the transaction must be a usable Fuji hash, and any network or
 * payer the facilitator reported must match the frozen payment. A mismatch or
 * an unparseable payload is ambiguous, never a silent success.
 */
function settlementBindingProblem(
  settlement: SettleResponse,
  payment: AvalancheX402Row,
): string | null {
  if (
    typeof settlement.transaction !== "string" ||
    !BYTES32.test(settlement.transaction)
  ) return "settlement_payload_malformed";
  if (
    typeof settlement.network === "string" &&
    settlement.network !== payment.network
  ) return "settlement_network_mismatch";
  if (
    typeof settlement.payer === "string" &&
    settlement.payer.toLowerCase() !== payment.wallet_address.toLowerCase()
  ) return "settlement_payer_mismatch";
  return null;
}

function merchantReceiptRecord(
  payment: AvalancheX402Row,
  payload: PaymentPayload,
): MerchantPaymentRecord {
  const frozen = payment.frozen_payment;
  return {
    merchantId: "carmelita-agent",
    resourceId: payment.resource_url,
    paymentIdentifier: payment.id,
    fingerprint: payment.request_body_hash,
    signatureHash: payment.signature_hash ?? "",
    authorization: {
      from: frozen.payer,
      to: frozen.payTo,
      value: frozen.amount,
      validAfter: frozen.validAfter,
      validBefore: frozen.validBefore,
      nonce: frozen.nonce,
    },
    requirement: payment.requirement,
    payload,
    status: "settling",
    settlement: null,
    transactionHash: null,
    delivery: null,
    error: null,
  };
}

export async function executeAvalancheX402Settlement(
  input: {
    userId: string;
    paymentId: string;
    payload: PaymentPayload;
    requirement: PaymentRequirements;
  },
  deps: {
    facilitator: AvalancheX402Facilitator;
    receiptVerifier: AvalancheMerchantReceiptVerifier;
    sql?: SqlClient;
  },
): Promise<AvalancheX402SettlementOutcome> {
  const { userId, paymentId } = input;
  const verification = await deps.facilitator.verify(input.payload, input.requirement);
  if (!verification.isValid) {
    const payment = await markAvalancheX402Terminal({
      userId,
      paymentId,
      status: "failed",
      error: verification.invalidReason ?? "avalanche_x402_verification_failed",
    }, deps.sql);
    return { kind: "verification_failed", payment };
  }

  let payment = await claimAvalancheX402Settlement(userId, paymentId, deps.sql);
  if (payment.status !== "settling") return { kind: "settled", payment };

  let settlement: SettleResponse;
  try {
    settlement = await deps.facilitator.settle(input.payload, input.requirement);
  } catch (error) {
    const message = errorMessage(error, "avalanche_x402_settle_ambiguous");
    if (isDefinitiveFacilitatorRejection(message)) {
      await markAvalancheX402Terminal({
        userId,
        paymentId,
        status: "failed",
        error: message,
      }, deps.sql);
      throw new Error(message);
    }
    throw await quarantine({ userId, paymentId, cause: message }, deps.sql);
  }

  if (settlement.success === false) {
    const reason = settlement.errorReason ?? "avalanche_x402_settlement_failed";
    await markAvalancheX402Terminal({
      userId,
      paymentId,
      status: reason.toLowerCase().includes("revert") ? "reverted" : "failed",
      error: reason,
    }, deps.sql);
    throw new Error(reason);
  }
  if (settlement.success !== true) {
    throw await quarantine({ userId, paymentId, cause: "settlement_payload_malformed" }, deps.sql);
  }

  const problem = settlementBindingProblem(settlement, payment);
  if (problem !== null) throw await quarantine({ userId, paymentId, cause: problem }, deps.sql);

  let onchainEvidence;
  try {
    onchainEvidence = await deps.receiptVerifier.verify({
      settlement,
      record: merchantReceiptRecord(payment, input.payload),
    });
  } catch (error) {
    throw await quarantine({
      userId,
      paymentId,
      cause: errorMessage(error, "avalanche_x402_receipt_unverified"),
    }, deps.sql);
  }

  const verifiedSettlement: SettleResponse = {
    ...settlement,
    network: onchainEvidence.network,
    payer: onchainEvidence.payer,
  };
  try {
    payment = await recordAvalancheX402Settlement({
      userId,
      paymentId,
      settlement: verifiedSettlement,
      transactionHash: onchainEvidence.transactionHash,
      onchainEvidence,
    }, deps.sql);
  } catch (error) {
    throw await quarantine({
      userId,
      paymentId,
      cause: errorMessage(error, "avalanche_x402_settlement_state_conflict"),
    }, deps.sql);
  }
  return { kind: "settled", payment };
}
