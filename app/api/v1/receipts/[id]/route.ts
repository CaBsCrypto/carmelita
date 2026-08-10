import { NextResponse } from "next/server";
import { readGatewayReceipt } from "@/app/agent-gateway/service";
import { createGatewayAudit } from "@/app/agent-gateway/operations";
import {
  gatewayActor,
  gatewayError,
  gatewayHeaders,
} from "@/app/agent-gateway/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const audit = createGatewayAudit(request, "/api/v1/receipts/:id");
  try {
    const actorId = await gatewayActor(request, "agent:read", audit);
    const { id } = await context.params;
    const result = await readGatewayReceipt(actorId, id);
    return audit.complete(NextResponse.json(result, {
      status: result.available ? 200 : 202,
      headers: gatewayHeaders(),
    }));
  } catch (error) {
    return audit.complete(gatewayError(error));
  }
}
