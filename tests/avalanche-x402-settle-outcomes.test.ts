import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse } from "@x402/core/types";
import {
  type AvalancheX402Facilitator,
  createAvalancheX402Facilitator,
} from "../app/x402-avalanche/facilitator";
import type { FrozenAvalancheX402Payment } from "../app/x402-avalanche/payment";
import type { AvalancheMerchantReceiptVerifier } from "../app/x402-avalanche/merchant";
import { executeAvalancheX402Settlement } from "../app/x402-avalanche/settlement";
import {
  bindAvalancheX402Signature,
  prepareAvalancheX402Payment,
} from "../app/x402-avalanche/store";

type Row = Record<string, unknown>;

class MemorySql {
  payments = new Map<string, Row>();
  byKey = new Map<string, string>();
  conflictOnRecord = false;

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
      if (this.conflictOnRecord || !row || row.user_id !== params[4] || row.status !== "settling") {
        return { rows: [] as T[] };
      }
      Object.assign(row, {
        status: "settled",
        settlement: JSON.parse(String(params[0])),
        transaction_hash: params[1],
        onchain_evidence: JSON.parse(String(params[2])),
      });
      return { rows: [row] as T[] };
    }
    if (compact.includes("SET status=$1, error=$2")) {
      const row = this.payments.get(String(params[2]));
      if (row && row.user_id === params[3] && ["prepared", "signed", "settling"].includes(String(row.status))) {
        Object.assign(row, { status: params[0], error: params[1] });
        return { rows: [row] as T[] };
      }
      return { rows: [] as T[] };
    }
    throw new Error(`unexpected_sql:${compact}`);
  }
}

const USER_ID = "user-1";
const TRANSACTION = `0x${"f".repeat(64)}`;
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
  paymentId: "avax_x402_settle_outcomes",
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
const payload: PaymentPayload = {
  x402Version: 2,
  resource: {
    url: payment.resource.url,
    description: "Carmelita Avalanche Fuji deterministic report",
    mimeType: "application/json",
  },
  accepted: requirement,
  payload: {
    signature: `0x${"a".repeat(130)}`,
    authorization: {
      from: payment.payer,
      to: payment.payTo,
      value: payment.amount,
      validAfter: payment.validAfter,
      validBefore: payment.validBefore,
      nonce: payment.nonce,
    },
  },
};

async function signedPayment(sql: MemorySql) {
  await prepareAvalancheX402Payment({
    userId: USER_ID,
    idempotencyKey: "request-1",
    walletId: "wallet-1",
    payment,
    requirement,
  }, sql);
  await bindAvalancheX402Signature({
    userId: USER_ID,
    paymentId: payment.paymentId,
    signatureHeader: "payment-signature-one",
  }, sql);
  return sql.payments.get(payment.paymentId)!;
}

function settledPayload(overrides: Record<string, unknown> = {}): SettleResponse {
  return {
    success: true,
    transaction: TRANSACTION,
    network: "eip155:43113",
    payer: payment.payer,
    ...overrides,
  };
}

function stubFacilitator(handlers: {
  verify?: () => Promise<VerifyResponse>;
  settle?: () => Promise<SettleResponse>;
} = {}) {
  const calls = { verify: 0, settle: 0 };
  const facilitator: AvalancheX402Facilitator = {
    verify: async () => {
      calls.verify += 1;
      return handlers.verify ? handlers.verify() : { isValid: true };
    },
    settle: async () => {
      calls.settle += 1;
      return handlers.settle ? handlers.settle() : settledPayload();
    },
  };
  return { calls, facilitator };
}

function httpFacilitator(respond: (endpoint: string) => Promise<Response>) {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    return respond(url.slice(url.lastIndexOf("/") + 1));
  };
  return { calls, facilitator: createAvalancheX402Facilitator(fetcher) };
}

function validReceiptVerifier(): AvalancheMerchantReceiptVerifier {
  return {
    async verify({ settlement, record }) {
      return {
        transactionHash: settlement.transaction,
        network: "eip155:43113",
        payer: record.authorization.from,
        payTo: record.authorization.to,
        asset: record.requirement.asset,
        amountAtomic: record.authorization.value,
        blockNumber: "57475367",
      };
    },
  };
}

function execute(
  sql: MemorySql,
  facilitator: AvalancheX402Facilitator,
  receiptVerifier: AvalancheMerchantReceiptVerifier = validReceiptVerifier(),
) {
  return executeAvalancheX402Settlement(
    { userId: USER_ID, paymentId: payment.paymentId, payload, requirement },
    { facilitator, receiptVerifier, sql },
  );
}

test("a valid settle is recorded with evidence bound to the persisted payment", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { calls, facilitator } = stubFacilitator();

  const outcome = await execute(sql, facilitator);

  assert.equal(outcome.kind, "settled");
  assert.equal(outcome.payment.status, "settled");
  assert.equal(outcome.payment.transaction_hash, TRANSACTION);
  assert.equal(outcome.payment.error, null);
  assert.equal((outcome.payment.settlement as SettleResponse).transaction, TRANSACTION);
  assert.equal(outcome.payment.onchain_evidence?.blockNumber, "57475367");
  assert.deepEqual(calls, { verify: 1, settle: 1 });
});

test("an unverified on-chain receipt is quarantined before delivery", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = stubFacilitator();
  const receiptVerifier: AvalancheMerchantReceiptVerifier = {
    async verify() {
      throw new Error("merchant_x402_receipt_transfer_not_unique");
    },
  };

  await assert.rejects(
    execute(sql, facilitator, receiptVerifier),
    /settle_ambiguous:merchant_x402_receipt_transfer_not_unique/,
  );
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.transaction_hash, null);
  assert.equal(row.onchain_evidence, null);
});
test("an invalid verification fails terminally, maps to a fresh 402 challenge and never settles", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { calls, facilitator } = stubFacilitator({
    verify: async () => ({ isValid: false, invalidReason: "avalanche_x402_bad_signature" }),
  });

  const outcome = await execute(sql, facilitator);

  assert.equal(outcome.kind, "verification_failed");
  assert.equal(outcome.payment.status, "failed");
  assert.equal(outcome.payment.error, "avalanche_x402_bad_signature");
  assert.equal(calls.settle, 0, "settle must not be called after a failed verification");
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "failed");
  assert.equal(row.transaction_hash, null);
});

test("a settle response with success:false is terminally failed with the facilitator reason", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = stubFacilitator({
    settle: async () => ({
      success: false,
      errorReason: "insufficient_usdc_allowance",
      transaction: "",
      network: "eip155:43113",
    }),
  });

  await assert.rejects(execute(sql, facilitator), /insufficient_usdc_allowance/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "failed");
  assert.equal(row.error, "insufficient_usdc_allowance");
  assert.equal(row.transaction_hash, null);
});

test("a reverted settle response is terminally reverted", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = stubFacilitator({
    settle: async () => ({
      success: false,
      errorReason: "execution reverted: transfer failed",
      transaction: "",
      network: "eip155:43113",
    }),
  });

  await assert.rejects(execute(sql, facilitator), /execution reverted/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reverted");
  assert.equal(row.error, "execution reverted: transfer failed");
  assert.equal(row.transaction_hash, null);
});

test("facilitator settle 4xx rejections are definitive terminal failures", async () => {
  for (const status of [400, 402, 422]) {
    const sql = new MemorySql();
    await signedPayment(sql);
    const { calls, facilitator } = httpFacilitator(async (endpoint) =>
      endpoint === "verify"
        ? Response.json({ isValid: true })
        : Response.json({ success: false, errorReason: "rejected" }, { status }));

    await assert.rejects(execute(sql, facilitator), new RegExp(`facilitator_http_${status}`));
    const row = sql.payments.get(payment.paymentId)!;
    assert.equal(row.status, "failed", `HTTP ${status}`);
    assert.equal(row.error, `avalanche_x402_facilitator_http_${status}`);
    assert.equal(row.transaction_hash, null);
    assert.deepEqual(calls, [
      "https://x402.0xgasless.com/verify",
      "https://x402.0xgasless.com/settle",
    ]);
  }
});

test("facilitator settle 5xx quarantines the payment and a retry never auto-settles", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = httpFacilitator(async (endpoint) =>
    endpoint === "verify"
      ? Response.json({ isValid: true })
      : Response.json({ error: "boom" }, { status: 500 }));

  await assert.rejects(execute(sql, facilitator), /settle_ambiguous:avalanche_x402_facilitator_http_500/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.error, "avalanche_x402_settle_ambiguous:avalanche_x402_facilitator_http_500");
  assert.equal(row.transaction_hash, null);

  const retry = stubFacilitator();
  await assert.rejects(execute(sql, retry.facilitator), /settlement_not_allowed:reconciliation_required/);
  assert.equal(retry.calls.settle, 0, "a parked payment must never be settled again automatically");
});

test("a network failure during settle quarantines the payment", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = httpFacilitator(async (endpoint) => {
    if (endpoint === "verify") return Response.json({ isValid: true });
    throw new TypeError("fetch failed");
  });

  await assert.rejects(execute(sql, facilitator), /settle_ambiguous:fetch failed/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.transaction_hash, null);
});

test("a settle abort quarantines the payment for reconciliation", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = httpFacilitator(async (endpoint) => {
    if (endpoint === "verify") return Response.json({ isValid: true });
    throw new DOMException("The operation was aborted.", "AbortError");
  });

  await assert.rejects(execute(sql, facilitator), /settle_ambiguous:avalanche_x402_settle_ambiguous/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.transaction_hash, null);
});

test("a record conflict after a successful settle quarantines instead of wedging", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  sql.conflictOnRecord = true;
  const { calls, facilitator } = stubFacilitator();

  await assert.rejects(execute(sql, facilitator), /settle_ambiguous:avalanche_x402_settlement_state_conflict/);
  assert.equal(calls.settle, 1, "the facilitator did settle; the conflict is local");
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.transaction_hash, null, "conflicting evidence must not be recorded");
});

test("a settle payload from another network is quarantined, not recorded", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = stubFacilitator({
    settle: async () => settledPayload({ network: "eip155:43114" }),
  });

  await assert.rejects(execute(sql, facilitator), /settle_ambiguous:settlement_network_mismatch/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.transaction_hash, null);
});

test("a settle payload from another payer is quarantined, not recorded", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = stubFacilitator({
    settle: async () => settledPayload({ payer: `0x${"9".repeat(40)}` }),
  });

  await assert.rejects(execute(sql, facilitator), /settle_ambiguous:settlement_payer_mismatch/);
  const row = sql.payments.get(payment.paymentId)!;
  assert.equal(row.status, "reconciliation_required");
  assert.equal(row.transaction_hash, null);
});

test("a success payload without a usable transaction is quarantined as malformed", async () => {
  for (const transaction of ["", "not-a-transaction"]) {
    const sql = new MemorySql();
    await signedPayment(sql);
    const { facilitator } = stubFacilitator({
      settle: async () => settledPayload({ transaction }),
    });

    await assert.rejects(execute(sql, facilitator), /settle_ambiguous:settlement_payload_malformed/);
    const row = sql.payments.get(payment.paymentId)!;
    assert.equal(row.status, "reconciliation_required", `transaction=${JSON.stringify(transaction)}`);
    assert.equal(row.transaction_hash, null);
  }
});

test("a success payload that omits network and payer still settles", async () => {
  const sql = new MemorySql();
  await signedPayment(sql);
  const { facilitator } = stubFacilitator({
    settle: async () => ({ success: true, transaction: TRANSACTION }) as SettleResponse,
  });

  const outcome = await execute(sql, facilitator);

  assert.equal(outcome.kind, "settled");
  assert.equal(outcome.payment.status, "settled");
  assert.equal(outcome.payment.transaction_hash, TRANSACTION);
});

test("the route truthfully maps each settle outcome to the client", () => {
  const route = readFileSync(
    new URL("../app/api/demo/avalanche-report/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /executeAvalancheX402Settlement\(/);
  assert.match(route, /outcome\.kind === "verification_failed"\) return challenge\(/);
  assert.match(route, /message\.includes\("reconciliation_required"\) \? 409/);
  assert.match(route, /message\.includes\("ambiguous"\) \? 503/);
  assert.match(route, /status:\s*"reconciliation_required"/);
});
