import { NextResponse } from "next/server";
import { createGatewayPlan } from "@/app/agent-gateway/service";
import { createGatewayAudit } from "@/app/agent-gateway/operations";
import {
  gatewayActor,
  gatewayError,
  gatewayHeaders,
} from "@/app/agent-gateway/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const audit = createGatewayAudit(request, "/api/v1/actions/plan");
  try {
    const actorId = await gatewayActor(request, "agent:plan", audit);
    const result = await createGatewayPlan(actorId, await request.json());
    return audit.complete(NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
      headers: gatewayHeaders(),
    }));
  } catch (error) {
    return audit.complete(gatewayError(error));
  }
}
