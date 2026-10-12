import { appFailure, appResponse, ownAppWebUser, appChangeInput, appConfirmInput, appCancelInput } from "@/app/apps/http";
import { listAvailableApps, listOwnApps, prepareAppChange, confirmAppChange, cancelAppChange, retryAppConnection } from "@/app/apps/service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("operation", [
  appChangeInput.extend({ operation: z.literal("prepare") }),
  appConfirmInput.extend({ operation: z.literal("confirm") }),
  appCancelInput.extend({ operation: z.literal("cancel") }),
  z.object({ operation: z.literal("retry"), appId: z.literal("bazaar") }).strict(),
]);
export async function GET(request: Request) {
  try {
    const userId = await ownAppWebUser(request);
    const [available, own] = await Promise.all([listAvailableApps(), listOwnApps(userId)]);
    return appResponse({ available: available.apps, own: own.apps });
  } catch (error) { return appFailure(error); }
}
export async function POST(request: Request) {
  try {
    const userId = await ownAppWebUser(request, true);
    const body = input.parse(await request.json());
    if (body.operation === "retry") return appResponse(await retryAppConnection(userId, body.appId));
    if (body.operation === "prepare") return appResponse(await prepareAppChange(userId, { appId: body.appId, action: body.action, idempotencyKey: body.idempotencyKey }, "web"));
    if (body.operation === "confirm") return appResponse(await confirmAppChange(userId, { changeId: body.changeId, confirmationToken: body.confirmationToken }, "web"));
    return appResponse(await cancelAppChange(userId, { changeId: body.changeId }, "web"));
  } catch (error) { return appFailure(error); }
}
