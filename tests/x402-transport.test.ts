import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { payPreparedX402Resource, freezeRequirement } from "../app/x402/protocol";
import { freezeX402Request } from "../app/x402/request";
import { X402_TESTNET_USDC, X402_TESTNET_RESOURCE } from "../app/x402/assets";

const required: PaymentRequired = { x402Version: 2,
  resource: { url: X402_TESTNET_RESOURCE, description: "test fixture", mimeType: "application/json" },
  accepts: [{ scheme: "exact", network: X402_TESTNET_USDC.network, asset: X402_TESTNET_USDC.contract, amount: "100000",
    payTo: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey(), maxTimeoutSeconds: 60, extra: { areFeesSponsored: true } }] };
const prepared = { resourceUrl: X402_TESTNET_RESOURCE, frozen: freezeRequirement(required.accepts[0]),
  request: freezeX402Request(2, required.accepts[0]), x402Version: 2, transaction: "fixture-signed-message" };
const settlement = { success: true, transaction: "a".repeat(64), network: required.accepts[0].network };
function challenge(changed = required) { return new Response("", { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(changed) } }); }

test("transport issues one fixed GET challenge and one paid GET, preserving body bytes", async () => {
  const calls: Array<{ url: string; method: string; paid: boolean }> = [];
  let receiptSaved = false;
  const result = await payPreparedX402Resource({ ...prepared, onSettlement: async value => { assert.equal(value?.transaction, settlement.transaction); receiptSaved = true; },
    fetcher: async (url, init) => {
      const request = new Request(url, init);
      calls.push({ url: request.url, method: request.method, paid: request.headers.has("PAYMENT-SIGNATURE") });
      assert.equal(init?.redirect, "error");
      if (calls.length === 1) return challenge();
      return new Response(' { "answer": 42 } ', { status: 200, headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settlement), "content-type": "application/json" } });
    } });
  assert.deepEqual(calls, [{ url: X402_TESTNET_RESOURCE, method: "GET", paid: false }, { url: X402_TESTNET_RESOURCE, method: "GET", paid: true }]);
  assert.equal(receiptSaved, true);
  assert.equal(result.resourceBody, ' { "answer": 42 } ');
});

test("changed fee sponsorship, timeout or version prevents the paid request", async () => {
  for (const changed of [
    { ...required, x402Version: 1 },
    { ...required, accepts: [{ ...required.accepts[0], maxTimeoutSeconds: 120 }] },
    { ...required, accepts: [{ ...required.accepts[0], extra: { areFeesSponsored: false } }] },
  ]) {
    let calls = 0;
    await assert.rejects(payPreparedX402Resource({ ...prepared, fetcher: async () => { calls++; return challenge(changed); } }));
    assert.equal(calls, 1);
  }
});

test("body loss preserves the receipt checkpoint and never automatically retries", async () => {
  let calls = 0, saved = false;
  await assert.rejects(payPreparedX402Resource({ ...prepared, onSettlement: async () => { saved = true; }, fetcher: async () => {
    calls++;
    if (calls === 1) return challenge();
    return new Response(new ReadableStream({ pull(controller) { controller.error(new Error("response_body_lost")); } }),
      { status: 200, headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settlement) } });
  } }), /response_body_lost/);
  assert.equal(saved, true);
  assert.equal(calls, 2);
});

test("HTTP failure, malformed receipt and empty body cannot be promoted by transport", async () => {
  let calls = 0;
  await assert.rejects(payPreparedX402Resource({ ...prepared, fetcher: async () => ++calls === 1 ? challenge() : new Response("", { status: 503 }) }), /payment_failed_503/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(payPreparedX402Resource({ ...prepared, fetcher: async () => ++calls === 1 ? challenge() : new Response("", { status: 200, headers: { "PAYMENT-RESPONSE": "malformed" } }) }), /resource_empty/);
});

test("arbitrary resource URL is rejected before network access", async () => {
  let calls = 0;
  await assert.rejects(payPreparedX402Resource({ ...prepared, resourceUrl: "https://other.invalid", fetcher: async () => { calls++; return challenge(); } }), /resource_not_allowed/);
  assert.equal(calls, 0);
});

test("invalid UTF-8 cannot be replaced silently and hashed as delivered content", async () => {
  let calls = 0, checkpoint = false;
  await assert.rejects(payPreparedX402Resource({ ...prepared, onSettlement: async () => { checkpoint = true; },
    fetcher: async () => ++calls === 1 ? challenge() : new Response(new Uint8Array([0xc3, 0x28]), { status: 200 }) }), /resource_encoding_invalid/);
  assert.equal(checkpoint, true);
  assert.equal(calls, 2);
});
