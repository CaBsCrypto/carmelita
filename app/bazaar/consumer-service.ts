import { createHash, randomUUID } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import type { PaymentRequired } from "@x402/core/types";
import { z } from "zod";
import { assertOwnAppActive, readOwnBazaarCredential } from "@/app/apps/service";
import { getBazaarService, BAZAAR_CATALOG_ORIGIN } from "@/app/connectors/bazaar-catalog";
import { listPersistedUserWallets } from "@/app/multichain-account";
import { getStellarTestnetAccount } from "@/app/privy-stellar";
import { evaluateUserAction } from "@/app/agent-memory-store";
import { X402_DEMO_LIMIT_ATOMIC, X402_TESTNET_USDC, atomicToDisplay } from "@/app/x402/assets";
import { assertX402Preconditions } from "@/app/x402/request";
import { createSignedX402Payload, prepareX402ClientAuthorization, type PreparedX402Authorization } from "@/app/x402/client-authorization";
import { sameRequirement } from "@/app/x402/protocol";
import { BazaarConsumerClient, canonical, publicBazaarOrder, publicBazaarArchivedOrder, type BazaarArchivedOrder, type BazaarOrder, type CreateBazaarOrder } from "./consumer-client";
import { bazaarOperationStore } from "./consumer-store";

export const BAZAAR_PILOT_SERVICE_IDS = ["guionista-bazaar-production-text-v1", "guionista-bazaar-pilot-text-funded-v1"] as const;
export const bazaarPrepareInput = z.object({ serviceId: z.enum(BAZAAR_PILOT_SERVICE_IDS), cardHash: z.string().regex(/^[a-f0-9]{64}$/), input: z.record(z.string().max(100), z.union([z.string().max(2000), z.number().finite(), z.boolean()])), idempotencyKey: z.string().min(8).max(128) }).strict();
export const bazaarExecuteInput = z.object({ operationId: z.string().uuid(), signature: z.string().regex(/^0x[a-fA-F0-9]{128}$/), explicitConfirmation: z.literal(true) }).strict();
type Terms = { serviceId: string; cardHash: string; inputHash: string; payer: string; amountAtomic: string; destination: string; network: "stellar:testnet"; asset: string };
export type BazaarOperation = { id: string; userId: string; appId: string; remoteOperationId: string; idempotencyKey: string; phase: string; version: number; createdAt: Date; updatedAt: Date; state: { intent: CreateBazaarOrder; terms: Terms; intentHash: string; remoteIntentHash?: string; expiresAt?: string; authorization?: PreparedX402Authorization; challenge?: PaymentRequired; order?: BazaarOrder; recovery?: BazaarArchivedOrder; error?: string; contentExpired?: boolean } };
export interface BazaarOperationStore {
  insert(operation: BazaarOperation): Promise<BazaarOperation>;
  find(userId: string, id: string): Promise<BazaarOperation>;
  update(operation: BazaarOperation, phase: string, state: BazaarOperation["state"]): Promise<BazaarOperation>;
  list(userId: string): Promise<BazaarOperation[]>;
}
type Dependencies = {
  store: BazaarOperationStore;
  client: (userId: string) => Promise<Pick<BazaarConsumerClient, "create" | "challenge" | "pay" | "order"> & Partial<Pick<BazaarConsumerClient, "recoverOrder">>>;
  active: (userId: string) => Promise<unknown>;
  service: typeof getBazaarService;
  wallet: (userId: string) => Promise<string>;
  preflight: (userId: string, terms: Terms) => Promise<void>;
  prepareSignature: typeof prepareX402ClientAuthorization;
  sign: typeof createSignedX402Payload;
  enabled: () => boolean;
  now: () => number;
  uuid: () => string;
};
const sha = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

export function validateBazaarChallenge(challenge: PaymentRequired, intent: CreateBazaarOrder, terms: Terms) {
  const url = `${BAZAAR_CATALOG_ORIGIN}/api/market/orders/${intent.operationId}/x402`;
  if (challenge.x402Version !== 2 || challenge.resource?.url !== url || challenge.accepts?.length !== 1) throw new Error("bazaar_payment_challenge_invalid");
  const requirement = challenge.accepts[0];
  if (requirement.scheme !== "exact" || requirement.network !== "stellar:testnet" || requirement.asset !== X402_TESTNET_USDC.contract || requirement.asset !== terms.asset || requirement.amount !== terms.amountAtomic || requirement.payTo !== terms.destination || requirement.extra?.areFeesSponsored !== true || !Number.isSafeInteger(requirement.maxTimeoutSeconds) || requirement.maxTimeoutSeconds < 15 || requirement.maxTimeoutSeconds > 300 || requirement.extra?.method !== "POST" || requirement.extra?.resourceUrl !== url || requirement.extra?.route !== `/api/market/orders/${intent.operationId}/x402` || requirement.extra?.inputHash !== terms.inputHash || requirement.extra?.operationId !== intent.operationId || requirement.extra?.cardHash !== terms.cardHash) throw new Error("bazaar_payment_terms_changed");
  return requirement;
}
function assertOrderBinding(order: BazaarOrder, operation: BazaarOperation) {
  const t = operation.state.terms;
  if (order.operationId !== operation.id || order.serviceId !== t.serviceId || order.cardHash !== t.cardHash || order.inputHash !== t.inputHash || order.payer !== t.payer || order.destination !== t.destination || decimalAtomic(order.amount) !== t.amountAtomic) throw new Error("bazaar_order_binding_changed");
}
function contentExpired(operation: BazaarOperation, now = Date.now()) { return operation.state.contentExpired || operation.createdAt.getTime() + 7 * 24 * 60 * 60_000 <= now; }
function assertFrozenOperation(operation: BazaarOperation, now = Date.now(), allowExpired = false) {
  const expired = contentExpired(operation, now);
  if (expired && !allowExpired) throw new Error("bazaar_order_content_expired");
  const { intent, terms } = operation.state;
  if (operation.id !== operation.remoteOperationId || intent.operationId !== operation.id || intent.serviceId !== terms.serviceId || intent.cardHash !== terms.cardHash || intent.payer !== terms.payer || intent.paymentProtocol !== "x402-stellar-exact-v2" || !expired && sha(intent.input) !== terms.inputHash || sha(terms) !== operation.state.intentHash) throw new Error("bazaar_operation_changed");
}
function assertArchivedOrderBinding(order: BazaarArchivedOrder, operation: BazaarOperation) {
  const t = operation.state.terms;
  if (order.operationId !== operation.id || order.cardHash !== t.cardHash || order.inputHash !== t.inputHash || order.payer !== t.payer || order.destination !== t.destination || decimalAtomic(order.amount) !== t.amountAtomic || order.paymentProtocol !== "x402-stellar-exact-v2" || operation.state.order && order.buyerOwnerId !== operation.state.order.buyerOwnerId || operation.state.remoteIntentHash && order.intentHash !== operation.state.remoteIntentHash) throw new Error("bazaar_order_binding_changed");
  if (order.settlement && (order.settlement.kind !== "stellar-classic-credit" || order.settlement.network !== t.network || order.settlement.code !== X402_TESTNET_USDC.code || order.settlement.issuer !== X402_TESTNET_USDC.issuer || order.settlement.sacContract !== t.asset)) throw new Error("bazaar_order_binding_changed");
}
function compactOrder(order: BazaarOrder): BazaarOrder {
  const delivery = z.object({ sha256: z.string(), recordedAt: z.string() }).safeParse(order.delivery);
  return { operationId: order.operationId, buyerOwnerId: order.buyerOwnerId, serviceId: order.serviceId, cardHash: order.cardHash, payer: order.payer, inputHash: order.inputHash, amount: order.amount, destination: order.destination, phase: order.phase, paymentProtocol: order.paymentProtocol, transactionHash: order.transactionHash, paymentVerifiedAt: order.paymentVerifiedAt, ...(delivery.success ? { delivery: delivery.data } : {}) };
}
function decimalAtomic(value: string) {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(value); if (!match) throw new Error("bazaar_amount_invalid");
  return (BigInt(match[1]) * BigInt(10_000_000) + BigInt((match[2] ?? "").padEnd(7, "0"))).toString();
}
function safeError(error: unknown) { return error instanceof Error && /^(?:bazaar|x402|stellar)_[a-z0-9_]+$/.test(error.message) ? error.message : "bazaar_operation_unavailable"; }
export function publicBazaarOperation(operation: BazaarOperation) {
  return { operationId: operation.id, phase: operation.phase, terms: { ...operation.state.terms, amount: atomicToDisplay(operation.state.terms.amountAtomic), assetSymbol: "USDC" }, input: contentExpired(operation) ? {} : operation.state.intent.input, expiresAt: operation.state.expiresAt ?? null, signingHash: operation.phase === "awaiting_confirmation" && !contentExpired(operation) ? operation.state.authorization?.authorizationHash ?? null : null, ...(operation.state.recovery ? { order: publicBazaarArchivedOrder(operation.state.recovery, operation.state.terms.serviceId) } : operation.state.order ? { order: publicBazaarOrder(operation.state.order) } : {}), error: operation.state.error ?? null };
}

/** No payment auto-retry. A submission claim is durable before sending a signed payload. */
export function createBazaarConsumptionService(dep: Dependencies) {
  async function guard(userId: string) { if (!dep.enabled()) throw new Error("bazaar_web_consumption_disabled"); await dep.active(userId); }
  async function prepare(userId: string, value: z.input<typeof bazaarPrepareInput>) {
    await guard(userId); const input = bazaarPrepareInput.parse(value);
    if ((await dep.store.list(userId)).some(op => ["submitting", "uncertain", "preparing_remote"].includes(op.phase) && op.idempotencyKey !== input.idempotencyKey)) throw new Error("bazaar_operation_recovery_required");
    if (Buffer.byteLength(canonical(input.input)) > 8000) throw new Error("bazaar_input_too_large");
    const result = await dep.service(input.serviceId, { refresh: true }); const card = result.service;
    if (!card || card.cardHash !== input.cardHash || card.network !== "stellar:testnet" || card.payment.asset !== "USDC" || card.payment.scheme !== "exact" || !StrKey.isValidEd25519PublicKey(card.payment.destination)) throw new Error("bazaar_service_changed");
    const amountAtomic = decimalAtomic(card.payment.amount);
    if (BigInt(amountAtomic) <= BigInt(0) || BigInt(amountAtomic) > X402_DEMO_LIMIT_ATOMIC) throw new Error("bazaar_amount_over_limit");
    const fields = new Map(card.input.map(field => [field.name, field]));
    if (Object.entries(input.input).some(([key, value]) => !fields.has(key) || typeof value !== fields.get(key)!.type) || card.input.some(field => field.required && !(field.name in input.input))) throw new Error("bazaar_input_invalid");
    const payer = await dep.wallet(userId);
    const terms: Terms = { serviceId: input.serviceId, cardHash: input.cardHash, inputHash: sha(input.input), payer, amountAtomic, destination: card.payment.destination, network: "stellar:testnet", asset: X402_TESTNET_USDC.contract };
    await dep.preflight(userId, terms);
    const id = dep.uuid(); const now = new Date(dep.now());
    const nativeIntent: CreateBazaarOrder = { operationId: id, serviceId: input.serviceId, cardHash: input.cardHash, payer, input: input.input, paymentProtocol: "x402-stellar-exact-v2" };
    const operation = await dep.store.insert({ id, userId, appId: "bazaar", remoteOperationId: id, idempotencyKey: input.idempotencyKey, phase: "preparing", version: 0, createdAt: now, updatedAt: now, state: { intent: nativeIntent, remoteIntentHash: sha(nativeIntent), terms, intentHash: sha(terms) } });
    if (operation.state.intentHash !== sha(terms)) throw new Error("bazaar_operation_conflict");
    assertFrozenOperation(operation, dep.now());
    if (operation.phase !== "preparing") return publicBazaarOperation(operation);
    // A lease prevents two prepares from concurrently creating/challenging this UUID.
    let claimed = await dep.store.update(operation, "preparing_remote", operation.state);
    try {
      const client = await dep.client(userId); const order = await client.create(claimed.state.intent); assertOrderBinding(order, claimed);
      const challenge = await client.challenge(claimed.id); const requirement = validateBazaarChallenge(challenge, claimed.state.intent, terms);
      const authorization = await dep.prepareSignature({ x402Version: 2, requirement, address: payer });
      const expiresAt = new Date(dep.now() + Math.min(300_000, requirement.maxTimeoutSeconds * 1000 - 5000)).toISOString();
      // The legacy demo resource is irrelevant to the cryptographic authorization; never expose or replay that URL here.
      const { request: _demoRequest, ...onlyAuthorization } = authorization; void _demoRequest;
      claimed = await dep.store.update(claimed, "awaiting_confirmation", { ...claimed.state, order: compactOrder(order), challenge, authorization: onlyAuthorization, expiresAt });
      return publicBazaarOperation(claimed);
    } catch (error) {
      // A failed prepare has never sent a signature. Recover the original remote UUID before trying preparation again.
      await dep.store.update(claimed, "preparation_pending", { ...claimed.state, error: safeError(error) }); throw error;
    }
  }
  async function execute(userId: string, value: z.input<typeof bazaarExecuteInput>) {
    await guard(userId); const input = bazaarExecuteInput.parse(value); let operation = await dep.store.find(userId, input.operationId);
    assertFrozenOperation(operation, dep.now());
    if (operation.phase === "completed" || operation.phase === "paid") return publicBazaarOperation(operation);
    if (operation.phase !== "awaiting_confirmation") throw new Error("bazaar_operation_recovery_required");
    if (!operation.state.expiresAt || Date.parse(operation.state.expiresAt) <= dep.now()) throw new Error("bazaar_confirmation_expired");
    const { challenge, authorization, terms } = operation.state;
    if (!challenge || !authorization || operation.state.intentHash !== sha(terms)) throw new Error("bazaar_operation_changed");
    validateBazaarChallenge(challenge, operation.state.intent, terms);
    if (authorization.x402Version !== 2 || !sameRequirement(challenge.accepts[0], authorization.requirement)) throw new Error("bazaar_operation_changed");
    const fresh = await dep.service(terms.serviceId, { refresh: true }); if (!fresh.service || fresh.service.cardHash !== terms.cardHash) throw new Error("bazaar_service_changed");
    await dep.preflight(userId, terms);
    const signed = await dep.sign({ prepared: authorization, address: terms.payer, signature: input.signature });
    if (Date.parse(operation.state.expiresAt) <= dep.now()) throw new Error("bazaar_confirmation_expired");
    operation = await dep.store.update(operation, "submitting", operation.state);
    try {
      const order = await (await dep.client(userId)).pay(operation.id, { x402Version: 2, accepted: challenge.accepts[0], resource: challenge.resource, payload: { transaction: signed.transaction } });
      assertOrderBinding(order, operation); const receipt = publicBazaarOrder(order);
      operation = await dep.store.update(operation, receipt.payment.confirmed ? receipt.delivery.available ? "completed" : "paid" : "uncertain", { ...operation.state, order: compactOrder(order) });
    } catch (error) { operation = await dep.store.update(operation, "uncertain", { ...operation.state, error: safeError(error) }); }
    return publicBazaarOperation(operation);
  }
  async function recover(userId: string, operationId: string) {
    await dep.active(userId); z.string().uuid().parse(operationId); let operation = await dep.store.find(userId, operationId);
    assertFrozenOperation(operation, dep.now(), true);
    let order: BazaarOrder;
    try {
      const client = await dep.client(userId); const result = client.recoverOrder ? await client.recoverOrder(operationId) : { kind: "order" as const, order: await client.order(operationId) };
      if (result.kind === "content_expired") {
        assertArchivedOrderBinding(result.operation, operation);
        const receipt = publicBazaarArchivedOrder(result.operation, operation.state.terms.serviceId);
        const { authorization: _authorization, challenge: _challenge, ...retained } = operation.state; void _authorization; void _challenge;
        operation = await dep.store.update(operation, receipt.payment.confirmed ? "paid" : result.operation.paymentPhase === "uncertain" ? "uncertain" : operation.phase, { ...retained, intent: { ...retained.intent, input: {} }, contentExpired: true, recovery: result.operation, error: undefined });
        return publicBazaarOperation(operation);
      }
      order = result.order;
    }
    catch (error) {
      if (error instanceof Error && error.message === "bazaar_consumer_http_404" && ["preparing", "preparing_remote", "preparation_pending"].includes(operation.phase)) return publicBazaarOperation(await dep.store.update(operation, "preparing", { ...operation.state, error: undefined }));
      throw error;
    }
    assertOrderBinding(order, operation);
    const receipt = publicBazaarOrder(order);
    if (["preparation_pending", "preparing_remote"].includes(operation.phase) && order.phase === "awaiting-payment") {
      // Only an unpaid order may resume challenge preparation; this never sends payment.
      operation = await dep.store.update(operation, "preparing", { ...operation.state, order: compactOrder(order), error: undefined });
    } else if (receipt.payment.confirmed) operation = await dep.store.update(operation, receipt.delivery.available ? "completed" : "paid", { ...operation.state, order: compactOrder(order), error: undefined });
    else operation = await dep.store.update(operation, operation.phase === "submitting" ? "uncertain" : operation.phase, { ...operation.state, order: compactOrder(order) });
    return publicBazaarOperation(operation);
  }
  async function cancel(userId: string, operationId: string) {
    await dep.active(userId); const operation = await dep.store.find(userId, z.string().uuid().parse(operationId));
    if (!["awaiting_confirmation", "preparing", "preparation_pending"].includes(operation.phase)) throw new Error("bazaar_operation_recovery_required");
    return publicBazaarOperation(await dep.store.update(operation, "cancelled", { ...operation.state, authorization: undefined }));
  }
  async function resume(userId: string, operationId: string) {
    await dep.active(userId); assertFrozenOperation(await dep.store.find(userId, operationId), dep.now());
    await recover(userId, operationId); const operation = await dep.store.find(userId, operationId);
    if (operation.phase !== "preparing") return publicBazaarOperation(operation);
    return prepare(userId, { serviceId: z.enum(BAZAAR_PILOT_SERVICE_IDS).parse(operation.state.intent.serviceId), cardHash: operation.state.intent.cardHash, input: operation.state.intent.input, idempotencyKey: operation.idempotencyKey });
  }
  return { prepare, execute, recover, resume, cancel, list: async (userId: string) => (await dep.store.list(userId)).map(publicBazaarOperation) };
}
const runtime = createBazaarConsumptionService({
  store: bazaarOperationStore, active: userId => assertOwnAppActive(userId, "bazaar"),
  client: async userId => new BazaarConsumerClient(await readOwnBazaarCredential(userId, "web")), service: getBazaarService,
  wallet: async userId => { const wallets = await listPersistedUserWallets(userId); const wallet = wallets.find(wallet => wallet.network === "stellar:testnet" && wallet.chainType === "stellar" && wallet.status === "active"); if (!wallet || !StrKey.isValidEd25519PublicKey(wallet.address)) throw new Error("bazaar_stellar_wallet_required"); return wallet.address; },
  preflight: async (userId, terms) => { assertX402Preconditions(await getStellarTestnetAccount(terms.payer), terms.amountAtomic); const decision = await evaluateUserAction(userId, { actionType: "bazaar.guionista.purchase", network: "stellar:testnet", asset: "USDC", amount: Number(atomicToDisplay(terms.amountAtomic)), financial: true, irreversible: true }); if (!decision.allowed) throw new Error("bazaar_policy_blocked"); },
  prepareSignature: prepareX402ClientAuthorization, sign: createSignedX402Payload, enabled: () => process.env.CARMELITA_BAZAAR_WEB_CONSUMPTION_ENABLED === "true", now: Date.now, uuid: randomUUID,
});
export const prepareBazaarConsumption = runtime.prepare;
export const executeBazaarConsumption = runtime.execute;
export const recoverBazaarConsumption = runtime.recover;
export const resumeBazaarConsumption = runtime.resume;
export const cancelBazaarConsumption = runtime.cancel;
export const listOwnBazaarOperations = runtime.list;
