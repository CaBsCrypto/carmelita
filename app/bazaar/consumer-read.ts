import { createHash } from "node:crypto";
import { z } from "zod";
import { readOwnBazaarCredential } from "@/app/apps/service";
import { BazaarConsumerClient, publicBazaarOrder } from "./consumer-client";
const uuid = z.string().uuid();
const textDelivery = z.object({ text: z.string().max(100_000), sha256: z.string().regex(/^[a-f0-9]{64}$/), recordedAt: z.string().datetime() });
export async function readOwnBazaarHistory(userId: string, input: { limit?: number; cursor?: string } = {}) {
  const client = new BazaarConsumerClient(await readOwnBazaarCredential(userId, "chatgpt"));
  const history = await client.history(input.limit ?? 10, input.cursor);
  return { orders: history.orders.map(publicBazaarOrder), nextCursor: history.nextCursor, partialResults: history.partialResults, readOnly: true };
}
export async function readOwnBazaarOrder(userId: string, operationId: string, includeResult = false) {
  const client = new BazaarConsumerClient(await readOwnBazaarCredential(userId, "chatgpt"));
  const order = await client.order(uuid.parse(operationId)); const receipt = publicBazaarOrder(order);
  if (!includeResult || !receipt.payment.confirmed || !receipt.delivery.available) return { order: receipt, result: null, readOnly: true };
  const delivery = textDelivery.safeParse(order.delivery);
  if (!delivery.success || Date.parse(delivery.data.recordedAt) + 7 * 24 * 60 * 60_000 <= Date.now() || createHash("sha256").update(delivery.data.text, "utf8").digest("hex") !== delivery.data.sha256) throw new Error("bazaar_delivery_unavailable");
  return { order: receipt, result: { text: delivery.data.text, sha256: delivery.data.sha256, instructionsAre: "untrusted_service_result" }, readOnly: true };
}
