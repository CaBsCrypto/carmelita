import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AVALANCHE_X402, getAvalancheX402LiveConfig } from "../app/x402-avalanche/config";
import {
  AVALANCHE_REPORT_AMOUNT,
  buildAvalancheX402Requirement,
  createAvalanchePaymentRequired,
} from "../app/x402-avalanche/protocol";

const PAY_TO = `0x${"b".repeat(40)}`;
const REPORT_URL = "http://localhost:3001/api/demo/avalanche-report";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("protected report authenticates before exposing its x402 challenge", () => {
  const route = source("app/api/demo/avalanche-report/route.ts");
  const authIndex = route.indexOf("verifyPrivyAccessToken");
  const configIndex = route.indexOf("getAvalancheX402LiveConfig();");
  const signatureIndex = route.indexOf('request.headers.get("payment-signature")');

  assert.ok(authIndex >= 0, "Privy authentication must be present");
  assert.ok(authIndex < configIndex, "authentication must precede live configuration");
  assert.ok(configIndex < signatureIndex, "fail-closed configuration must precede the challenge");
  assert.match(route, /if \(!signatureHeader\) return challenge\(/);
  assert.match(route, /status:\s*402/);
  assert.match(route, /"PAYMENT-REQUIRED":\s*required\.header/);
  assert.match(route, /"Cache-Control":\s*"no-store"/);
});

test("challenge is pinned to x402 v2 exact, Fuji, official test USDC and 0.01 USDC", () => {
  const requirement = buildAvalancheX402Requirement(PAY_TO);
  const challenge = createAvalanchePaymentRequired({
    resourceUrl: REPORT_URL,
    payTo: PAY_TO,
  });

  assert.equal(challenge.paymentRequired.x402Version, 2);
  assert.equal(requirement.scheme, "exact");
  assert.equal(requirement.network, "eip155:43113");
  assert.equal(AVALANCHE_X402.chainId, 43113);
  assert.equal(requirement.asset.toLowerCase(), "0x5425890298aed601595a70ab815c96711a31bc65");
  assert.equal(AVALANCHE_X402.asset.decimals, 6);
  assert.equal(AVALANCHE_REPORT_AMOUNT, "10000");
  assert.equal(requirement.amount, "10000");
  assert.equal(Number(requirement.amount) / 10 ** AVALANCHE_X402.asset.decimals, 0.01);
  assert.deepEqual(challenge.paymentRequired.accepts, [requirement]);
});

test("preparation exposes explicit approval and never signs server-side", () => {
  const prepareRoute = source("app/api/agent/avalanche/x402/route.ts");
  const client = source("app/agent/avalanche-x402-client.ts");
  const payment = source("app/x402-avalanche/payment.ts");

  assert.match(prepareRoute, /requiresExplicitApproval:\s*true/);
  assert.match(client, /requiresExplicitApproval:\s*true/);
  assert.match(client, /prepared\?\.requiresExplicitApproval !== true/);
  assert.match(prepareRoute, /discoverAvalancheX402\(\)/);
  assert.match(prepareRoute, /avalanche_x402_facilitator_not_ready/);
  assert.match(client, /prepared\.facilitator\.gasSponsored !== true/);
  assert.match(payment, /signature:\s*null/);
  assert.doesNotMatch(prepareRoute, /privateKey|secretKey|mnemonic|raw[_A-Z]?key/i);
  assert.doesNotMatch(payment, /privateKey|secretKey|mnemonic|raw[_A-Z]?key/i);
});

test("store makes first signature, settlement claim and delivery single-winner operations", () => {
  const store = source("app/x402-avalanche/store.ts");

  assert.match(store, /idempotency_key text NOT NULL UNIQUE/);
  assert.match(store, /signature_hash text UNIQUE/);
  assert.match(store, /transaction_hash text UNIQUE/);
  assert.match(store, /payment_id text NOT NULL UNIQUE/);
  assert.match(store, /status='prepared' AND signature_hash IS NULL/);
  assert.match(store, /avalanche_x402_signature_replacement_rejected/);
  assert.match(store, /status='signed' RETURNING \*/);
  assert.match(store, /avalanche_x402_settlement_in_progress/);
  assert.match(store, /onchain_evidence=\$3::jsonb/);
  assert.match(store, /WHERE id=\$4 AND user_id=\$5 AND status='settling'/);
  assert.match(store, /ON CONFLICT \(payment_id\) DO NOTHING/);
  assert.match(store, /WHERE id=\$1 AND user_id=\$2 AND status='settled'/);
});

test("same signature replays safely while a replacement is rejected", () => {
  const store = source("app/x402-avalanche/store.ts");
  const bindStart = store.indexOf("export async function bindAvalancheX402Signature");
  const claimStart = store.indexOf("export async function claimAvalancheX402Settlement");
  const bind = store.slice(bindStart, claimStart);

  assert.match(bind, /sha256\(input\.signatureHeader\)/);
  assert.match(bind, /row\.signature_hash !== signatureHash/);
  assert.match(bind, /row\.signature_header !== input\.signatureHeader/);
  assert.match(bind, /return \{ row, replayed: true \}/);
});

test("ambiguous settlement is quarantined for reconciliation and never silently delivered", () => {
  const route = source("app/api/demo/avalanche-report/route.ts");
  const store = source("app/x402-avalanche/store.ts");

  assert.match(route, /message\.includes\("ambiguous"\)/);
  assert.match(route, /createAvalancheMerchantReceiptVerifier/);
  assert.match(store, /avalanche_x402_onchain_evidence_missing/);
  assert.match(route, /status:\s*"reconciliation_required"/);
  assert.match(route, /message\.includes\("ambiguous"\) \? 503/);
  assert.match(store, /"reconciliation_required"/);
  assert.match(store, /payment\.status !== "settled" && payment\.status !== "delivered"/);
  assert.match(store, /avalanche_x402_delivery_not_allowed/);
});

test("live execution remains localhost Fuji-only and fail-closed", () => {
  assert.equal(getAvalancheX402LiveConfig({}).enabled, false);
  assert.equal(getAvalancheX402LiveConfig({
    AVALANCHE_X402_LIVE_ENABLED: "true",
    AVALANCHE_X402_ENVIRONMENT: "mainnet",
    AVALANCHE_X402_PAY_TO: PAY_TO,
  }).enabled, false);
  assert.equal(getAvalancheX402LiveConfig({
    AVALANCHE_X402_LIVE_ENABLED: "true",
    AVALANCHE_X402_ENVIRONMENT: "localhost-fuji",
    AVALANCHE_X402_PAY_TO: PAY_TO,
  }).enabled, true);

  const protectedSources = [
    source("app/api/demo/avalanche-report/route.ts"),
    source("app/api/agent/avalanche/x402/route.ts"),
    source("app/x402-avalanche/store.ts"),
  ].join("\n");
  assert.doesNotMatch(protectedSources, /eip155:43114|avalanche:mainnet/i);
  assert.doesNotMatch(protectedSources, /privateKey|secretKey|mnemonic|raw[_A-Z]?key/i);
});
