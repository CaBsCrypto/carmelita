import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getDatabaseUrl } from "@/db";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import type { FrozenAvalancheX402Payment } from "./payment";
import type { AvalancheSettlementEvidence } from "./evidence";

export type AvalancheX402Status =
  | "prepared"
  | "signed"
  | "settling"
  | "settled"
  | "delivered"
  | "expired"
  | "failed"
  | "reverted"
  | "reconciliation_required";

export type AvalancheX402Row = {
  id: string;
  user_id: string;
  idempotency_key: string;
  wallet_id: string;
  wallet_address: string;
  resource_url: string;
  resource_method: string;
  request_body_hash: string;
  network: string;
  asset_contract: string;
  pay_to: string;
  amount_atomic: string;
  requirement: PaymentRequirements;
  frozen_payment: FrozenAvalancheX402Payment;
  signature_header: string | null;
  signature_hash: string | null;
  status: AvalancheX402Status;
  settlement: SettleResponse | null;
  transaction_hash: string | null;
  onchain_evidence: AvalancheSettlementEvidence | null;
  error: string | null;
  expires_at: string;
  settlement_claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AvalancheX402DeliveryRow = {
  id: string;
  payment_id: string;
  user_id: string;
  body: Record<string, unknown>;
  body_hash: string;
  delivered_at: string;
};

type QueryResult<T> = { rows: T[] };
export type SqlClient = {
  query<T = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
};

let schemaPromise: Promise<void> | null = null;

function client(): SqlClient {
  const url = getDatabaseUrl();
  if (!url) throw new Error("database_not_configured");
  return neon(url, { fullResults: true }) as unknown as SqlClient;
}

export async function ensureAvalancheX402Schema(sql: SqlClient = client()) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await sql.query(`CREATE TABLE IF NOT EXISTS agent_avalanche_x402_payments (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
      idempotency_key text NOT NULL UNIQUE,
      wallet_id text NOT NULL,
      wallet_address text NOT NULL,
      resource_url text NOT NULL,
      resource_method text NOT NULL,
      request_body_hash text NOT NULL,
      network text NOT NULL,
      asset_contract text NOT NULL,
      pay_to text NOT NULL,
      amount_atomic numeric(30,0) NOT NULL,
      requirement jsonb NOT NULL,
      frozen_payment jsonb NOT NULL,
      signature_header text,
      signature_hash text UNIQUE,
      status text NOT NULL DEFAULT 'prepared',
      settlement jsonb,
      transaction_hash text UNIQUE,
      onchain_evidence jsonb,
      error text,
      expires_at timestamptz NOT NULL,
      settlement_claimed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await sql.query("ALTER TABLE agent_avalanche_x402_payments ADD COLUMN IF NOT EXISTS onchain_evidence jsonb");
    await sql.query("CREATE INDEX IF NOT EXISTS agent_avalanche_x402_user_created_idx ON agent_avalanche_x402_payments(user_id, created_at)");
    await sql.query("CREATE INDEX IF NOT EXISTS agent_avalanche_x402_status_idx ON agent_avalanche_x402_payments(status)");
    await sql.query(`CREATE TABLE IF NOT EXISTS agent_avalanche_x402_deliveries (
      id text PRIMARY KEY,
      payment_id text NOT NULL UNIQUE REFERENCES agent_avalanche_x402_payments(id) ON DELETE CASCADE,
      user_id text NOT NULL REFERENCES agent_users(id) ON DELETE CASCADE,
      body jsonb NOT NULL,
      body_hash text NOT NULL,
      delivered_at timestamptz NOT NULL DEFAULT now()
    )`);
    await sql.query("CREATE INDEX IF NOT EXISTS agent_avalanche_x402_delivery_user_idx ON agent_avalanche_x402_deliveries(user_id, delivered_at)");
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(object[key])}`
  ).join(",")}}`;
}

function assertImmutable(
  row: AvalancheX402Row,
  input: {
    userId: string;
    walletId: string;
    payment: FrozenAvalancheX402Payment;
    requirement: PaymentRequirements;
  },
) {
  const payment = input.payment;
  if (
    row.user_id !== input.userId ||
    row.wallet_id !== input.walletId ||
    row.wallet_address.toLowerCase() !== payment.payer.toLowerCase() ||
    row.resource_url !== payment.resource.url ||
    row.resource_method !== payment.resource.method ||
    row.request_body_hash !== payment.resource.bodyHash ||
    row.network !== payment.network ||
    row.asset_contract.toLowerCase() !== payment.asset.toLowerCase() ||
    row.pay_to.toLowerCase() !== payment.payTo.toLowerCase() ||
    row.amount_atomic !== payment.amount ||
    stableJson(row.requirement) !== stableJson(input.requirement) ||
    stableJson(row.frozen_payment) !== stableJson(payment)
  ) throw new Error("avalanche_x402_idempotency_conflict");
}

export async function findAvalancheX402Payment(
  userId: string,
  paymentId: string,
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const result = await sql.query<AvalancheX402Row>(
    "SELECT * FROM agent_avalanche_x402_payments WHERE id = $1 AND user_id = $2 LIMIT 1",
    [paymentId, userId],
  );
  if (!result.rows[0]) throw new Error("avalanche_x402_payment_not_found");
  return result.rows[0];
}

export async function prepareAvalancheX402Payment(
  input: {
    userId: string;
    idempotencyKey: string;
    walletId: string;
    payment: FrozenAvalancheX402Payment;
    requirement: PaymentRequirements;
  },
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const payment = input.payment;
  const expiresAt = new Date(Number(payment.validBefore) * 1_000);
  const inserted = await sql.query<AvalancheX402Row>(`INSERT INTO agent_avalanche_x402_payments (
      id,user_id,idempotency_key,wallet_id,wallet_address,resource_url,resource_method,
      request_body_hash,network,asset_contract,pay_to,amount_atomic,requirement,frozen_payment,expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)
    ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`, [
    payment.paymentId,
    input.userId,
    input.idempotencyKey,
    input.walletId,
    payment.payer,
    payment.resource.url,
    payment.resource.method,
    payment.resource.bodyHash,
    payment.network,
    payment.asset,
    payment.payTo,
    payment.amount,
    JSON.stringify(input.requirement),
    JSON.stringify(payment),
    expiresAt.toISOString(),
  ]);
  if (inserted.rows[0]) return { row: inserted.rows[0], replayed: false };
  const existing = await sql.query<AvalancheX402Row>(
    "SELECT * FROM agent_avalanche_x402_payments WHERE idempotency_key = $1 LIMIT 1",
    [input.idempotencyKey],
  );
  if (!existing.rows[0]) throw new Error("avalanche_x402_prepare_race");
  assertImmutable(existing.rows[0], input);
  return { row: existing.rows[0], replayed: true };
}

export async function bindAvalancheX402Signature(
  input: { userId: string; paymentId: string; signatureHeader: string },
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const signatureHash = sha256(input.signatureHeader);
  const updated = await sql.query<AvalancheX402Row>(`UPDATE agent_avalanche_x402_payments
    SET signature_header=$1, signature_hash=$2, status='signed', updated_at=now()
    WHERE id=$3 AND user_id=$4 AND status='prepared' AND signature_hash IS NULL
    RETURNING *`, [
    input.signatureHeader,
    signatureHash,
    input.paymentId,
    input.userId,
  ]);
  if (updated.rows[0]) return { row: updated.rows[0], replayed: false };
  const row = await findAvalancheX402Payment(input.userId, input.paymentId, sql);
  if (row.signature_hash !== signatureHash || row.signature_header !== input.signatureHeader) {
    throw new Error("avalanche_x402_signature_replacement_rejected");
  }
  return { row, replayed: true };
}

export async function claimAvalancheX402Settlement(
  userId: string,
  paymentId: string,
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const claimed = await sql.query<AvalancheX402Row>(`UPDATE agent_avalanche_x402_payments
    SET status='settling', settlement_claimed_at=now(), updated_at=now()
    WHERE id=$1 AND user_id=$2 AND status='signed' RETURNING *`, [paymentId, userId]);
  if (claimed.rows[0]) return claimed.rows[0];
  const row = await findAvalancheX402Payment(userId, paymentId, sql);
  if (row.status === "settling") throw new Error("avalanche_x402_settlement_in_progress");
  if (row.status === "settled" || row.status === "delivered") return row;
  throw new Error(`avalanche_x402_settlement_not_allowed:${row.status}`);
}

export async function recordAvalancheX402Settlement(
  input: {
    userId: string;
    paymentId: string;
    settlement: SettleResponse;
    transactionHash: string;
    onchainEvidence: AvalancheSettlementEvidence;
  },
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const result = await sql.query<AvalancheX402Row>(`UPDATE agent_avalanche_x402_payments
    SET status='settled', settlement=$1::jsonb, transaction_hash=$2,
        onchain_evidence=$3::jsonb, error=NULL, updated_at=now()
    WHERE id=$4 AND user_id=$5 AND status='settling' RETURNING *`, [
    JSON.stringify(input.settlement),
    input.transactionHash,
    JSON.stringify(input.onchainEvidence),
    input.paymentId,
    input.userId,
  ]);
  if (!result.rows[0]) throw new Error("avalanche_x402_settlement_state_conflict");
  return result.rows[0];
}

export async function markAvalancheX402Terminal(
  input: {
    userId: string;
    paymentId: string;
    status: Extract<AvalancheX402Status, "expired" | "failed" | "reverted" | "reconciliation_required">;
    error: string;
  },
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const result = await sql.query<AvalancheX402Row>(`UPDATE agent_avalanche_x402_payments
    SET status=$1, error=$2, updated_at=now()
    WHERE id=$3 AND user_id=$4 AND status IN ('prepared','signed','settling') RETURNING *`, [
    input.status,
    input.error,
    input.paymentId,
    input.userId,
  ]);
  return result.rows[0] ?? findAvalancheX402Payment(input.userId, input.paymentId, sql);
}

export async function deliverAvalancheX402Report(
  userId: string,
  paymentId: string,
  sql: SqlClient = client(),
) {
  await ensureAvalancheX402Schema(sql);
  const payment = await findAvalancheX402Payment(userId, paymentId, sql);
  if (payment.status !== "settled" && payment.status !== "delivered") {
    throw new Error(`avalanche_x402_delivery_not_allowed:${payment.status}`);
  }
  if (!payment.transaction_hash) throw new Error("avalanche_x402_transaction_missing");
  if (payment.status === "settled" && !payment.onchain_evidence) {
    throw new Error("avalanche_x402_onchain_evidence_missing");
  }
  const deliveryId = `avax_delivery_${sha256(payment.id)}`;
  const body = {
    deliveryId,
    report: "Carmelita Avalanche agent readiness",
    network: payment.network,
    paid: { asset: "USDC", amountAtomic: payment.amount_atomic },
    transactionHash: payment.transaction_hash,
    paymentId: payment.id,
  };
  const bodyHash = sha256(stableJson(body));
  await sql.query(`INSERT INTO agent_avalanche_x402_deliveries
    (id,payment_id,user_id,body,body_hash) VALUES ($1,$2,$3,$4::jsonb,$5)
    ON CONFLICT (payment_id) DO NOTHING`, [
    deliveryId,
    payment.id,
    userId,
    JSON.stringify(body),
    bodyHash,
  ]);
  await sql.query(`UPDATE agent_avalanche_x402_payments SET status='delivered', updated_at=now()
    WHERE id=$1 AND user_id=$2 AND status='settled'`, [payment.id, userId]);
  const result = await sql.query<AvalancheX402DeliveryRow>(
    "SELECT * FROM agent_avalanche_x402_deliveries WHERE payment_id=$1 AND user_id=$2 LIMIT 1",
    [payment.id, userId],
  );
  if (!result.rows[0] || result.rows[0].body_hash !== bodyHash) {
    throw new Error("avalanche_x402_delivery_integrity_error");
  }
  return result.rows[0];
}
