import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import type { PaymentRequirements } from "@x402/core/types";
import { Keypair } from "@stellar/stellar-sdk";
import { createX402ExecutionService, safeX402Error, type X402PaymentRow } from "../app/x402/service";
import { publicX402Payment } from "../app/x402/view";
import { freezeRequirement } from "../app/x402/protocol";
import { freezeX402Request, x402RequestHash, assertX402Preconditions } from "../app/x402/request";
import { X402_TESTNET_USDC, X402_TESTNET_RESOURCE } from "../app/x402/assets";
import type { StellarX402ExecutionEvidence } from "../app/x402/reconciliation";

const address = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 9)).publicKey();
const requirement: PaymentRequirements = { scheme: "exact", network: X402_TESTNET_USDC.network,
  asset: X402_TESTNET_USDC.contract, amount: "100000", payTo: address, maxTimeoutSeconds: 60, extra: { areFeesSponsored: true } };
const request = freezeX402Request(2, requirement);
const signature = `0x${"ab".repeat(64)}`;

function fixture() {
  let row: X402PaymentRow = {
    id: "12345678-1234-4234-8234-123456789abc", userId: "did:privy:qa-a", walletId: "wallet-a", walletAddress: address,
    resourceUrl: X402_TESTNET_RESOURCE, network: requirement.network, assetContract: requirement.asset,
    payTo: address, amountAtomic: "100000", amountDisplay: "0.0100000", status: "prepared",
    idempotencyKey: "fixture-only", paymentRequired: { format: "stellar-x402-client-signature-v1", x402Version: 2,
      requirement: freezeRequirement(requirement), request, transactionJson: "private unsigned envelope", authorizationHash: `0x${"a".repeat(64)}`, maxLedger: 200 },
    settlement: null, transactionHash: null, resourcePreview: null, expiresAt: new Date(Date.now() + 60_000), error: null,
    createdAt: new Date(), updatedAt: new Date(), confirmedAt: null,
    paymentState: "pending", deliveryState: "pending", execution: null, verification: null, resourceBody: null, reconciliationCursor: null,
  };
  const execution: StellarX402ExecutionEvidence = { signedTransaction: "private signed envelope", authorizationHash: `0x${"a".repeat(64)}`,
    nonce: "123", maxLedger: 200, firstLedger: 100, network: requirement.network, walletAddress: address,
    assetContract: requirement.asset, payTo: address, amountAtomic: "100000", requestHash: x402RequestHash(request), claimedAt: new Date().toISOString() };
  let paidCalls = 0, captureCalls = 0, failSend = false, failRpc = false;
  const tx = "b".repeat(64);
  const settlement = { success: true, transaction: tx, network: requirement.network, payer: address };
  const resourceBody = '{"result":"test delivery"}';
  const sha = createHash("sha256").update(resourceBody).digest("hex");
  const deps: Parameters<typeof createX402ExecutionService>[0] = {
    findPayment: async (owner, id) => { if (owner !== row.userId || id !== row.id) throw new Error("x402_payment_not_found"); return { ...row }; },
    preflight: async () => {},
    sign: async () => ({ x402Version: 2, transaction: execution.signedTransaction, requirement: freezeRequirement(requirement) }),
    capture: async () => { captureCalls++; return execution; },
    claim: async () => { if (row.status !== "prepared") return false; row = { ...row, status: "signing", execution: { ...execution } }; return true; },
    settlement: async ({ settlement: receipt }) => { row.settlement = receipt as Record<string, unknown>; return true; },
    delivery: async () => { row = { ...row, resourceBody, resourcePreview: resourceBody, deliveryState: "received" }; return true; },
    uncertain: async ({ reason }) => { if (row.paymentState !== "confirmed") row = { ...row, status: "reconciliation_required", paymentState: "uncertain", error: reason }; return true; },
    pay: async ({ onSettlement }) => { paidCalls++; await onSettlement?.(settlement); if (failSend) throw new Error("x402_transport_timeout"); return { settlement, resourceBody, resourcePreview: resourceBody, resourceSha256: sha, resourceStatus: 200, resourceContentType: "application/json" }; },
    recover: async () => { if (failRpc) throw new Error("x402_rpc_unavailable"); return { status: "verified", transactionHash: tx, verification: { transactionHash: tx }, cursor: null }; },
    recordReconciliation: async ({ outcome }) => { if (outcome.status === "verified") row = { ...row, paymentState: "confirmed", status: row.deliveryState === "received" ? "confirmed" : "reconciliation_required", transactionHash: tx, verification: outcome.verification!, confirmedAt: new Date() }; return true; },
  };
  return { deps, service: () => createX402ExecutionService(deps), get row() { return row; }, get paidCalls() { return paidCalls; }, get captureCalls() { return captureCalls; },
    setFailSend: () => { failSend = true; }, setFailRpc: (value: boolean) => { failRpc = value; } };
}

test("one execution and exact replay retain receipt and delivery without another paid request", async () => {
  const f = fixture(), service = f.service();
  const first = await service.execute(f.row.userId, f.row.id, signature);
  assert.equal(first.payment.status, "confirmed");
  assert.equal(first.replayed, false);
  const repeated = await service.execute(f.row.userId, f.row.id);
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.payment.resourceBody, first.payment.resourceBody);
  assert.equal(repeated.payment.transactionHash, first.payment.transactionHash);
  assert.equal(f.paidCalls, 1);
});

test("concurrent execution cannot produce two paid requests", async () => {
  const f = fixture();
  const results = await Promise.allSettled([f.service().execute(f.row.userId, f.row.id, signature), f.service().execute(f.row.userId, f.row.id, signature)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.paidCalls, 1);
});

test("timeout after send survives service restart and recovers payment without claiming delivery", async () => {
  const f = fixture(); f.setFailSend();
  await assert.rejects(f.service().execute(f.row.userId, f.row.id, signature), /transport_timeout/);
  assert.equal(f.row.status, "reconciliation_required");
  assert.equal(f.row.execution?.signedTransaction, "private signed envelope");
  const recovered = await f.service().reconcile(f.row.userId, f.row.id);
  assert.equal(recovered.payment.paymentState, "confirmed");
  assert.equal(recovered.payment.deliveryState, "pending");
  assert.equal(recovered.payment.status, "reconciliation_required");
  await f.service().reconcile(f.row.userId, f.row.id);
  await assert.rejects(f.service().execute(f.row.userId, f.row.id, signature), /reconciliation_required/);
  assert.equal(f.paidCalls, 1);
});

test("received body persists before verification and can complete after a failed RPC read", async () => {
  const f = fixture(); f.setFailRpc(true);
  const first = await f.service().execute(f.row.userId, f.row.id, signature);
  assert.equal(first.payment.paymentState, "uncertain");
  assert.equal(first.payment.deliveryState, "received");
  const body = f.row.resourceBody;
  f.setFailRpc(false);
  const recovered = await f.service().reconcile(f.row.userId, f.row.id);
  assert.equal(recovered.payment.status, "confirmed");
  assert.equal(recovered.payment.resourceBody, body);
  assert.equal(f.paidCalls, 1);
});

test("other owners, expired approvals and changed destination cannot claim execution", async () => {
  const f = fixture();
  await assert.rejects(f.service().execute("did:privy:qa-b", f.row.id, signature), /not_found/);
  await assert.rejects(f.service().reconcile("did:privy:qa-b", f.row.id), /not_found/);
  f.row.expiresAt = new Date(0);
  await assert.rejects(f.service().execute(f.row.userId, f.row.id, signature), /expired/);
  f.row.expiresAt = new Date(Date.now() + 60_000);
  f.row.payTo = "changed";
  await assert.rejects(f.service().execute(f.row.userId, f.row.id, signature), /request_changed/);
  assert.equal(f.captureCalls, 0);
  assert.equal(f.paidCalls, 0);
});

test("public projection and sanitized failures never disclose private execution material", async () => {
  const f = fixture();
  await f.service().execute(f.row.userId, f.row.id, signature);
  const json = JSON.stringify(publicX402Payment(f.row));
  assert.equal(json.includes("private signed envelope"), false);
  assert.equal(json.includes("private unsigned envelope"), false);
  assert.equal(json.includes("execution"), false);
  f.row.resourceBody = "x".repeat(4_100);
  f.row.resourcePreview = f.row.resourceBody.slice(0, 4_000);
  assert.equal(publicX402Payment(f.row).resourceBody, f.row.resourceBody);
  assert.equal(safeX402Error(new Error("transport error: private signed envelope")), "x402_request_failed");
  f.row.paymentState = "uncertain"; f.row.verification = null;
  assert.equal(publicX402Payment(f.row).status, "reconciliation_required");
  assert.equal(publicX402Payment(f.row).transactionHash, null);
  assert.equal(publicX402Payment(f.row).resourceBody, null);
});

test("missing account, trustline or balance stops preflight without funding", () => {
  assert.throws(() => assertX402Preconditions({ exists: false, balances: [] }, "100000"), /not_active/);
  assert.throws(() => assertX402Preconditions({ exists: true, balances: [] }, "100000"), /trustline_required/);
  assert.throws(() => assertX402Preconditions({ exists: true, balances: [{ asset: "USDC", issuer: X402_TESTNET_USDC.issuer, balance: "0.0099999" }] }, "100000"), /insufficient/);
  assert.doesNotThrow(() => assertX402Preconditions({ exists: true, balances: [{ asset: "USDC", issuer: X402_TESTNET_USDC.issuer, balance: "0.0100000" }] }, "100000"));
});

test("request identity includes timeout, scheme, sponsor, version, resource and method", () => {
  for (const changed of [{ ...request, url: "https://external.invalid" }, { ...request, method: "POST" }, { ...request, version: 1 }, { ...request, sponsored: false }, { ...request, scheme: "upto" }]) {
    assert.throws(() => x402RequestHash(changed as typeof request));
  }
  assert.notEqual(x402RequestHash({ ...request, maxTimeoutSeconds: 120 }), x402RequestHash(request));
});
