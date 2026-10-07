import assert from "node:assert/strict";
import test from "node:test";
import { keccak256, padHex, toHex } from "viem";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { AVALANCHE_X402 } from "../app/x402-avalanche/config";
import {
  createAvalancheMerchantReceiptVerifier,
  type AvalancheMerchantReceiptReader,
} from "../app/x402-avalanche/merchant-receipt";
import type { MerchantPaymentRecord } from "../app/x402-avalanche/merchant-store";

const payer = `0x${"a".repeat(40)}`;
const payTo = `0x${"b".repeat(40)}`;
const transaction = `0x${"c".repeat(64)}`;
const requirement: PaymentRequirements = {
  scheme: "exact",
  network: AVALANCHE_X402.network,
  asset: AVALANCHE_X402.asset.address,
  amount: "10000",
  payTo,
  maxTimeoutSeconds: 60,
  extra: { assetTransferMethod: "eip3009", name: "USD Coin", version: "2" },
};
const payload: PaymentPayload = {
  x402Version: 2,
  resource: { url: "http://localhost:3001/api/report", description: "report", mimeType: "application/json" },
  accepted: requirement,
  payload: {},
};
const settlement: SettleResponse = { success: true, transaction, network: AVALANCHE_X402.network, payer };
const record: MerchantPaymentRecord = {
  merchantId: "merchant-demo",
  resourceId: "report-v1",
  paymentIdentifier: "merchant_payment_00000001",
  fingerprint: "fingerprint",
  signatureHash: "signature-hash",
  authorization: { from: payer, to: payTo, value: "10000", validAfter: "1", validBefore: "2", nonce: `0x${"d".repeat(64)}` },
  requirement,
  payload,
  status: "settling",
  settlement: null,
  transactionHash: null,
  delivery: null,
  error: null,
};
const transferTopic = keccak256(toHex("Transfer(address,address,uint256)"));
function addressTopic(address: string) { return padHex(address as `0x${string}`, { size: 32 }); }
function amountData(amount: bigint) { return padHex(toHex(amount), { size: 32 }); }
function reader(overrides: Partial<Awaited<ReturnType<AvalancheMerchantReceiptReader["getTransactionReceipt"]>>> = {}, chainId = 43113): AvalancheMerchantReceiptReader {
  return {
    async getChainId() { return chainId; },
    async getTransactionReceipt() {
      return {
        transactionHash: transaction,
        status: "success",
        blockNumber: BigInt(42),
        logs: [{
          address: AVALANCHE_X402.asset.address,
          topics: [transferTopic, addressTopic(payer), addressTopic(payTo)],
          data: amountData(BigInt(10000)),
        }],
        ...overrides,
      };
    },
  };
}

test("receipt verifier proves exact Fuji USDC transfer", async () => {
  const evidence = await createAvalancheMerchantReceiptVerifier(reader()).verify({ settlement, record });
  assert.equal(evidence.transactionHash, transaction);
  assert.equal(evidence.payer, payer);
  assert.equal(evidence.payTo, payTo);
  assert.equal(evidence.amountAtomic, "10000");
  assert.equal(evidence.blockNumber, "42");
});

test("receipt verifier rejects wrong chain, reverted and wrong amount", async () => {
  await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({}, 1)).verify({ settlement, record }), /chain_mismatch/);
  await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({ status: "reverted" })).verify({ settlement, record }), /reverted/);
  await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({ logs: [{ address: AVALANCHE_X402.asset.address, topics: [transferTopic, addressTopic(payer), addressTopic(payTo)], data: amountData(BigInt(9999)) }] })).verify({ settlement, record }), /transfer_not_unique/);
});

test("receipt verifier rejects removed or duplicate matching logs", async () => {
  const log = { address: AVALANCHE_X402.asset.address, topics: [transferTopic, addressTopic(payer), addressTopic(payTo)], data: amountData(BigInt(10000)) };
  await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({ logs: [{ ...log, removed: true }] })).verify({ settlement, record }), /transfer_not_unique/);
  await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({ logs: [log, log] })).verify({ settlement, record }), /transfer_not_unique/);
});

test("receipt verifier rejects transfers to another recipient, from another payer or in another token", async () => {
  const other = `0x${"e".repeat(40)}`;
  const log = { address: AVALANCHE_X402.asset.address, topics: [transferTopic, addressTopic(payer), addressTopic(payTo)], data: amountData(BigInt(10000)) };
  for (const changed of [
    { ...log, topics: [transferTopic, addressTopic(payer), addressTopic(other)] },
    { ...log, topics: [transferTopic, addressTopic(other), addressTopic(payTo)] },
    { ...log, address: other },
  ]) {
    await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({ logs: [changed] })).verify({ settlement, record }), /transfer_not_unique/);
  }
});

test("receipt verifier finds a single exact transfer among unrelated and malformed logs", async () => {
  const other = `0x${"e".repeat(40)}`;
  const log = { address: AVALANCHE_X402.asset.address, topics: [transferTopic, addressTopic(payer), addressTopic(payTo)], data: amountData(BigInt(10000)) };
  const evidence = await createAvalancheMerchantReceiptVerifier(reader({ logs: [
    { ...log, address: other },
    { ...log, topics: [transferTopic, addressTopic(other), addressTopic(payTo)] },
    { ...log, topics: [transferTopic, "0x00", addressTopic(payTo)] },
    { ...log, data: "0x00" },
    log,
    { ...log, topics: ["0x00", addressTopic(payer), addressTopic(payTo)] },
  ] })).verify({ settlement, record });
  assert.equal(evidence.amountAtomic, "10000");
  assert.equal(evidence.asset, AVALANCHE_X402.asset.address.toLowerCase());
});

test("receipt verifier rejects a receipt for a different transaction", async () => {
  await assert.rejects(createAvalancheMerchantReceiptVerifier(reader({ transactionHash: `0x${"e".repeat(64)}` })).verify({ settlement, record }), /hash_mismatch/);
});
