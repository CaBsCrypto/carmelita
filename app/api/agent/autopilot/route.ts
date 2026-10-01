import { readAgentAutopilot } from "@/app/queries/personal-store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateAutopilotState } from "@/app/agent-memory-store";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("activate"),
    acknowledged: z.literal(true),
    durationHours: z.union([z.literal(1), z.literal(8), z.literal(24)]),
    xlmPerAction: z.number().positive().max(5),
    usdcPerAction: z.number().positive().max(0.05),
    maxDailyActions: z.number().int().positive().max(10),
  }),
  z.object({ action: z.literal("pause") }),
]);

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function userId(request: Request) {
  if (!sameOrigin(request)) throw new Error("invalid_origin");
  return (await verifyPrivyAccessToken(bearerToken(request))).user_id;
}

function errorResponse(error: unknown) {
  const code =
    error instanceof z.ZodError
      ? "invalid_autopilot_request"
      : error instanceof Error
        ? error.message.split(":")[0]
        : "autopilot_request_failed";
  const status =
    code === "invalid_autopilot_request"
      ? 400
      : code === "invalid_origin"
        ? 403
        : code === "database_not_configured"
          ? 503
          : 401;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await readAgentAutopilot(await userId(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await userId(request);
    const input = updateSchema.parse(await request.json());
    return NextResponse.json(await updateAutopilotState(owner, input), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
