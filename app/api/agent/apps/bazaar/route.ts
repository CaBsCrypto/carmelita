import { z } from "zod";
import { appFailure, appResponse, ownAppWebUser } from "@/app/apps/http";
import { assertOwnAppActive, readOwnBazaarCredential } from "@/app/apps/service";
import { listBazaarServices } from "@/app/connectors/bazaar-catalog";
import { BazaarConsumerClient, publicBazaarOrder } from "@/app/bazaar/consumer-client";
import { bazaarPrepareInput, bazaarExecuteInput, prepareBazaarConsumption, executeBazaarConsumption, recoverBazaarConsumption, resumeBazaarConsumption, cancelBazaarConsumption, listOwnBazaarOperations } from "@/app/bazaar/consumer-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const operationId = z.string().uuid();
const input = z.discriminatedUnion("operation", [bazaarPrepareInput.extend({ operation: z.literal("prepare") }), bazaarExecuteInput.extend({ operation: z.literal("execute") }), z.object({ operation: z.enum(["recover", "resume", "cancel"]), operationId }).strict()]);
export async function GET(request: Request) {
  try {
    const userId = await ownAppWebUser(request); await assertOwnAppActive(userId, "bazaar");
    const params = new URL(request.url).searchParams;
    if (params.has("order")) {
      const id = operationId.parse(params.get("order")); const client = new BazaarConsumerClient(await readOwnBazaarCredential(userId, "web"));
      const order = await client.order(id); const delivery = params.get("delivery") === "true" && publicBazaarOrder(order).delivery.available ? await client.delivery(id) : null;
      return appResponse({ order: publicBazaarOrder(order), delivery });
    }
    const catalog = await listBazaarServices({ limit: 20, ...(params.has("cursor") ? { cursor: params.get("cursor")! } : {}), ...(params.has("q") ? { query: params.get("q")! } : {}) }, { refresh: params.get("refresh") === "true" });
    return appResponse({ catalog, operations: await listOwnBazaarOperations(userId), webConsumptionEnabled: process.env.CARMELITA_BAZAAR_WEB_CONSUMPTION_ENABLED === "true" });
  } catch (error) { return appFailure(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await ownAppWebUser(request, true); const body = input.parse(await request.json());
    if (body.operation === "prepare") return appResponse({ operation: await prepareBazaarConsumption(userId, { serviceId: body.serviceId, cardHash: body.cardHash, input: body.input, idempotencyKey: body.idempotencyKey }) });
    if (body.operation === "execute") return appResponse({ operation: await executeBazaarConsumption(userId, { operationId: body.operationId, signature: body.signature, explicitConfirmation: body.explicitConfirmation }) });
    return appResponse({ operation: await (body.operation === "cancel" ? cancelBazaarConsumption : body.operation === "resume" ? resumeBazaarConsumption : recoverBazaarConsumption)(userId, body.operationId) });
  } catch (error) { return appFailure(error); }
}
