import { z } from "zod";
import type { BazaarCredential } from "@/app/apps/types";
import { BAZAAR_CATALOG_ORIGIN, BAZAAR_CATALOG_MAX_BYTES } from "@/app/connectors/bazaar-catalog";
import { encodePaymentSignatureHeader, decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentPayload } from "@x402/core/types";

const uuid = z.string().uuid();
const orderSchema = z.object({ operationId: uuid, buyerOwnerId: z.string().min(1), serviceId: z.string().min(1), cardHash: z.string().regex(/^[a-f0-9]{64}$/), payer: z.string().min(1), inputHash: z.string().regex(/^[a-f0-9]{64}$/), amount: z.string(), destination: z.string(), phase: z.string(), paymentProtocol: z.literal("x402-stellar-exact-v2"), transactionHash: z.string().nullable().optional(), paymentVerifiedAt: z.string().datetime().nullable().optional(), expiresAt: z.string().optional(), delivery: z.unknown().optional(), settlement: z.unknown().optional() }).passthrough();
export type BazaarOrder = z.infer<typeof orderSchema>;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const archivedOrderSchema = z.object({ operationId: uuid, buyerOwnerId: z.string().min(1).max(200), sellerOwnerId: z.string().min(1).max(200),
  intentHash: digest, cardHash: digest, inputHash: digest, orderBinding: digest, payer: z.string().regex(/^G[A-Z2-7]{55}$/), destination: z.string().regex(/^G[A-Z2-7]{55}$/), amount: z.string().max(40),
  settlement: z.object({ kind: z.literal("stellar-classic-credit"), network: z.enum(["stellar:testnet", "stellar:mainnet"]), code: z.string().max(12), issuer: z.string().regex(/^G[A-Z2-7]{55}$/), sacContract: z.string().regex(/^C[A-Z2-7]{55}$/) }).strict().optional(),
  paymentProtocol: z.literal("x402-stellar-exact-v2").optional(), paymentPhase: z.enum(["unpaid", "rejected", "uncertain", "confirmed"]),
  authorizationFingerprint: digest.optional(), transactionHash: digest.optional(), paymentVerifiedAt: z.string().datetime().optional(), archivedAt: z.string().datetime(), sellerReservationPending: z.boolean().optional() }).strict();
export type BazaarArchivedOrder = z.infer<typeof archivedOrderSchema>;
export type BazaarOrderRecovery = { kind: "order"; order: BazaarOrder } | { kind: "content_expired"; operation: BazaarArchivedOrder };
export type CreateBazaarOrder = { operationId: string; serviceId: string; cardHash: string; payer: string; input: Record<string, string | number | boolean>; paymentProtocol: "x402-stellar-exact-v2" };

/** A bounded owner client. It never dereferences provider URLs or accepts a caller-selected origin. */
export class BazaarConsumerClient {
  constructor(private credential: BazaarCredential, private fetcher: typeof fetch = fetch, private timeoutMs = 15_000) {}
  private async request(path: string, body?: unknown, signature?: string) {
    if (body !== undefined && this.credential.channel !== "web") throw new Error("bazaar_consumer_write_forbidden");
    if (!/^\/api\/market\/orders(?:\?[a-zA-Z0-9%=&._~-]+|\/[a-f0-9-]{36}(?:\/x402|\/deliveries)?)?$/.test(path)) throw new Error("bazaar_consumer_path_invalid");
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); if (reader) void reader.cancel().catch(() => {}); reject(new Error("bazaar_consumer_timeout")); }, Math.max(1, Math.min(this.timeoutMs, 15_000))); });
    const operation = async () => {
    const response = await this.fetcher(new URL(path, BAZAAR_CATALOG_ORIGIN), { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${this.credential.credential}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(signature ? { "PAYMENT-SIGNATURE": signature } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal });
    controller.signal.throwIfAborted();
    if (response.url && new URL(response.url).origin !== BAZAAR_CATALOG_ORIGIN) throw new Error("bazaar_consumer_origin_invalid");
    if (!(response.headers.get("content-type") ?? "").includes("application/json") || Number(response.headers.get("content-length")) > BAZAAR_CATALOG_MAX_BYTES) throw new Error("bazaar_consumer_response_invalid");
    if (!response.body) throw new Error("bazaar_consumer_response_invalid");
    reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const part = await reader.read(); controller.signal.throwIfAborted(); if (part.done) break; size += part.value.length; if (size > BAZAAR_CATALOG_MAX_BYTES) throw new Error("bazaar_consumer_response_too_large"); chunks.push(part.value); }
    let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("bazaar_consumer_response_invalid"); }
    return { response, value };
    };
    try { return await Promise.race([operation(), deadline]); }
    finally { if (timer) clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
  }
  private ownedOrder(value: unknown, id?: string) {
    const parsed = z.object({ order: orderSchema }).parse(value).order;
    if (parsed.buyerOwnerId !== this.credential.ownerId || (id && parsed.operationId !== id)) throw new Error("bazaar_consumer_owner_mismatch");
    return parsed;
  }
  async create(input: CreateBazaarOrder) {
    const { response, value } = await this.request("/api/market/orders", input);
    if (!response.ok) throw new Error(`bazaar_consumer_http_${response.status}`);
    return this.ownedOrder(value, input.operationId);
  }
  async challenge(operationId: string): Promise<PaymentRequired> {
    uuid.parse(operationId); const { response, value } = await this.request(`/api/market/orders/${operationId}/x402`, {});
    if (response.status !== 402) throw new Error("bazaar_payment_challenge_unavailable");
    const encoded = response.headers.get("PAYMENT-REQUIRED"); if (!encoded) throw new Error("bazaar_payment_challenge_invalid");
    const challenge = decodePaymentRequiredHeader(encoded);
    // Compare parsed objects structurally, independently of JSON key ordering.
    if (canonical(challenge) !== canonical(value)) throw new Error("bazaar_payment_challenge_changed");
    return challenge;
  }
  async pay(operationId: string, payload: PaymentPayload) {
    uuid.parse(operationId); const { response, value } = await this.request(`/api/market/orders/${operationId}/x402`, {}, encodePaymentSignatureHeader(payload));
    if (!response.ok) throw new Error(`bazaar_payment_http_${response.status}`);
    return this.ownedOrder(value, operationId);
  }
  async order(operationId: string) {
    uuid.parse(operationId); const { response, value } = await this.request(`/api/market/orders/${operationId}`);
    if (!response.ok) throw new Error(response.status === 410 ? "bazaar_order_content_expired" : `bazaar_consumer_http_${response.status}`);
    return this.ownedOrder(value, operationId);
  }
  /** Observe existing payment metadata only. A 410 never restores content or
   * initiates settlement, signing, delivery execution or another order. */
  async recoverOrder(operationId: string): Promise<BazaarOrderRecovery> {
    uuid.parse(operationId); const { response, value } = await this.request(`/api/market/orders/${operationId}`);
    if (response.status === 410) {
      const expired = z.object({ error: z.object({ code: z.literal("ORDER_CONTENT_EXPIRED") }).strict(), recoveryOnly: z.literal(true), operation: archivedOrderSchema, instruction: z.string().max(1000).optional() }).strict().parse(value);
      if (expired.operation.buyerOwnerId !== this.credential.ownerId || expired.operation.operationId !== operationId) throw new Error("bazaar_consumer_owner_mismatch");
      return { kind: "content_expired", operation: expired.operation };
    }
    if (!response.ok) throw new Error(`bazaar_consumer_http_${response.status}`);
    return { kind: "order", order: this.ownedOrder(value, operationId) };
  }
  async history(limit = 10, cursor?: string) {
    z.number().int().min(1).max(20).parse(limit); if (cursor) z.string().max(2000).parse(cursor);
    const params = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
    const { response, value } = await this.request(`/api/market/orders?${params}`);
    if (!response.ok) throw new Error(`bazaar_consumer_http_${response.status}`);
    const parsed = z.object({ orders: z.array(orderSchema).max(20), nextCursor: z.string().max(2000).nullable(), partialResults: z.boolean() }).parse(value);
    if (parsed.orders.some(order => order.buyerOwnerId !== this.credential.ownerId)) throw new Error("bazaar_consumer_owner_mismatch");
    return parsed;
  }
  async delivery(operationId: string) {
    // Prove the binding before requesting the same protected delivery endpoint.
    await this.order(operationId);
    const { response, value } = await this.request(`/api/market/orders/${uuid.parse(operationId)}/deliveries`);
    if (!response.ok) throw new Error(`bazaar_consumer_http_${response.status}`);
    return z.object({ delivery: z.unknown() }).parse(value).delivery;
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Native results are a closed projection, without checkout, signer or provider URLs. */
export function publicBazaarOrder(order: BazaarOrder) {
  const confirmed = Boolean(z.string().datetime().safeParse(order.paymentVerifiedAt).success && /^[a-f0-9]{64}$/.test(order.transactionHash ?? "") && ["paid", "executing", "delivered", "delivery-failed", "execution-uncertain"].includes(order.phase));
  const delivery = z.object({ recordedAt: z.string().datetime() }).safeParse(order.delivery);
  const available = confirmed && delivery.success && Date.parse(delivery.data.recordedAt) + 7 * 24 * 60 * 60_000 > Date.now();
  return { operationId: order.operationId, serviceId: order.serviceId, phase: order.phase, payment: { confirmed, status: confirmed ? "confirmed" : order.phase.includes("uncertain") ? "uncertain" : "not_confirmed" }, delivery: { available, status: available ? "available" : "pending" } };
}
export function publicBazaarArchivedOrder(order: BazaarArchivedOrder, serviceId: string) {
  const confirmed = order.paymentProtocol === "x402-stellar-exact-v2" && order.paymentPhase === "confirmed" && z.string().datetime().safeParse(order.paymentVerifiedAt).success && digest.safeParse(order.transactionHash).success;
  return { operationId: order.operationId, serviceId, phase: confirmed ? "paid" : order.paymentPhase === "uncertain" ? "payment-uncertain" : order.paymentPhase,
    payment: { confirmed, status: confirmed ? "confirmed" : order.paymentPhase === "uncertain" ? "uncertain" : "not_confirmed" }, delivery: { available: false, status: "expired" }, contentExpired: true };
}
