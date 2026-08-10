import { NextResponse } from "next/server";
import { readGatewayPlan } from "@/app/agent-gateway/service";
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
  const audit = createGatewayAudit(request, "/api/v1/actions/:id");
  try {
    const actorId = await gatewayActor(request, "agent:read", audit);
    const { id } = await context.params;
    return audit.complete(NextResponse.json({ plan: await readGatewayPlan(actorId, id) }, {
      headers: gatewayHeaders(),
    }));
  } catch (error) {
    return audit.complete(gatewayError(error));
  }
}
