import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import type { FrozenAvalancheX402Payment } from "../app/x402-avalanche/payment";
import {
  bindAvalancheX402Signature,
  claimAvalancheX402Settlement,
  deliverAvalancheX402Report,
  prepareAvalancheX402Payment,
  recordAvalancheX402Settlement,
} from "../app/x402-avalanche/store";

type Row = Record<string, unknown>;

class MemorySql {
  payments = new Map<string, Row>();
  byKey = new Map<string, string>();
  deliveries = new Map<string, Row>();

  async query<T = Row>(query: string, params: unknown[] = []) {
    const compact = query.replace(/\s+/g, " ").trim();
    if (compact.startsWith("CREATE ") || compact.startsWith("CREATE INDEX") || compact.startsWith("ALTER TABLE")) {
      return { rows: [] as T[] };
    }
    if (compact.startsWith("INSERT INTO agent_avalanche_x402_payments")) {
      const key = String(params[2]);
      if (this.byKey.has(key)) return { rows: [] as T[] };
      const now = new Date().toISOString();
      const row: Row = {
        id: params[0], user_id: params[1], idempotency_key: key,
        wallet_id: params[3], wallet_address: params[4], resource_url: params[5],
        resource_method: params[6], request_body_hash: params[7], network: params[8],
        asset_contract: params[9], pay_to: params[10], amount_atomic: params[11],
        requirement: JSON.parse(String(params[12])), frozen_payment: JSON.parse(String(params[13])),
        signature_header: null, signature_hash: null, status: "prepared",
        settlement: null, transaction_hash: null, onchain_evidence: null, error: null, expires_at: params[14],
        settlement_claimed_at: null, created_at: now, updated_at: now,
      };
      this.payments.set(String(params[0]), row);
      this.byKey.set(key, String(params[0]));
      return { rows: [row] as T[] };
    }
    if (compact.includes("WHERE idempotency_key = $1")) {
      const id = this.byKey.get(String(params[0]));
      return { rows: (id ? [this.payments.get(id)!] : []) as T[] };
    }
    if (compact.startsWith("SELECT * FROM agent_avalanche_x402_payments")) {
      const row = this.payments.get(String(params[0]));
      return { rows: (row && row.user_id === params[1] ? [row] : []) as T[] };
    }
    if (compact.includes("SET signature_header=$1")) {
      const row = this.payments.get(String(params[2]));
      if (!row || row.user_id !== params[3] || row.status !== "prepared" || row.signature_hash) {
        return { rows: [] as T[] };
      }
      Object.assign(row, { signature_header: params[0], signature_hash: params[1], status: "signed" });
      return { rows: [row] as T[] };
    }
    if (compact.includes("SET status='settling'")) {
      const row = this.payments.get(String(params[0]));
      if (!row || row.user_id !== params[1] || row.status !== "signed") return { rows: [] as T[] };
      Object.assign(row, { status: "settling", settlement_claimed_at: new Date().toISOString() });
      return { rows: [row] as T[] };
    }
    if (compact.includes("SET status='settled'")) {
      const row = this.payments.get(String(params[3]));
      if (!row || row.user_id !== params[4] || row.status !== "settling") return { rows: [] as T[] };
      Object.assign(row, {
        status: "settled",
        settlement: JSON.parse(String(params[0])),
        transaction_hash: params[1],
        onchain_evidence: JSON.parse(String(params[2])),
      });
      return { rows: [row] as T[] };
    }
    if (compact.startsWith("INSERT INTO agent_avalanche_x402_deliveries")) {
      if (!this.deliveries.has(String(params[1]))) {
        this.deliveries.set(String(params[1]), {
          id: params[0], payment_id: params[1], user_id: params[2],
          body: JSON.parse(String(params[3])), body_hash: params[4],
          delivered_at: new Date().toISOString(),
        });
      }
      return { rows: [] as T[] };
    }
    if (compact.includes("SET status='delivered'")) {
      const row = this.payments.get(String(params[0]));
      if (row && row.user_id === params[1] && row.status === "settled") row.status = "delivered";
      return { rows: [] as T[] };
    }
    if (compact.startsWith("SELECT * FROM agent_avalanche_x402_deliveries")) {
      const row = this.deliveries.get(String(params[0]));
      return { rows: (row && row.user_id === params[1] ? [row] : []) as T[] };
    }
    throw new Error(`unexpected_sql:${compact}`);
  }
}

const requirement: PaymentRequirements = {
  scheme: "exact",
  network: "eip155:43113",
  asset: `0x${"a".repeat(40)}`,
  amount: "10000",
  payTo: `0x${"b".repeat(40)}`,
  maxTimeoutSeconds: 60,
  extra: { name: "USD Coin", version: "2" },
};
const payment: FrozenAvalancheX402Payment = {
  paymentId: "avax_x402_fixture",
  x402Version: 2,
  scheme: "exact",
  network: "eip155:43113",
  resource: { url: "http://localhost:3001/api/demo/avalanche-report", method: "POST", bodyHash: "c".repeat(64) },
  payer: `0x${"d".repeat(40)}`,
  payTo: requirement.payTo,
  asset: requirement.asset,
  amount: requirement.amount,
  validAfter: "1800000000",
  validBefore: "1800000060",
  nonce: `0x${"e".repeat(64)}`,
  status: "prepared",
  signature: null,
};

test("duplicate prepare returns one immutable Avalanche payment", async () => {
  const sql = new MemorySql();
  const input = { userId: "user-1", idempotencyKey: "request-1", walletId: "wallet-1", payment, requirement };
  const first = await prepareAvalancheX402Payment(input, sql);
  const replay = await prepareAvalancheX402Payment(input, sql);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(sql.payments.size, 1);
  await assert.rejects(
    prepareAvalancheX402Payment({
      ...input,
      requirement: { ...requirement, amount: "10001" },
      payment: { ...payment, amount: "10001" },
    }, sql),
    /idempotency_conflict/,
  );
});

test("first signature wins and replacement is rejected", async () => {
  const sql = new MemorySql();
  await prepareAvalancheX402Payment({ userId: "user-1", idempotencyKey: "request-1", walletId: "wallet-1", payment, requirement }, sql);
  const header = "payment-signature-one";
  assert.equal((await bindAvalancheX402Signature({ userId: "user-1", paymentId: payment.paymentId, signatureHeader: header }, sql)).replayed, false);
  assert.equal((await bindAvalancheX402Signature({ userId: "user-1", paymentId: payment.paymentId, signatureHeader: header }, sql)).replayed, true);
  await assert.rejects(
    bindAvalancheX402Signature({ userId: "user-1", paymentId: payment.paymentId, signatureHeader: "replacement" }, sql),
    /signature_replacement_rejected/,
  );
});

test("settlement can be claimed once and delivery is byte-stable", async () => {
  const sql = new MemorySql();
  await prepareAvalancheX402Payment({ userId: "user-1", idempotencyKey: "request-1", walletId: "wallet-1", payment, requirement }, sql);
  await bindAvalancheX402Signature({ userId: "user-1", paymentId: payment.paymentId, signatureHeader: "payment-signature-one" }, sql);
  await claimAvalancheX402Settlement("user-1", payment.paymentId, sql);
  await assert.rejects(claimAvalancheX402Settlement("user-1", payment.paymentId, sql), /settlement_in_progress/);
  const settlement = {
    success: true,
    transaction: `0x${"f".repeat(64)}`,
    network: "eip155:43113",
    payer: payment.payer,
  } as SettleResponse;
  await recordAvalancheX402Settlement({
    userId: "user-1",
    paymentId: payment.paymentId,
    settlement,
    transactionHash: settlement.transaction,
    onchainEvidence: {
      transactionHash: settlement.transaction,
      network: "eip155:43113",
      payer: payment.payer,
      payTo: payment.payTo,
      asset: payment.asset,
      amountAtomic: payment.amount,
      blockNumber: "1",
    },
  }, sql);
  assert.equal(sql.payments.get(payment.paymentId)?.onchain_evidence !== null, true);
  const first = await deliverAvalancheX402Report("user-1", payment.paymentId, sql);
  const replay = await deliverAvalancheX402Report("user-1", payment.paymentId, sql);
  assert.equal(sql.deliveries.size, 1);
  assert.deepEqual(replay.body, first.body);
  assert.equal(replay.body_hash, first.body_hash);
});
