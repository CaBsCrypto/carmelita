import { NextResponse } from "next/server";
import { z } from "zod";
import { listGatewayCapabilities } from "@/app/agent-gateway/catalog";
import { createGatewayAudit } from "@/app/agent-gateway/operations";
import { gatewayHeaders } from "@/app/agent-gateway/http";
import {
  GATEWAY_API_VERSION,
  GATEWAY_ENVIRONMENT,
  gatewayCapabilityStatusSchema,
  gatewayNetworkSchema,
  gatewayOperationSchema,
} from "@/app/agent-gateway/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  status: gatewayCapabilityStatusSchema.optional(),
  network: gatewayNetworkSchema.optional(),
  operation: gatewayOperationSchema.optional(),
}).strict();

export async function GET(request: Request) {
  const audit = createGatewayAudit(request, "/api/v1/capabilities");
  const url = new URL(request.url);
  const filters = filtersSchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    network: url.searchParams.get("network") ?? undefined,
    operation: url.searchParams.get("operation") ?? undefined,
  });
  if (!filters.success) {
    return audit.complete(NextResponse.json({ error: "invalid_capability_filters" }, {
      status: 400,
      headers: gatewayHeaders(),
    }));
  }
  const capabilities = listGatewayCapabilities().filter((capability) =>
    (!filters.data.status || capability.status === filters.data.status) &&
    (!filters.data.network || capability.network === filters.data.network) &&
    (!filters.data.operation || capability.operation === filters.data.operation));
  return audit.complete(NextResponse.json({
    apiVersion: GATEWAY_API_VERSION,
    environment: GATEWAY_ENVIRONMENT,
    mainnetEnabled: false,
    count: capabilities.length,
    capabilities,
  }, { headers: gatewayHeaders() }));
}
