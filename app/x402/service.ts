import type { agentX402Payments } from "@/db/schema";
import { createSignedX402Payload, isPreparedX402Authorization } from "./client-authorization";
import { payPreparedX402Resource } from "./protocol";
import { atomicToDisplay } from "./assets";
import { x402RequestHash } from "./request";
import { captureX402Execution, reconcileX402Payment, validateX402Settlement,
  type StellarX402ExecutionEvidence } from "./reconciliation";
import { claimX402Execution, saveX402Delivery, saveX402Reconciliation,
  markX402Uncertain, saveX402Settlement } from "./store";

export type X402PaymentRow = typeof agentX402Payments.$inferSelect;
export function safeX402Error(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return /^(?:x402|stellar_client_signature)_[a-z0-9_]+$/.test(message) ? message : "x402_request_failed";
}

export function verifiedX402Payment(payment: X402PaymentRow) {
  return payment.status === "confirmed" && payment.paymentState === "confirmed" &&
    payment.deliveryState === "received" && Boolean(payment.verification) && Boolean(payment.transactionHash);
}

export function assertFrozenPayment(payment: X402PaymentRow) {
  if (!isPreparedX402Authorization(payment.paymentRequired) || !payment.paymentRequired.request) {
    throw new Error("x402_payment_requires_fresh_review");
  }
  const prepared = payment.paymentRequired;
  const request = prepared.request!;
  const hash = x402RequestHash(request);
  if (request.url !== payment.resourceUrl || request.network !== payment.network ||
    request.asset !== payment.assetContract || request.amount !== payment.amountAtomic ||
    request.payTo !== payment.payTo || atomicToDisplay(payment.amountAtomic) !== payment.amountDisplay || request.version !== prepared.x402Version ||
    prepared.requirement.network !== request.network || prepared.requirement.asset !== request.asset ||
    prepared.requirement.amount !== request.amount || prepared.requirement.payTo !== request.payTo ||
    prepared.requirement.scheme !== request.scheme || prepared.requirement.sponsored !== request.sponsored ||
    prepared.requirement.maxTimeoutSeconds !== request.maxTimeoutSeconds) throw new Error("x402_request_changed");
  return { prepared, request, hash };
}

type Dependencies = {
  findPayment: (userId: string, paymentId: string) => Promise<X402PaymentRow>;
  preflight: (payment: X402PaymentRow) => Promise<void>;
  sign?: typeof createSignedX402Payload;
  capture?: typeof captureX402Execution;
  claim?: typeof claimX402Execution;
  settlement?: typeof saveX402Settlement;
  delivery?: typeof saveX402Delivery;
  recordReconciliation?: typeof saveX402Reconciliation;
  uncertain?: typeof markX402Uncertain;
  pay?: typeof payPreparedX402Resource;
  recover?: typeof reconcileX402Payment;
  now?: () => number;
};

/** Persisted execution is single-use; every recovery path has only RPC read dependencies. */
export function createX402ExecutionService(deps: Dependencies) {
  const recover = deps.recover ?? reconcileX402Payment;
  const record = deps.recordReconciliation ?? saveX402Reconciliation;
  const uncertain = deps.uncertain ?? markX402Uncertain;
  async function reconcile(userId: string, paymentId: string) {
    const payment = await deps.findPayment(userId, paymentId);
    if (verifiedX402Payment(payment)) return { replayed: true, payment };
    if (!payment.execution) return { replayed: false, payment };
    const execution = payment.execution as unknown as StellarX402ExecutionEvidence;
    const frozen = assertFrozenPayment(payment);
    if (execution.requestHash !== frozen.hash || execution.walletAddress !== payment.walletAddress) {
      throw new Error("x402_request_changed");
    }
    let transactionHash: string | null = null;
    try { transactionHash = validateX402Settlement(payment.settlement, execution); }
    catch { /* Only independently matched chain evidence can resolve an invalid receipt. */ }
    try {
      const outcome = await recover({ execution, transactionHash, cursor: payment.reconciliationCursor });
      await record({ paymentId, userId, outcome, expectedCursor: payment.reconciliationCursor });
    } catch (error) {
      await uncertain({ paymentId, userId, reason: safeX402Error(error) });
    }
    return { replayed: false, payment: await deps.findPayment(userId, paymentId) };
  }

  async function execute(userId: string, paymentId: string, signature?: string) {
    let payment = await deps.findPayment(userId, paymentId);
    if (verifiedX402Payment(payment)) return { replayed: true, payment };
    if (payment.status !== "prepared" || payment.execution) throw new Error("x402_payment_reconciliation_required");
    if (payment.expiresAt.getTime() <= (deps.now ?? Date.now)()) throw new Error("x402_approval_expired");
    const frozen = assertFrozenPayment(payment);
    if (!signature) throw new Error("x402_authorization_signature_required");
    await deps.preflight(payment);
    const signed = await (deps.sign ?? createSignedX402Payload)({ prepared: frozen.prepared, address: payment.walletAddress, signature });
    const execution = await (deps.capture ?? captureX402Execution)({
      prepared: frozen.prepared, signedTransaction: signed.transaction, requestHash: frozen.hash, address: payment.walletAddress,
    });
    if (payment.expiresAt.getTime() <= (deps.now ?? Date.now)()) throw new Error("x402_approval_expired");
    const claimed = await (deps.claim ?? claimX402Execution)({ paymentId, userId, execution });
    if (!claimed) {
      payment = await deps.findPayment(userId, paymentId);
      if (verifiedX402Payment(payment)) return { replayed: true, payment };
      throw new Error("x402_payment_concurrent_execution");
    }
    try {
      const result = await (deps.pay ?? payPreparedX402Resource)({
        resourceUrl: payment.resourceUrl, request: frozen.request, frozen: signed.requirement,
        x402Version: signed.x402Version, transaction: signed.transaction,
        onSettlement: async (settlement) => {
          if (!await (deps.settlement ?? saveX402Settlement)({ paymentId, userId, settlement })) {
            throw new Error("x402_receipt_persistence_failed");
          }
        },
      });
      if (!await (deps.delivery ?? saveX402Delivery)({ paymentId, userId, result })) {
        throw new Error("x402_delivery_persistence_failed");
      }
      if (result.settlement) validateX402Settlement(result.settlement, execution);
      return await reconcile(userId, paymentId);
    } catch (error) {
      await uncertain({ paymentId, userId, reason: safeX402Error(error) });
      throw new Error(safeX402Error(error));
    }
  }
  return { execute, reconcile };
}
