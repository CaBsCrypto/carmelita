import assert from "node:assert/strict";
import test from "node:test";
import { BAZAAR_REQUIRED_CONSUMPTION_CONTRACT, normalizeBazaarOperationReport } from "../app/bazaar/contract";
import { assertBazaarOperationEnabled, bazaarPurchaseReadiness, evaluateBazaarServiceReadiness } from "../app/bazaar/readiness";

test("published services, suites and skills cannot become executable from provider availability metadata", () => {
  for (const kind of ["service", "suite", "skill"] as const) {
    for (const providerAvailability of ["available", "verified", true, { accepted: true }, "unknown", undefined]) {
      const readiness = evaluateBazaarServiceReadiness({ published: true, kind, providerAvailability });
      assert.equal(readiness.publication, "published");
      assert.equal(readiness.providerAvailability, "not_verified");
      assert.equal(readiness.executable, false);
      assert.equal(readiness.purchase.enabled, false);
    }
  }
  assert.equal(evaluateBazaarServiceReadiness({ published: false, kind: "service", providerAvailability: "unavailable" }).providerAvailability, "unavailable");
});

test("client claims cannot link owners or unlock preparation, execution, status or history", () => {
  for (const forged of [
    { email: "owner@example.test", wallet: "G" + "A".repeat(55) },
    { connected: true, ownerId: "another-owner", signatureVerified: true },
    { magicLink: "https://example.test/history#fixture-only", permission: "read" },
    { scopes: ["agent:read"], paidCall: true, signing: true, version: "0.7.0" },
    { method: "server_oauth", verified: true, ownerId: "another-owner" },
  ]) {
    // Extra runtime arguments are attacker-controlled data, not server proof.
    const readiness = Reflect.apply(bazaarPurchaseReadiness, undefined, [forged]);
    assert.equal(readiness.identityLink.status, "unavailable");
    assert.equal(readiness.enabled, false);
    for (const phase of ["prepare", "execute", "status", "history"] as const) {
      assert.equal(readiness.operations[phase].enabled, false);
      assert.throws(() => Reflect.apply(assertBazaarOperationEnabled, undefined, [phase, forged]), /bazaar_(?:native_purchase_blocked|owner_link_contract_unavailable)/);
    }
  }
});

test("release gates are not shared mutable flags and agent read is never spending permission", () => {
  const first = bazaarPurchaseReadiness();
  // A consumer changing a previous DTO cannot alter the next authorization gate.
  Object.assign(first, { enabled: true });
  Object.assign(first.identityLink, { status: "connected" });
  assert.equal(bazaarPurchaseReadiness().enabled, false);
  assert.equal(bazaarPurchaseReadiness().identityLink.status, "unavailable");
  assert.equal(BAZAAR_REQUIRED_CONSUMPTION_CONTRACT.historyCredentialAuthorizesPurchase, false);
  assert.equal(BAZAAR_REQUIRED_CONSUMPTION_CONTRACT.operations.prepare.spendingAuthorized, false);
  assert.equal(BAZAAR_REQUIRED_CONSUMPTION_CONTRACT.operations.execute.separateWritePermission, true);
});

const report = {
  operationId: "operation-a", orderStatus: "ordered", paymentStatus: "reported-unverified", deliveryStatus: "reported-delivered",
};

test("an order or delivered result never becomes a verified payment or receipt", () => {
  const result = normalizeBazaarOperationReport(report);
  assert.equal(result.order.status, "ordered");
  assert.equal(result.delivery.status, "reported-delivered");
  assert.equal(result.payment.status, "reported-unverified");
  assert.equal(result.payment.independentlyVerified, false);
  assert.equal(result.paymentConfirmed, false);
  assert.equal(result.receipt, null);
  assert.equal(result.authorization.usable, false);
});

test("missing protocol and expired reports cannot authorize another attempt or replay", () => {
  const expired = normalizeBazaarOperationReport({ ...report, expiresAt: "2026-10-04T10:00:00Z" }, Date.parse("2026-10-05T10:00:00Z"));
  assert.equal(expired.authorization.expired, true);
  assert.ok(expired.authorization.blockers.includes("bazaar_operation_protocol_missing"));
  assert.ok(expired.authorization.blockers.includes("bazaar_operation_approval_expired"));
  const current = normalizeBazaarOperationReport({ ...report, protocolVersion: "bazaar.operation-report/v1", expiresAt: "2026-10-06T10:00:00Z" }, Date.parse("2026-10-05T10:00:00Z"));
  assert.equal(current.authorization.expired, false);
  assert.equal(current.authorization.usable, false);
  assert.deepEqual(current.authorization.blockers, ["bazaar_authenticated_operation_contract_unavailable"]);
});

test("unverified reports reject fabricated confirmations, unknown versions, credentials and malformed expiry", () => {
  for (const invalid of [
    { ...report, paymentStatus: "paid" }, { ...report, paymentStatus: "confirmed" },
    { ...report, protocolVersion: "arbitrary/v0" }, { ...report, ownerId: "other-owner" },
    { ...report, authorizationToken: "fixture-only" }, { ...report, receipt: { status: "paid" } },
    { ...report, expiresAt: "not-a-date" },
  ]) assert.throws(() => normalizeBazaarOperationReport(invalid), /^Error: bazaar_operation_report_invalid$/);
});
