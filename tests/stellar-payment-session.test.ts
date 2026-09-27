import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { prepareStellarPayment, rememberStellarPayment, restoreStellarPayment, sameStellarPaymentDelivery, stellarPaymentContent, stellarPaymentStorageKey, stellarPaymentView, type StellarPayment, type StellarPaymentStatus } from "../app/agent/stellar-payment-session";

const payment: StellarPayment = {
  id: "payment-1", signingAddress: "GSTELLAR", signingHash: "0xab", resourceUrl: "https://provider.example/resource", network: "stellar:testnet", asset: "USDC", assetContract: "CONTRACT", payTo: "GDESTINATION", amount: "0.01", status: "prepared", transactionHash: null, explorerUrl: null, resourcePreview: null, expiresAt: "2099-01-01T00:00:00Z", paymentState: "pending", deliveryState: "pending",
  request: { method: "GET", url: "https://provider.example/resource", version: 2, scheme: "exact", network: "stellar:testnet", asset: "CONTRACT", amount: "100000", payTo: "GDESTINATION", sponsored: true, maxTimeoutSeconds: 60 },
};
const status: StellarPaymentStatus = { x402Usdc: { trustlineActive: true, balance: "0.49", faucetUrl: "https://faucet.example" }, resource: payment.resourceUrl, recent: [] };
function storage() { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; }

test("restoration after reload uses the exact stored ID and never crosses accounts or creates a payment", async () => {
  const persisted = storage();
  rememberStellarPayment("user-a", payment, persisted);
  assert.equal(persisted.getItem(stellarPaymentStorageKey("user-a")), payment.id);
  const calls: string[] = [];
  const restored = await restoreStellarPayment({ userId: "user-a", storage: persisted, status, readPayment: async (id) => { calls.push(id); return payment; } });
  assert.equal(restored?.id, payment.id);
  assert.deepEqual(calls, [payment.id]);
  assert.equal(await restoreStellarPayment({ userId: "user-b", storage: persisted, status, readPayment: async () => { throw new Error("must_not_read_another_user"); } }), null);
});

test("a pending server payment is restored without generating a new action when storage has no reference", async () => {
  const persisted = storage();
  const pending = { ...payment, id: "pending-from-other-device", status: "reconciliation_required", paymentState: "uncertain" as const };
  const restored = await restoreStellarPayment({ userId: "user-a", storage: persisted, status: { ...status, pendingPayment: pending }, readPayment: async () => { throw new Error("unneeded_request"); } });
  assert.equal(restored?.id, pending.id);
  assert.equal(persisted.getItem(stellarPaymentStorageKey("user-a")), pending.id);
  const result = await prepareStellarPayment({ status, existing: restored, prepare: async () => { throw new Error("must_not_create_second_payment"); } });
  assert.equal(result.reason, "existing");
});

test("a lost or mismatched response preserves the original reference and does not fall back to a different payment", async () => {
  const persisted = storage();
  rememberStellarPayment("user-a", payment, persisted);
  await assert.rejects(restoreStellarPayment({ userId: "user-a", storage: persisted, status: { ...status, pendingPayment: { ...payment, id: "other" } }, readPayment: async () => { throw new Error("timeout"); } }), /timeout/);
  assert.equal(persisted.getItem(stellarPaymentStorageKey("user-a")), payment.id);
  await assert.rejects(restoreStellarPayment({ userId: "user-a", storage: persisted, status, readPayment: async () => ({ ...payment, id: "wrong" }) }), /identity_mismatch/);
});

test("expired, uncertain and legacy confirmations never offer a new signature as a recovery action", () => {
  assert.equal(stellarPaymentView(payment).canSign, true);
  assert.equal(stellarPaymentView({ ...payment, expiresAt: "2000-01-01T00:00:00Z" }).canSign, false);
  assert.equal(stellarPaymentView({ ...payment, paymentState: "uncertain", status: "reconciliation_required" }).canSign, false);
  assert.equal(stellarPaymentView({ ...payment, paymentState: "uncertain", status: "failed" }).canStartAnother, false);
  const legacy = { ...payment, status: "confirmed", request: undefined, paymentState: undefined, deliveryState: undefined };
  assert.equal(stellarPaymentView(legacy).fullyVerified, false);
  assert.equal(stellarPaymentView(legacy).canStartAnother, false);
  assert.equal(stellarPaymentView({ ...payment, status: "confirmed", paymentState: "confirmed", deliveryState: "pending" }).fullyVerified, false);
  assert.equal(stellarPaymentView({ ...payment, status: "confirmed", paymentState: "confirmed", deliveryState: "received" }).fullyVerified, true);
});

test("missing prerequisites are reported without preparing trustlines, claiming funds or preparing a payment", async () => {
  let prepared = 0;
  for (const x402Usdc of [{ ...status.x402Usdc, trustlineActive: false }, { ...status.x402Usdc, balance: "0" }, { ...status.x402Usdc, balance: "unavailable" }]) {
    const result = await prepareStellarPayment({ status: { ...status, x402Usdc }, existing: null, prepare: async () => { prepared += 1; return payment; } });
    assert.equal(result.reason, "requirements");
  }
  assert.equal(prepared, 0);
  const preparedResult = await prepareStellarPayment({ status, existing: null, prepare: async () => { prepared += 1; return payment; } });
  assert.equal(preparedResult.reason, "prepared");
  assert.equal(prepared, 1);
  const smallOffer = await prepareStellarPayment({ status: { ...status, x402Usdc: { ...status.x402Usdc, balance: "0.009" } }, existing: null, prepare: async () => ({ ...payment, amount: "0.005" }) });
  assert.equal(smallOffer.reason, "prepared", "the server checks the live offer price; the UI does not require the spending cap as balance");
});

test("a confirmed stored payment cannot hide another pending payment from the server", async () => {
  const confirmed = { ...payment, status: "confirmed", paymentState: "confirmed" as const, deliveryState: "received" as const };
  const pending = { ...payment, id: "newer-pending", status: "reconciliation_required", paymentState: "uncertain" as const };
  const result = await prepareStellarPayment({ status: { ...status, pendingPayment: pending }, existing: confirmed, prepare: async () => { throw new Error("second_payment_forbidden"); } });
  assert.equal(result.payment?.id, pending.id);
  assert.equal(result.reason, "existing");
});

test("a response from the previous session is rejected after the active user changes", async () => {
  const persisted = storage();
  rememberStellarPayment("user-a", payment, persisted);
  let currentUser = "user-a";
  const result = restoreStellarPayment({ userId: "user-a", storage: persisted, status, assertCurrentSession: () => { if (currentUser !== "user-a") throw new Error("session_changed"); }, readPayment: async () => { currentUser = "user-b"; return payment; } });
  await assert.rejects(result, /session_changed/);
  assert.equal(persisted.getItem(stellarPaymentStorageKey("user-b")), null);
});

test("verified delivery restores the entire body and replay detects changes after the historical preview limit", () => {
  const body = "a".repeat(4000) + "<script>untrusted text remains text</script>\ncomplete ending";
  const received: StellarPayment = { ...payment, status: "confirmed", paymentState: "confirmed", deliveryState: "received", transactionHash: "original-transaction", evidence: { sha256: "original-digest", status: 200, contentType: "text/plain", deliveredAt: "2026-09-08T00:00:00Z" }, resourceBody: body, resourcePreview: body.slice(0, 4000) };
  assert.equal(stellarPaymentContent(received), body);
  assert.equal(sameStellarPaymentDelivery(received, { ...received }), true);
  assert.equal(sameStellarPaymentDelivery(received, { ...received, resourceBody: "a".repeat(4000) + "changed ending" }), false);
  assert.equal(sameStellarPaymentDelivery(received, { ...received, resourceBody: null }), false);
  assert.equal(sameStellarPaymentDelivery(received, { ...received, evidence: { ...received.evidence!, sha256: "changed-digest" } }), false);
  assert.equal(stellarPaymentContent({ ...received, paymentState: "uncertain" }), null);
  assert.equal(stellarPaymentContent({ ...received, deliveryState: "pending" }), null);
  assert.equal(stellarPaymentContent({ ...received, evidence: null }), null);
  assert.equal(stellarPaymentContent({ ...received, resourceBody: undefined }), received.resourcePreview);
  assert.equal(stellarPaymentContent({ ...received, resourceBody: "" }), "");
  assert.equal(sameStellarPaymentDelivery({ ...received, resourceBody: undefined }, received), true);
});

test("chat payment recovery has no implicit funding and keeps reconciliation separate from explicit signing", async () => {
  const source = await readFile(new URL("../app/agent/agent-chat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /action: "(?:prepare_trustline|execute_trustline|claim_testnet_usdc)"|friendbot/);
  assert.match(source, /action: "reconcile", paymentId: x402Payment\.id/);
  assert.match(source, /stellarPaymentView\(x402Payment\)\.canSign/);
  assert.match(source, /x402Revision\.current === revision/);
  assert.match(source, /await signRawHash\([\s\S]*?signal\.throwIfAborted\(\)/);
  assert.match(source, /signature: signed\.signature }, undefined, signal/);
  assert.match(source, /x402View\.canStartAnother && x402Payment\.status === "prepared"/);
  assert.match(source, /<pre[^>]*>\{x402ResourceContent\}<\/pre>/);
});
