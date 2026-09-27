import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "@/db";
import type { StellarX402ExecutionEvidence } from "./reconciliation";

export type X402StoreStatement = { text: string; parameters: unknown[] };
export type X402StoreDependencies = { query(statement: X402StoreStatement): Promise<unknown[]> };
type PaymentOwner = { paymentId: string; userId: string };
export type X402DeliveryResult = {
  settlement: unknown;
  resourceBody: string;
  resourcePreview: string;
  resourceSha256: string;
  resourceStatus: number;
  resourceContentType: string;
};
export type X402ReconciliationOutcome = {
  status: "verified" | "pending";
  transactionHash?: string;
  verification?: Record<string, unknown>;
  cursor: string | null;
  reason?: string;
};
const defaults: X402StoreDependencies = {
  query: async ({ text, parameters }) => {
    const url = getDatabaseUrl();
    if (!url) throw new Error("database_not_configured");
    return neon(url).query(text, parameters);
  },
};
const statement = (text: string, parameters: unknown[]): X402StoreStatement => ({ text, parameters });
const executionStates = "status IN ('signing', 'reconciliation_required', 'confirmed')";
function receiptMatchesExecution(receipt: string, transactionHash: string) {
  const value = `COALESCE((${receipt}), '{}'::jsonb)`;
  // No header is permitted with independent chain proof. A supplied header must
  // agree in every claimed field; a matching hash cannot override failure.
  return `(jsonb_typeof(${value}) = 'object' AND (
    (${value} - 'resourceEvidence') = '{}'::jsonb OR (
      ${value}->'success' = 'true'::jsonb
      AND ${value}->>'network' = execution->>'network'
      AND (NOT (${value} ? 'payer') OR ${value}->>'payer' = execution->>'walletAddress')
      AND lower(${value}->>'transaction') = lower(${transactionHash}))))`;
}
const bodyMatchesHash = `resource_body IS NOT NULL AND delivery_state = 'received'
  AND length(resource_body) > 0
  AND settlement->'resourceEvidence'->>'sha256' = encode(sha256(convert_to(resource_body, 'UTF8')), 'hex')
  AND (settlement->'resourceEvidence'->>'status')::integer BETWEEN 200 AND 299
  AND ${receiptMatchesExecution("settlement", "$3")}`;
const verifiedFields = ["network", "walletAddress", "assetContract", "payTo", "amountAtomic", "authorizationHash", "nonce", "maxLedger", "requestHash"];
const storedVerificationMatches = `verification->>'version' = 'stellar-x402-rpc-v1'
  AND lower(transaction_hash) = lower(verification->>'transactionHash')
  AND ${verifiedFields.map(field => `execution->>'${field}' = verification->>'${field}'`).join(" AND ")}`;
function owner(input: PaymentOwner) {
  if (!input.paymentId || !input.userId.startsWith("did:privy:")) throw new Error("x402_invalid_payment_owner");
  return [input.paymentId, input.userId];
}
function settlementRecord(value: unknown) {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("x402_invalid_settlement_record");
  const record = { ...value } as Record<string, unknown>;
  // The provider may claim settlement, but delivery evidence belongs to this server.
  delete record.resourceEvidence;
  if (typeof record.transaction === "string" && /^[\da-f]{64}$/i.test(record.transaction)) {
    record.transaction = record.transaction.toLowerCase();
  }
  return record;
}
function reasonCode(reason: string | undefined) {
  return reason && /^[a-zA-Z0-9_.:-]{1,160}$/.test(reason) ? reason : "x402_reconciliation_pending";
}

export function buildClaimX402Execution(input: PaymentOwner & { execution: StellarX402ExecutionEvidence }): X402StoreStatement {
  const keys = owner(input);
  const evidence = input.execution;
  if (!evidence.signedTransaction || !/^0x[\da-f]{64}$/i.test(evidence.authorizationHash)
    || !/^-?\d+$/.test(evidence.nonce) || BigInt(evidence.nonce) < -(BigInt(1) << BigInt(63)) || BigInt(evidence.nonce) >= (BigInt(1) << BigInt(63))
    || !/^[\da-f]{64}$/i.test(evidence.requestHash)
    || !Number.isSafeInteger(evidence.firstLedger) || !Number.isSafeInteger(evidence.maxLedger)
    || evidence.firstLedger < 1 || evidence.maxLedger < evidence.firstLedger
    || !Number.isFinite(Date.parse(evidence.claimedAt))) throw new Error("x402_invalid_execution_evidence");
  return statement(`UPDATE agent_x402_payments SET status = 'signing', execution = $3::jsonb,
    payment_state = 'pending', updated_at = now(), error = NULL
    WHERE id = $1 AND user_id = $2 AND status = 'prepared' AND payment_state = 'pending'
      AND execution IS NULL AND expires_at > now()
      AND wallet_address = $3::jsonb->>'walletAddress' AND network = $3::jsonb->>'network'
      AND asset_contract = $3::jsonb->>'assetContract' AND pay_to = $3::jsonb->>'payTo'
      AND amount_atomic::text = $3::jsonb->>'amountAtomic'
      AND payment_required->>'authorizationHash' = $3::jsonb->>'authorizationHash'
      AND payment_required->>'maxLedger' = $3::jsonb->>'maxLedger'
    RETURNING id`, [...keys, JSON.stringify(evidence)]);
}

export function buildSaveX402Settlement(input: PaymentOwner & { settlement: unknown }): X402StoreStatement {
  return statement(`UPDATE agent_x402_payments SET
    settlement = CASE WHEN payment_state = 'confirmed' THEN settlement ELSE $3::jsonb || COALESCE(settlement, '{}'::jsonb) END,
    updated_at = CASE WHEN payment_state = 'confirmed' THEN updated_at ELSE now() END
    WHERE id = $1 AND user_id = $2 AND execution IS NOT NULL
      AND ${executionStates} AND (payment_state <> 'confirmed' OR (
        ${storedVerificationMatches}
        AND ${receiptMatchesExecution("$3::jsonb", "transaction_hash")}))
    RETURNING id`, [...owner(input), JSON.stringify(settlementRecord(input.settlement))]);
}

export function buildSaveX402Delivery(input: PaymentOwner & { result: X402DeliveryResult }): X402StoreStatement {
  const { result } = input;
  if (typeof result.resourceBody !== "string" || result.resourceBody.length === 0 || typeof result.resourceContentType !== "string"
    || !Number.isInteger(result.resourceStatus) || result.resourceStatus < 200 || result.resourceStatus > 299
    || !/^[\da-f]{64}$/i.test(result.resourceSha256)
    || createHash("sha256").update(result.resourceBody).digest("hex") !== result.resourceSha256.toLowerCase()
    || result.resourcePreview !== result.resourceBody.slice(0, 4_000)) throw new Error("x402_delivery_integrity_mismatch");
  const settlement = { ...settlementRecord(result.settlement), resourceEvidence: {
    status: result.resourceStatus, contentType: result.resourceContentType,
    sha256: result.resourceSha256.toLowerCase(), deliveredAt: new Date().toISOString(),
  } };
  const effectiveSettlement = "CASE WHEN delivery_state = 'pending' THEN $3::jsonb || COALESCE(settlement, '{}'::jsonb) || jsonb_build_object('resourceEvidence', $3::jsonb->'resourceEvidence') ELSE settlement END";
  const completed = `payment_state = 'confirmed' AND ${storedVerificationMatches} AND ${receiptMatchesExecution(effectiveSettlement, "transaction_hash")}`;
  return statement(`UPDATE agent_x402_payments SET
    settlement = ${effectiveSettlement},
    resource_body = CASE WHEN delivery_state = 'pending' THEN $4 ELSE resource_body END,
    resource_preview = CASE WHEN delivery_state = 'pending' THEN $5 ELSE resource_preview END,
    delivery_state = 'received',
    status = CASE WHEN ${completed} THEN 'confirmed' ELSE 'reconciliation_required' END,
    confirmed_at = CASE WHEN ${completed} THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
    error = CASE WHEN ${completed} THEN NULL ELSE error END,
    updated_at = now()
    WHERE id = $1 AND user_id = $2 AND execution IS NOT NULL AND ${executionStates}
      AND (delivery_state = 'pending' OR (resource_body = $4 AND settlement->'resourceEvidence'->>'sha256' = $6))
    RETURNING id`, [...owner(input), JSON.stringify(settlement), result.resourceBody, result.resourcePreview, result.resourceSha256.toLowerCase()]);
}

export function buildSaveX402Reconciliation(input: PaymentOwner & { outcome: X402ReconciliationOutcome; expectedCursor?: string | null }): X402StoreStatement {
  const { outcome } = input;
  if (outcome.cursor !== null && (typeof outcome.cursor !== "string" || outcome.cursor.length > 512)) throw new Error("x402_invalid_reconciliation_cursor");
  if (input.expectedCursor !== undefined && input.expectedCursor !== null && (typeof input.expectedCursor !== "string" || input.expectedCursor.length > 512)) throw new Error("x402_invalid_reconciliation_cursor");
  if (outcome.status === "pending") return statement(`UPDATE agent_x402_payments SET
    payment_state = 'uncertain', status = 'reconciliation_required',
    reconciliation_cursor = CASE WHEN $5::boolean THEN CASE WHEN reconciliation_cursor IS NOT DISTINCT FROM $6 THEN COALESCE($3, reconciliation_cursor) ELSE reconciliation_cursor END ELSE COALESCE(reconciliation_cursor, $3) END,
    error = $4, updated_at = now()
    WHERE id = $1 AND user_id = $2 AND payment_state <> 'confirmed' AND ${executionStates}
    RETURNING id`, [...owner(input), outcome.cursor, reasonCode(outcome.reason), input.expectedCursor !== undefined, input.expectedCursor ?? null]);
  const verification = outcome.verification;
  const transactionHash = typeof outcome.transactionHash === "string" ? outcome.transactionHash.toLowerCase() : null;
  if (outcome.status !== "verified" || !verification || verification.version !== "stellar-x402-rpc-v1"
    || !transactionHash || !/^[\da-f]{64}$/.test(transactionHash)
    || typeof verification.transactionHash !== "string" || verification.transactionHash.toLowerCase() !== transactionHash
    || !Number.isSafeInteger(verification.ledger) || !Number.isFinite(Date.parse(String(verification.verifiedAt)))
    || verifiedFields.some(field => verification[field] === undefined || verification[field] === null)) throw new Error("x402_invalid_verification_evidence");
  return statement(`UPDATE agent_x402_payments SET
    payment_state = 'confirmed', transaction_hash = $3,
    verification = CASE WHEN payment_state = 'confirmed' THEN verification ELSE $4::jsonb END,
    reconciliation_cursor = CASE WHEN $6::boolean THEN CASE WHEN reconciliation_cursor IS NOT DISTINCT FROM $7 THEN COALESCE($5, reconciliation_cursor) ELSE reconciliation_cursor END ELSE COALESCE(reconciliation_cursor, $5) END,
    status = CASE WHEN ${bodyMatchesHash} THEN 'confirmed' ELSE 'reconciliation_required' END,
    confirmed_at = CASE WHEN ${bodyMatchesHash} THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END,
    error = CASE WHEN ${bodyMatchesHash} THEN NULL ELSE 'x402_delivery_pending' END, updated_at = now()
    WHERE id = $1 AND user_id = $2 AND execution IS NOT NULL AND ${executionStates}
      AND (transaction_hash IS NULL OR lower(transaction_hash) = $3)
      AND ${verifiedFields.map(field => `execution->>'${field}' = $4::jsonb->>'${field}'`).join("\n      AND ")}
    RETURNING id`, [...owner(input), transactionHash, JSON.stringify({ ...verification, transactionHash }), outcome.cursor, input.expectedCursor !== undefined, input.expectedCursor ?? null]);
}

export function buildMarkX402Uncertain(input: PaymentOwner & { reason: string }): X402StoreStatement {
  return statement(`UPDATE agent_x402_payments SET payment_state = 'uncertain', status = 'reconciliation_required',
    error = $3, updated_at = now()
    WHERE id = $1 AND user_id = $2 AND payment_state <> 'confirmed' AND ${executionStates}
    RETURNING id`, [...owner(input), reasonCode(input.reason)]);
}

async function apply(statement: X402StoreStatement, dependencies: X402StoreDependencies) {
  return (await dependencies.query(statement)).length === 1;
}
export const claimX402Execution = (input: Parameters<typeof buildClaimX402Execution>[0], dependencies = defaults) => apply(buildClaimX402Execution(input), dependencies);
export const saveX402Settlement = (input: Parameters<typeof buildSaveX402Settlement>[0], dependencies = defaults) => apply(buildSaveX402Settlement(input), dependencies);
export const saveX402Delivery = (input: Parameters<typeof buildSaveX402Delivery>[0], dependencies = defaults) => apply(buildSaveX402Delivery(input), dependencies);
export const saveX402Reconciliation = (input: Parameters<typeof buildSaveX402Reconciliation>[0], dependencies = defaults) => apply(buildSaveX402Reconciliation(input), dependencies);
export const markX402Uncertain = (input: Parameters<typeof buildMarkX402Uncertain>[0], dependencies = defaults) => apply(buildMarkX402Uncertain(input), dependencies);
