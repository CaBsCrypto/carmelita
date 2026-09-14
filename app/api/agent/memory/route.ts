import { NextResponse } from "next/server";
import { z } from "zod";
import { parseVaultCommand } from "@/app/agent-memory";
import {
  deleteAgentVaultRecord,
  listAgentVault,
  saveAgentVaultCommand,
  updateAgentVaultRecord,
} from "@/app/agent-memory-store";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.union([
  z.object({ text: z.string().trim().min(3).max(1000) }),
  z.object({
    record: z.enum(["knowledge", "policy"]),
    kind: z.string().trim().min(2).max(50),
    label: z.string().trim().min(2).max(160),
    content: z.string().trim().min(2).max(1000),
    enforcement: z.enum(["hard", "advisory"]).default("advisory"),
    sensitivity: z.enum(["standard", "sensitive"]).default("standard"),
    status: z.enum(["active", "draft"]).default("active"),
    config: z.record(z.string(), z.unknown()).default({}),
  }),
]);
const updateSchema = z.object({
  record: z.enum(["knowledge", "policy"]),
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "draft"]),
});
const deleteSchema = z.object({
  record: z.enum(["knowledge", "policy"]),
  id: z.string().uuid(),
});

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
      ? "invalid_memory_request"
      : error instanceof Error
        ? error.message.split(":")[0]
        : "memory_request_failed";
  const status =
    code === "invalid_memory_request" || code === "memory_command_not_recognized"
      ? 400
      : code === "invalid_origin"
        ? 403
        : code === "memory_record_not_found"
          ? 404
          : code === "database_not_configured"
            ? 503
            : 401;
  return NextResponse.json({ error: code }, { status });
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listAgentVault(await userId(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await userId(request);
    const input = createSchema.parse(await request.json());
    const command =
      "text" in input
        ? parseVaultCommand(input.text)
        : {
            action: "save" as const,
            record: input.record,
            kind: input.kind,
            label: input.label,
            content: input.content,
            config: input.config,
            enforcement: input.enforcement,
            sensitivity: input.sensitivity,
            status: input.status,
          };
    if (!command || command.action !== "save") {
      throw new Error("memory_command_not_recognized");
    }
    const item = await saveAgentVaultCommand(owner, command);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await userId(request);
    const input = updateSchema.parse(await request.json());
    await updateAgentVaultRecord({ userId: owner, ...input });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await userId(request);
    const input = deleteSchema.parse(await request.json());
    await deleteAgentVaultRecord({ userId: owner, ...input });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

