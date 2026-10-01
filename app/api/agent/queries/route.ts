import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";
import { executeWebReadQuery } from "@/app/queries/adapters";
import { listReadQueries } from "@/app/queries/registry";
import { publicMcpErrorCode } from "@/app/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const inputSchema = z.object({
  query: z.string().trim().min(1).max(150),
  input: z.record(z.string(), z.unknown()).default({}),
  locale: z.enum(["es", "en", "pt"]).default("es"),
}).strict();

async function ownUser(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) throw new Error("invalid_origin");
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  try { return (await verifyPrivyAccessToken(token)).user_id; }
  catch { throw new Error("privy_authorization_invalid"); }
}

function failure(error: unknown) {
  const code = error instanceof z.ZodError ? "invalid_read_query" : publicMcpErrorCode(error);
  const status = code === "invalid_origin" ? 403 : code === "read_query_not_found" ? 404 : code === "invalid_read_query" ? 400 : code.startsWith("privy_") || code === "mcp_personal_authorization_required" ? 401 : 502;
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  try {
    await ownUser(request);
    return NextResponse.json({ queries: listReadQueries() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const userId = await ownUser(request);
    const input = inputSchema.parse(await request.json());
    return NextResponse.json(await executeWebReadQuery(input.query, input.input, userId, input.locale), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
