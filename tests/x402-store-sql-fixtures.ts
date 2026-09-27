import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  buildClaimX402Execution, buildMarkX402Uncertain, buildSaveX402Delivery,
  buildSaveX402Reconciliation, buildSaveX402Settlement,
  type X402DeliveryResult, type X402ReconciliationOutcome, type X402StoreStatement,
} from "../app/x402/store";
import type { StellarX402ExecutionEvidence } from "../app/x402/reconciliation";

export const fixtureOwner = "did:privy:x402-sql-fixture-a";
export const fixtureOtherOwner = "did:privy:x402-sql-fixture-b";
export const fixtureExecution: StellarX402ExecutionEvidence = {
  signedTransaction: "fixture-not-a-submittable-transaction",
  authorizationHash: `0x${"a".repeat(64)}`, nonce: "42", maxLedger: 200, firstLedger: 100,
  network: "stellar:testnet-fixture", walletAddress: "fixture-public-address-a",
  assetContract: "fixture-usdc-contract", payTo: "fixture-recipient",
  amountAtomic: "10000", requestHash: "b".repeat(64), claimedAt: "2026-09-08T12:00:00Z",
};
const receiptHash = "c".repeat(64);
export function fixtureReceipt(transaction = receiptHash) {
  return { success: true, network: fixtureExecution.network, transaction };
}
export const fixtureOutcome: X402ReconciliationOutcome = {
  status: "verified", transactionHash: receiptHash, cursor: "150",
  verification: {
    version: "stellar-x402-rpc-v1", transactionHash: receiptHash, ledger: 150,
    network: fixtureExecution.network, walletAddress: fixtureExecution.walletAddress,
    assetContract: fixtureExecution.assetContract, payTo: fixtureExecution.payTo,
    amountAtomic: fixtureExecution.amountAtomic, authorizationHash: fixtureExecution.authorizationHash,
    nonce: fixtureExecution.nonce, maxLedger: fixtureExecution.maxLedger,
    requestHash: fixtureExecution.requestHash, verifiedAt: "2026-09-08T12:00:01Z", feeBump: true,
  },
};
export function fixtureDelivery(body = "Fixture result: café, \"quoted\" and a full durable response.\n"): X402DeliveryResult {
  return { settlement: fixtureReceipt(), resourceBody: body,
    resourcePreview: body.slice(0, 4_000), resourceSha256: createHash("sha256").update(body).digest("hex"),
    resourceStatus: 200, resourceContentType: "text/plain; charset=utf-8" };
}
const sql = (text: string, parameters: unknown[] = []): X402StoreStatement => ({ text, parameters });
export function expectX402Rows(input: X402StoreStatement, count: number): X402StoreStatement {
  return sql(`WITH changed AS (${input.text}) SELECT 1 / CASE WHEN count(*) = ${count} THEN 1 ELSE 0 END AS expected_changed_rows FROM changed`, input.parameters);
}
const target = (paymentId: string, userId = fixtureOwner) => ({ paymentId, userId });
const assertState = (id: string, condition: string, parameters: unknown[] = []) => sql(
  `SELECT 1 / CASE WHEN EXISTS (SELECT 1 FROM agent_x402_payments WHERE id = $1 AND (${condition})) THEN 1 ELSE 0 END AS recovery_state_verified`, [id, ...parameters],
);

export async function buildX402StoreSqlFixtures() {
  const migration = (await readFile(new URL("../drizzle/0021_x402_recovery.sql", import.meta.url), "utf8"))
    .split("--> statement-breakpoint").map(text => sql(text.trim())).filter(item => item.text);
  const setup = [
    sql("CREATE TABLE agent_users (id text PRIMARY KEY)"),
    sql(`CREATE TABLE agent_x402_payments (
      id text PRIMARY KEY, user_id text NOT NULL REFERENCES agent_users(id),
      wallet_id text NOT NULL, wallet_address text NOT NULL, resource_url text NOT NULL,
      network text NOT NULL, asset_contract text NOT NULL, pay_to text NOT NULL,
      amount_atomic numeric(30,0) NOT NULL, amount_display numeric(20,7) NOT NULL,
      status text NOT NULL DEFAULT 'prepared', idempotency_key text UNIQUE NOT NULL,
      payment_required jsonb NOT NULL, settlement jsonb, transaction_hash text UNIQUE,
      resource_preview text, expires_at timestamptz NOT NULL, error text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz
    )`),
    sql("INSERT INTO agent_users(id) VALUES ($1),($2)", [fixtureOwner, fixtureOtherOwner]),
    ...["concurrent", "delivery-first", "verified-first", "legacy", "expired", "corrupt-body", "receipt-mismatch", "hash-casing", "receipt-failure", "receipt-network", "receipt-payer", "receipt-absent", "receipt-absent-late"].map(id => sql(`INSERT INTO agent_x402_payments
      (id,user_id,wallet_id,wallet_address,resource_url,network,asset_contract,pay_to,amount_atomic,amount_display,idempotency_key,payment_required,expires_at)
      VALUES ($1,$2,'fixture-wallet',$3,'https://example.invalid/fixture',$4,$5,$6,$7,'0.001',$1,$8::jsonb,now() + interval '1 hour')`,
    [id, fixtureOwner, fixtureExecution.walletAddress, fixtureExecution.network, fixtureExecution.assetContract, fixtureExecution.payTo, fixtureExecution.amountAtomic,
      JSON.stringify({ authorizationHash: fixtureExecution.authorizationHash, maxLedger: fixtureExecution.maxLedger })])),
    sql("UPDATE agent_x402_payments SET status='confirmed',transaction_hash=$1,settlement=$2::jsonb,confirmed_at='2026-09-01T00:00:00Z' WHERE id='legacy'", ["d".repeat(64), JSON.stringify({ success: true, historical: true })]),
    sql("UPDATE agent_x402_payments SET expires_at=now()-interval '1 minute' WHERE id='expired'"),
    ...migration,
    sql(`SELECT 1 / CASE WHEN count(*)=2 AND bool_and(relnamespace=current_schema()::regnamespace)
      THEN 1 ELSE 0 END AS exclusive_tables FROM pg_class WHERE oid IN ('agent_users'::regclass,'agent_x402_payments'::regclass)`),
  ];
  const delivery = fixtureDelivery();
  const verifiedFor = (transactionHash: string): X402ReconciliationOutcome => ({
    ...fixtureOutcome, transactionHash, verification: { ...fixtureOutcome.verification, transactionHash },
  });
  const cases: { name: string; statements: X402StoreStatement[]; expectedErrorCode?: string }[] = [{
    name: "Historical claims remain unverified and migration is idempotent",
    statements: [...migration, assertState("legacy", "status='confirmed' AND payment_state='uncertain' AND delivery_state='pending' AND execution IS NULL AND resource_body IS NULL AND transaction_hash=$2 AND settlement->>'historical'='true' AND confirmed_at='2026-09-01T00:00:00Z'", ["d".repeat(64)])],
  }, {
    name: "Execution claim rejects another owner and an expired approval",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("delivery-first", fixtureOtherOwner), execution: fixtureExecution }), 0),
      expectX402Rows(buildClaimX402Execution({ ...target("expired"), execution: fixtureExecution }), 0),
      assertState("delivery-first", "status='prepared' AND execution IS NULL"),
    ],
  }, {
    name: "Signed execution and settlement survive delivery timeout without inferring payment",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("delivery-first"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("delivery-first"), settlement: { ...fixtureReceipt(), resourceEvidence: { sha256: "untrusted" } } }), 1),
      expectX402Rows(buildMarkX402Uncertain({ ...target("delivery-first"), reason: "x402_body_timeout" }), 1),
      assertState("delivery-first", "execution=$2::jsonb AND payment_state='uncertain' AND delivery_state='pending' AND transaction_hash IS NULL AND settlement->>'transaction'=$3 AND settlement->'resourceEvidence' IS NULL", [JSON.stringify(fixtureExecution), receiptHash]),
    ],
  }, {
    name: "Full delivery is durable before reconciliation and the original settlement is preserved",
    statements: [
      expectX402Rows(buildSaveX402Delivery({ ...target("delivery-first"), result: { ...delivery, settlement: fixtureReceipt("e".repeat(64)) } }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("delivery-first"), outcome: { status: "pending", cursor: "140", reason: "x402_scan_incomplete" } }), 1),
      assertState("delivery-first", "resource_body=$2 AND delivery_state='received' AND payment_state='uncertain' AND status='reconciliation_required' AND transaction_hash IS NULL AND settlement->>'transaction'=$3 AND settlement->'resourceEvidence'->>'sha256'=$4 AND reconciliation_cursor='140'", [delivery.resourceBody, receiptHash, delivery.resourceSha256]),
    ],
  }, {
    name: "Mismatched authorization proof cannot confirm a received delivery",
    statements: [expectX402Rows(buildSaveX402Reconciliation({ ...target("delivery-first"), outcome: { ...fixtureOutcome, verification: { ...fixtureOutcome.verification, nonce: "99" } } }), 0),
      assertState("delivery-first", "payment_state='uncertain' AND transaction_hash IS NULL")],
  }, {
    name: "Verified payment and intact delivered body complete exactly once",
    statements: [expectX402Rows(buildSaveX402Reconciliation({ ...target("delivery-first"), outcome: fixtureOutcome }), 1),
      assertState("delivery-first", "payment_state='confirmed' AND delivery_state='received' AND status='confirmed' AND transaction_hash=$2 AND confirmed_at IS NOT NULL AND error IS NULL", [receiptHash])],
  }, {
    name: "Late failures and conflicting delivery cannot downgrade or replace verified evidence",
    statements: [
      expectX402Rows(buildMarkX402Uncertain({ ...target("delivery-first"), reason: "x402_late_timeout" }), 0),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("delivery-first"), outcome: { status: "pending", cursor: "1" } }), 0),
      expectX402Rows(buildSaveX402Settlement({ ...target("delivery-first"), settlement: fixtureReceipt("f".repeat(64)) }), 0),
      expectX402Rows(buildSaveX402Delivery({ ...target("delivery-first"), result: fixtureDelivery("Conflicting response") }), 0),
      expectX402Rows(buildSaveX402Delivery({ ...target("delivery-first"), result: delivery }), 1),
      assertState("delivery-first", "status='confirmed' AND payment_state='confirmed' AND resource_body=$2 AND transaction_hash=$3 AND settlement->>'transaction'=$3", [delivery.resourceBody, receiptHash]),
    ],
  }, {
    name: "Verified payment without a body remains delivery-pending until its original result arrives",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("verified-first"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("verified-first"), outcome: { ...fixtureOutcome, transactionHash: "1".repeat(64), verification: { ...fixtureOutcome.verification, transactionHash: "1".repeat(64) } } }), 1),
      assertState("verified-first", "payment_state='confirmed' AND delivery_state='pending' AND status='reconciliation_required' AND confirmed_at IS NULL"),
      expectX402Rows(buildMarkX402Uncertain({ ...target("verified-first"), reason: "x402_late_timeout" }), 0),
      expectX402Rows(buildSaveX402Settlement({ ...target("verified-first"), settlement: fixtureReceipt("1".repeat(64)) }), 1),
      assertState("verified-first", "payment_state='confirmed' AND delivery_state='pending' AND verification IS NOT NULL AND settlement IS NULL AND transaction_hash=$2", ["1".repeat(64)]),
      expectX402Rows(buildSaveX402Delivery({ ...target("verified-first"), result: { ...delivery, settlement: { ...fixtureReceipt("1".repeat(64)), payer: fixtureExecution.walletAddress } } }), 1),
      assertState("verified-first", "payment_state='confirmed' AND delivery_state='received' AND status='confirmed' AND transaction_hash=$2", ["1".repeat(64)]),
    ],
  }, {
    name: "An altered persisted body cannot complete a separately verified payment",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("corrupt-body"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("corrupt-body"), result: { ...delivery, settlement: fixtureReceipt("2".repeat(64)) } }), 1),
      sql("UPDATE agent_x402_payments SET resource_body='altered fixture body' WHERE id='corrupt-body' AND user_id=$1", [fixtureOwner]),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("corrupt-body"), outcome: { ...fixtureOutcome, transactionHash: "2".repeat(64), verification: { ...fixtureOutcome.verification, transactionHash: "2".repeat(64) } } }), 1),
      assertState("corrupt-body", "payment_state='confirmed' AND status='reconciliation_required' AND confirmed_at IS NULL AND settlement->'resourceEvidence'->>'sha256'=$2", [delivery.resourceSha256]),
    ],
  }, {
    name: "A settlement receipt for a different transaction cannot close delivery acceptance",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("receipt-mismatch"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("receipt-mismatch"), result: delivery }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("receipt-mismatch"), outcome: { ...fixtureOutcome, transactionHash: "3".repeat(64), verification: { ...fixtureOutcome.verification, transactionHash: "3".repeat(64) } } }), 1),
      assertState("receipt-mismatch", "payment_state='confirmed' AND delivery_state='received' AND status='reconciliation_required' AND confirmed_at IS NULL AND transaction_hash=$2 AND settlement->>'transaction'=$3", ["3".repeat(64), receiptHash]),
    ],
  }, {
    name: "Uppercase receipt and lowercase chain hash reconcile to one canonical transaction",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("hash-casing"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("hash-casing"), settlement: fixtureReceipt("A1".repeat(32)) }), 1),
      assertState("hash-casing", "settlement->>'transaction'=$2 AND transaction_hash IS NULL AND payment_state='pending'", ["a1".repeat(32)]),
      expectX402Rows(buildSaveX402Delivery({ ...target("hash-casing"), result: { ...delivery, settlement: fixtureReceipt("A1".repeat(32)) } }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("hash-casing"), outcome: { ...fixtureOutcome, transactionHash: "a1".repeat(32), verification: { ...fixtureOutcome.verification, transactionHash: "A1".repeat(32) } } }), 1),
      assertState("hash-casing", "status='confirmed' AND payment_state='confirmed' AND delivery_state='received' AND transaction_hash=$2 AND verification->>'transactionHash'=$2 AND settlement->>'transaction'=$2 AND resource_body=$3", ["a1".repeat(32), delivery.resourceBody]),
      expectX402Rows(buildSaveX402Settlement({ ...target("hash-casing"), settlement: fixtureReceipt("A1".repeat(32)) }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("hash-casing"), outcome: { ...fixtureOutcome, transactionHash: "A1".repeat(32), verification: { ...fixtureOutcome.verification, transactionHash: "a1".repeat(32) } } }), 1),
      assertState("hash-casing", "status='confirmed' AND transaction_hash=$2 AND verification->>'transactionHash'=$2 AND settlement->>'transaction'=$2", ["a1".repeat(32)]),
    ],
  }, {
    name: "A failed settlement claim with the real hash cannot become a successful delivery",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("receipt-failure"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("receipt-failure"), settlement: { ...fixtureReceipt("4".repeat(64)), success: false } }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("receipt-failure"), result: { ...delivery, settlement: fixtureReceipt("4".repeat(64)) } }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("receipt-failure"), outcome: verifiedFor("4".repeat(64)) }), 1),
      assertState("receipt-failure", "payment_state='confirmed' AND delivery_state='received' AND status='reconciliation_required' AND confirmed_at IS NULL AND settlement->'success'='false'::jsonb AND transaction_hash=$2", ["4".repeat(64)]),
    ],
  }, {
    name: "A previously stored wrong-network receipt blocks completion when verification wins before the body",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("receipt-network"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("receipt-network"), settlement: { ...fixtureReceipt("5".repeat(64)), network: "stellar:wrong-network" } }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("receipt-network"), outcome: verifiedFor("5".repeat(64)) }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("receipt-network"), result: { ...delivery, settlement: fixtureReceipt("5".repeat(64)) } }), 1),
      assertState("receipt-network", "payment_state='confirmed' AND delivery_state='received' AND status='reconciliation_required' AND confirmed_at IS NULL AND settlement->>'network'='stellar:wrong-network' AND transaction_hash=$2", ["5".repeat(64)]),
    ],
  }, {
    name: "A supplied receipt payer must match the frozen wallet even when the transaction hash matches",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("receipt-payer"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("receipt-payer"), settlement: fixtureReceipt("6".repeat(64)) }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("receipt-payer"), result: { ...delivery, settlement: { ...fixtureReceipt("6".repeat(64)), payer: "fixture-other-wallet" } } }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("receipt-payer"), outcome: verifiedFor("6".repeat(64)) }), 1),
      assertState("receipt-payer", "payment_state='confirmed' AND delivery_state='received' AND status='reconciliation_required' AND confirmed_at IS NULL AND settlement->>'payer'='fixture-other-wallet'"),
    ],
  }, {
    name: "A body with no settlement header can be recovered using independent payment proof",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("receipt-absent"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("receipt-absent"), settlement: null }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("receipt-absent"), result: { ...delivery, settlement: null } }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("receipt-absent"), outcome: verifiedFor("7".repeat(64)) }), 1),
      assertState("receipt-absent", "payment_state='confirmed' AND delivery_state='received' AND status='confirmed' AND (settlement-'resourceEvidence')='{}'::jsonb AND transaction_hash=$2", ["7".repeat(64)]),
    ],
  }, {
    name: "A headerless late body can finish a previously verified payment without inventing a receipt",
    statements: [
      expectX402Rows(buildClaimX402Execution({ ...target("receipt-absent-late"), execution: fixtureExecution }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("receipt-absent-late"), outcome: verifiedFor("8".repeat(64)) }), 1),
      expectX402Rows(buildSaveX402Settlement({ ...target("receipt-absent-late"), settlement: null }), 1),
      expectX402Rows(buildSaveX402Delivery({ ...target("receipt-absent-late"), result: { ...delivery, settlement: null } }), 1),
      assertState("receipt-absent-late", "payment_state='confirmed' AND delivery_state='received' AND status='confirmed' AND (settlement-'resourceEvidence')='{}'::jsonb AND transaction_hash=$2", ["8".repeat(64)]),
    ],
  }, {
    name: "All persistence operations reject cross-owner mutation",
    statements: [
      expectX402Rows(buildSaveX402Settlement({ ...target("verified-first", fixtureOtherOwner), settlement: {} }), 0),
      expectX402Rows(buildSaveX402Delivery({ ...target("verified-first", fixtureOtherOwner), result: delivery }), 0),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("verified-first", fixtureOtherOwner), outcome: fixtureOutcome }), 0),
      expectX402Rows(buildMarkX402Uncertain({ ...target("verified-first", fixtureOtherOwner), reason: "x402_foreign_actor" }), 0),
    ],
  }, {
    name: "Stale pending reconciliation cannot move the cursor of a newer scan",
    statements: [
      expectX402Rows(buildSaveX402Reconciliation({ ...target("concurrent"), outcome: { status: "pending", cursor: "120" }, expectedCursor: null }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("concurrent"), outcome: { status: "pending", cursor: "130" }, expectedCursor: "120" }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("concurrent"), outcome: { status: "pending", cursor: "125" }, expectedCursor: "120" }), 1),
      expectX402Rows(buildSaveX402Reconciliation({ ...target("concurrent"), outcome: { status: "pending", cursor: "199" } }), 1),
      assertState("concurrent", "reconciliation_cursor='130' AND payment_state='uncertain' AND status='reconciliation_required'"),
    ],
  }, {
    name: "Reapplying the migration preserves newly verified payment and delivery",
    statements: [...migration, assertState("delivery-first", "payment_state='confirmed' AND delivery_state='received' AND status='confirmed' AND resource_body=$2", [delivery.resourceBody])],
  }, {
    name: "Database rejects invalid recovery state", expectedErrorCode: "23514",
    statements: [sql("UPDATE agent_x402_payments SET payment_state='unverified-success' WHERE id='legacy'")],
  }];
  return { setup, cases, concurrency: { ...target("concurrent"), execution: fixtureExecution } };
}
