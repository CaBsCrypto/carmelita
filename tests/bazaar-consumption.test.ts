import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import type { PaymentRequired } from "@x402/core/types";
import { createBazaarConsumptionService, type BazaarOperation, type BazaarOperationStore } from "../app/bazaar/consumer-service";
import { canonical, type BazaarOrder, type CreateBazaarOrder } from "../app/bazaar/consumer-client";
import { freezeX402Request } from "../app/x402/request";
import { freezeRequirement } from "../app/x402/protocol";
import { verifyStellarSignature } from "../app/privy-stellar";
import { X402_TESTNET_USDC } from "../app/x402/assets";
import { BAZAAR_CATALOG_ORIGIN } from "../app/connectors/bazaar-catalog";

const serviceId = "guionista-bazaar-production-text-v1";
const cardHash = "a".repeat(64);
// Public synthetic test seeds. No live/funded keys or network calls are used.
const payer = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11));
const destination = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 12)).publicKey();
const digest = Buffer.alloc(32, 13);
const hash = (input: unknown) => createHash("sha256").update(canonical(input)).digest("hex");
const intent = { serviceId, cardHash, input: { topic: "A synthetic offline script" }, idempotencyKey: "offline-purchase-1" } as const;
const signature = `0x${payer.sign(digest).toString("hex")}`;

function fixture() {
  const rows = new Map<string, BazaarOperation>();
  const orders = new Map<string, BazaarOrder>();
  const calls = { active: 0, service: 0, wallet: 0, preflight: 0, create: 0, challenge: 0, sign: 0, pay: 0, order: 0 };
  let clock = Date.parse("2026-10-18T12:00:00Z"); let sequence = 0; let enabled = true; let installed = true;
  let lostPaymentResponse = false; let failCreateBeforeSave = false; let loseCreateResponse = false;
  const copy = <T>(value: T): T => structuredClone(value);
  const store: BazaarOperationStore = {
    insert: async operation => { const existing = [...rows.values()].find(row => row.userId === operation.userId && row.idempotencyKey === operation.idempotencyKey); if (existing) return copy(existing); rows.set(operation.id, copy(operation)); return copy(operation); },
    find: async (owner, id) => { const row = rows.get(id); if (!row || row.userId !== owner) throw new Error("bazaar_operation_not_found"); return copy(row); },
    update: async (operation, phase, state) => { const current = rows.get(operation.id); if (!current || current.userId !== operation.userId || current.version !== operation.version || current.phase !== operation.phase) throw new Error("bazaar_operation_conflict"); const next = { ...copy(operation), phase, state: copy(state), version: operation.version + 1, updatedAt: new Date(clock) }; rows.set(operation.id, next); return copy(next); },
    list: async owner => [...rows.values()].filter(row => row.userId === owner).map(copy),
  };
  function challenge(id: string): PaymentRequired {
    const op = rows.get(id)!; const url = `${BAZAAR_CATALOG_ORIGIN}/api/market/orders/${id}/x402`;
    return { x402Version: 2, resource: { url, description: "Synthetic text service", mimeType: "application/json" }, accepts: [{ scheme: "exact", network: "stellar:testnet", asset: X402_TESTNET_USDC.contract, amount: "10000", payTo: destination, maxTimeoutSeconds: 60, extra: { areFeesSponsored: true, method: "POST", route: `/api/market/orders/${id}/x402`, resourceUrl: url, inputHash: hash(op.state.intent.input), operationId: id, cardHash } }] };
  }
  const card = { id: serviceId, name: "Synthetic Guionista", description: "Offline fixture", provider: "Synthetic", kind: "http" as const, network: "stellar:testnet" as const, input: [{ name: "topic", type: "string" as const, required: true }], tags: [], payment: { scheme: "exact" as const, asset: "USDC", amount: "0.001", destination }, delivery: null, consumable: false as const, executionEnabled: false as const, cardHash, submissionId: "synthetic", declaredStatus: "activated", declaredExecution: "seller-mcp-task", declaredAvailability: null, purchaseDescriptor: null, readiness: {} as never };
  const dep: Parameters<typeof createBazaarConsumptionService>[0] = {
    store, enabled: () => enabled, now: () => clock, uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    active: async owner => { calls.active++; if (!installed || owner !== "owner-a") throw new Error("app_installation_required"); },
    service: async (id, options) => { calls.service++; assert.equal(id, serviceId); assert.equal(options?.refresh, true); return { service: copy(card) } as never; },
    wallet: async owner => { calls.wallet++; assert.equal(owner, "owner-a"); return payer.publicKey(); },
    preflight: async owner => { calls.preflight++; assert.equal(owner, "owner-a"); },
    prepareSignature: async value => ({ format: "stellar-x402-client-signature-v1", x402Version: 2, transactionJson: "{}", authorizationHash: `0x${digest.toString("hex")}`, maxLedger: 200, requirement: freezeRequirement(value.requirement), request: freezeX402Request(value.x402Version, value.requirement) }),
    sign: async value => { calls.sign++; if (!verifyStellarSignature(value.address, Buffer.from(value.prepared.authorizationHash.slice(2), "hex"), Buffer.from(value.signature.slice(2), "hex"))) throw new Error("stellar_client_signature_verification_failed"); return { x402Version: 2, transaction: "synthetic-signed-transaction", requirement: value.prepared.requirement }; },
    client: async owner => { assert.equal(owner, "owner-a"); return {
      create: async (input: CreateBazaarOrder) => { calls.create++; if (failCreateBeforeSave) throw new Error("bazaar_consumer_unavailable"); let order = orders.get(input.operationId); if (!order) { order = { operationId: input.operationId, buyerOwnerId: "synthetic-bazaar-owner", serviceId: input.serviceId, cardHash: input.cardHash, inputHash: hash(input.input), payer: input.payer, amount: "0.001", destination, phase: "awaiting-payment", paymentProtocol: "x402-stellar-exact-v2" }; orders.set(input.operationId, copy(order)); } if (loseCreateResponse) throw new Error("bazaar_consumer_unavailable"); return copy(order); },
      challenge: async id => { calls.challenge++; return challenge(id); },
      pay: async id => { calls.pay++; const paid = { ...orders.get(id)!, phase: "paid", transactionHash: "f".repeat(64), paymentVerifiedAt: new Date(clock).toISOString() }; orders.set(id, copy(paid)); if (lostPaymentResponse) throw new Error("bazaar_consumer_timeout"); return paid; },
      order: async id => { calls.order++; const order = orders.get(id); if (!order) throw new Error("bazaar_consumer_http_404"); return copy(order); },
    }; },
  };
  return { rows, orders, calls, dep, card, service: createBazaarConsumptionService(dep), disable: () => { enabled = false; }, uninstall: () => { installed = false; }, advance: (ms: number) => { clock += ms; }, losePayment: () => { lostPaymentResponse = true; }, failCreate: () => { failCreateBeforeSave = true; }, restoreCreate: () => { failCreateBeforeSave = false; loseCreateResponse = false; }, loseCreate: () => { loseCreateResponse = true; }, restart: () => createBazaarConsumptionService(dep) };
}
const execute = (operationId: string, sig = signature) => ({ operationId, signature: sig, explicitConfirmation: true as const });

test("missing app or disabled consumption rejects before provider, wallet, policy, signature or payment access", async () => {
  for (const kind of ["disabled", "missing"] as const) { const f = fixture(); if (kind === "disabled") f.disable(); else f.uninstall(); await assert.rejects(f.service.prepare("owner-a", intent), /disabled|installation_required/); assert.equal(f.calls.service + f.calls.wallet + f.calls.preflight + f.calls.create + f.calls.sign + f.calls.pay, 0); assert.equal(f.rows.size, 0); }
});
test("prepare only creates an unpaid order and a hash to sign, never auto-pay; owner and drafts remain frozen", async () => {
  const f = fixture(); const prepared = await f.service.prepare("owner-a", intent); assert.equal(prepared.phase, "awaiting_confirmation"); assert.equal(prepared.signingHash, `0x${digest.toString("hex")}`); assert.deepEqual(prepared.input, intent.input); assert.equal(f.calls.pay, 0); assert.equal(f.calls.sign, 0); await assert.rejects(f.service.execute("owner-b", execute(prepared.operationId)), /installation_required/); assert.equal(f.calls.pay, 0);
});
test("expired, changed card hash, changed challenge terms and wrong Ed25519 signature cannot send payment", async () => {
  for (const kind of ["expired", "card", "challenge", "signature"] as const) { const f = fixture(); const op = await f.service.prepare("owner-a", intent); if (kind === "expired") f.advance(60_000); if (kind === "card") f.card.cardHash = "b".repeat(64); if (kind === "challenge") f.rows.get(op.operationId)!.state.challenge!.accepts[0].payTo = payer.publicKey(); const wrong = `0x${Keypair.fromRawEd25519Seed(Buffer.alloc(32, 14)).sign(digest).toString("hex")}`; await assert.rejects(f.service.execute("owner-a", execute(op.operationId, kind === "signature" ? wrong : signature)), /expired|changed|verification_failed/); assert.equal(f.calls.pay, 0); }
});
test("two simultaneous confirmations share the durable claim and send exactly one POST", async () => {
  const f = fixture(); const op = await f.service.prepare("owner-a", intent); const results = await Promise.allSettled([f.service.execute("owner-a", execute(op.operationId)), f.service.execute("owner-a", execute(op.operationId))]); assert.equal(f.calls.pay, 1); assert.equal(results.filter(value => value.status === "fulfilled").length, 1); assert.equal(f.rows.get(op.operationId)?.phase, "paid"); await f.service.execute("owner-a", execute(op.operationId)); assert.equal(f.calls.pay, 1);
});
test("lost payment response stays uncertain and recovery uses GET without a second POST after restart", async () => {
  const f = fixture(); const op = await f.service.prepare("owner-a", intent); f.losePayment(); const uncertain = await f.service.execute("owner-a", execute(op.operationId)); assert.equal(uncertain.phase, "uncertain"); assert.equal(uncertain.signingHash, null); const restarted = f.restart(); await assert.rejects(restarted.execute("owner-a", execute(op.operationId)), /recovery_required/); const recovered = await restarted.recover("owner-a", op.operationId); assert.equal(recovered.phase, "paid"); assert.equal(f.calls.pay, 1); assert.equal(f.calls.order, 1);
});
test("lost create response recovers the same remote UUID and draft instead of creating a second order", async () => {
  const f = fixture(); f.loseCreate(); await assert.rejects(f.service.prepare("owner-a", intent)); const original = [...f.rows.values()][0]; f.restoreCreate(); const restored = await f.restart().resume("owner-a", original.id); assert.equal(restored.operationId, original.id); assert.deepEqual(restored.input, intent.input); assert.equal(f.orders.size, 1); assert.equal(f.calls.pay, 0);
});
test("frozen input and authorization requirement changes must fail before payment", async () => {
  for (const kind of ["input", "authorization"] as const) { const f = fixture(); const op = await f.service.prepare("owner-a", intent); if (kind === "input") f.rows.get(op.operationId)!.state.intent.input.topic = "A different request"; else f.rows.get(op.operationId)!.state.authorization!.requirement.payTo = payer.publicKey(); await assert.rejects(f.service.execute("owner-a", execute(op.operationId)), /changed|invalid/); assert.equal(f.calls.pay, 0); }
});
test("create failure before remote persistence can recover using the original UUID", async () => {
  const f = fixture(); f.failCreate(); await assert.rejects(f.service.prepare("owner-a", intent)); const original = [...f.rows.values()][0]; f.restoreCreate(); const restored = await f.restart().resume("owner-a", original.id); assert.equal(restored.operationId, original.id); assert.equal(f.orders.size, 1); assert.equal(f.calls.pay, 0);
});

import { BazaarConsumerClient, publicBazaarOrder, publicBazaarArchivedOrder, type BazaarArchivedOrder } from "../app/bazaar/consumer-client";
import type { BazaarCredential } from "../app/apps/types";

const credential: BazaarCredential = { ownerId: "synthetic-bazaar-owner", workspaceId: "synthetic-workspace", agentId: "synthetic-agent", generation: 1, credential: "synthetic-not-real-access", channel: "web", clientId: "carmelita-web", grantId: "synthetic-grant", grantRevision: 1, scopes: ["catalog:read", "orders:create", "orders:read", "deliveries:read", "payments:challenge", "payments:submit"] };
const nativeOrder: BazaarOrder = { operationId: "00000000-0000-4000-8000-000000000001", buyerOwnerId: credential.ownerId, serviceId, cardHash, payer: payer.publicKey(), inputHash: hash(intent.input), amount: "0.001", destination, phase: "awaiting-payment", paymentProtocol: "x402-stellar-exact-v2" };

test("owner consumer uses only the fixed Bazaar origin and ChatGPT credentials cannot send order or payment POSTs", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ order: nativeOrder }); };
  const web = new BazaarConsumerClient(credential, fetcher);
  await web.order(nativeOrder.operationId);
  assert.equal(new URL(calls[0].url).origin, BAZAAR_CATALOG_ORIGIN);
  assert.equal(calls[0].init?.redirect, "error"); assert.equal(calls[0].init?.credentials, "omit");
  assert.equal(new Headers(calls[0].init?.headers).get("Authorization"), `Bearer ${credential.credential}`);
  const chat = new BazaarConsumerClient({ ...credential, channel: "chatgpt", clientId: "carmelita-chatgpt", scopes: ["catalog:read", "orders:read", "deliveries:read"] }, fetcher);
  await assert.rejects(chat.create({ operationId: nativeOrder.operationId, ...intent, payer: payer.publicKey(), paymentProtocol: "x402-stellar-exact-v2" }), /write_forbidden/);
  await assert.rejects(chat.challenge(nativeOrder.operationId), /write_forbidden/);
  await assert.rejects(chat.pay(nativeOrder.operationId, {} as never), /write_forbidden/);
  assert.equal(calls.length, 1);
});
test("remote ownership mismatch exits before a private delivery fetch and projections expose no payer, input or signer fields", async () => {
  let calls = 0;
  const client = new BazaarConsumerClient(credential, async () => { calls++; return Response.json({ order: { ...nativeOrder, buyerOwnerId: "foreign-owner" } }); });
  await assert.rejects(client.delivery(nativeOrder.operationId), /owner_mismatch/); assert.equal(calls, 1);
  const orderOnly = publicBazaarOrder(nativeOrder); assert.equal(orderOnly.payment.confirmed, false); assert.equal(orderOnly.delivery.available, false);
  assert.doesNotMatch(JSON.stringify(orderOnly), /synthetic-not-real|payer|destination|inputHash|transactionHash|signing|checkout|https:/);
  const fakeDelivery = publicBazaarOrder({ ...nativeOrder, phase: "delivered", delivery: { text: "Unpaid result" } }); assert.equal(fakeDelivery.payment.confirmed, false); assert.equal(fakeDelivery.delivery.available, false);
});
test("invalid remote payment evidence cannot be surfaced as a confirmed payment", async () => {
  const client = new BazaarConsumerClient(credential, async () => Response.json({ order: { ...nativeOrder, phase: "paid", transactionHash: "f".repeat(64), paymentVerifiedAt: "true" } }));
  await assert.rejects(client.order(nativeOrder.operationId), /datetime/);
});
function archive(operation: BazaarOperation, phase: BazaarArchivedOrder["paymentPhase"] = "uncertain"): BazaarArchivedOrder {
  return { operationId: operation.id, buyerOwnerId: "synthetic-bazaar-owner", sellerOwnerId: "synthetic-seller", intentHash: operation.state.remoteIntentHash!, cardHash: operation.state.terms.cardHash,
    inputHash: operation.state.terms.inputHash, orderBinding: "a".repeat(64), payer: operation.state.terms.payer, destination: operation.state.terms.destination, amount: "0.001",
    paymentProtocol: "x402-stellar-exact-v2", paymentPhase: phase, archivedAt: "2026-10-18T12:00:00.000Z", ...(phase === "confirmed" ? { paymentVerifiedAt: "2026-10-18T12:00:00.000Z", transactionHash: "f".repeat(64) } : {}) };
}
test("seven-day redaction preserves metadata-only recovery without signatures, input, delivery or another POST", async () => {
  const f = fixture(); const prepared = await f.service.prepare("owner-a", intent); const row = f.rows.get(prepared.operationId)!; const archived = archive(row, "confirmed");
  row.phase = "uncertain"; row.state.contentExpired = true; row.state.intent.input = {}; delete row.state.authorization; delete row.state.challenge;
  const original = f.dep.client; f.dep.client = async owner => ({ ...await original(owner), recoverOrder: async () => { f.calls.order++; return { kind: "content_expired", operation: archived }; } });
  f.disable(); const recovered = await f.restart().recover("owner-a", row.id);
  assert.equal(recovered.phase, "paid"); assert.equal(recovered.order?.payment.confirmed, true); assert.equal(recovered.order?.delivery.available, false);
  assert.deepEqual(recovered.input, {}); assert.equal(recovered.signingHash, null); assert.equal(f.calls.order, 1); assert.equal(f.calls.pay, 0); assert.equal(f.calls.sign, 0); assert.equal(f.calls.create, 1);
  assert.equal(f.rows.get(row.id)?.state.authorization, undefined); assert.equal(f.rows.get(row.id)?.state.challenge, undefined);
  await assert.rejects(f.restart().resume("owner-a", row.id), /content_expired/); assert.equal(f.calls.order, 1);
});
test("archived uncertainty stays unconfirmed and changed owner, UUID or frozen terms reject recovery", async () => {
  for (const changed of [{}, { buyerOwnerId: "foreign-owner" }, { operationId: "00000000-0000-4000-8000-000000000099" }, { cardHash: "b".repeat(64) }, { inputHash: "b".repeat(64) }, { intentHash: "b".repeat(64) }, { amount: "0.002" }]) {
    const f = fixture(); const prepared = await f.service.prepare("owner-a", intent); const row = f.rows.get(prepared.operationId)!; const archived = { ...archive(row), ...changed };
    row.phase = "uncertain"; row.state.contentExpired = true; row.state.intent.input = {}; delete row.state.authorization; delete row.state.challenge;
    const original = f.dep.client; f.dep.client = async owner => ({ ...await original(owner), recoverOrder: async () => ({ kind: "content_expired", operation: archived }) });
    if (Object.keys(changed).length) await assert.rejects(f.restart().recover("owner-a", row.id), /binding_changed/);
    else { const result = await f.restart().recover("owner-a", row.id); assert.equal(result.phase, "uncertain"); assert.equal(result.order?.payment.confirmed, false); await assert.rejects(f.restart().execute("owner-a", execute(row.id)), /content_expired/); await assert.rejects(f.restart().prepare("owner-a", intent), /content_expired/); }
    assert.equal(f.calls.pay, 0); assert.equal(f.calls.sign, 0);
  }
});
test("the closed 410 recovery contract is an owner-bound GET and incomplete confirmation never proves payment", async () => {
  const f = fixture(); const prepared = await f.service.prepare("owner-a", intent); const archived = archive(f.rows.get(prepared.operationId)!, "confirmed");
  let current: unknown = archived; let calls = 0;
  const client = new BazaarConsumerClient(credential, async (_url, init) => { calls++; assert.equal(init?.method, "GET"); assert.equal(init?.body, undefined); return Response.json({ error: { code: "ORDER_CONTENT_EXPIRED" }, recoveryOnly: true, operation: current }, { status: 410 }); });
  assert.equal((await client.recoverOrder(archived.operationId)).kind, "content_expired");
  assert.equal(publicBazaarArchivedOrder({ ...archived, paymentVerifiedAt: undefined }, serviceId).payment.confirmed, false);
  assert.equal(publicBazaarArchivedOrder({ ...archived, transactionHash: undefined }, serviceId).payment.confirmed, false);
  current = { ...archived, buyerOwnerId: "foreign-owner" }; await assert.rejects(client.recoverOrder(archived.operationId), /owner_mismatch/);
  current = { ...archived, paymentVerifiedAt: "yes" }; await assert.rejects(client.recoverOrder(archived.operationId), /datetime/);
  current = { ...archived, input: { private: "must never restore content" } }; await assert.rejects(client.recoverOrder(archived.operationId), /Unrecognized/);
  assert.equal(calls, 4);
});
test("consumer deadlines cover transports and body streams that ignore AbortSignal", async () => {
  const stalledFetch = new BazaarConsumerClient(credential, async () => new Promise<Response>(() => {}), 10);
  await assert.rejects(stalledFetch.order(nativeOrder.operationId), /consumer_timeout/);
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start() {}, cancel() { cancelled = true; return new Promise<void>(() => {}); } });
  const stalledBody = new BazaarConsumerClient(credential, async () => new Response(stream, { headers: { "Content-Type": "application/json" } }), 10);
  await assert.rejects(stalledBody.order(nativeOrder.operationId), /consumer_timeout/); assert.equal(cancelled, true);
});
test("input canonicalization matches Bazaar code-point order independently of locale", () => {
  assert.equal(canonical({ a: 1, B: 2, "é": 3, z: 4 }), '{"B":2,"a":1,"z":4,"é":3}');
});
