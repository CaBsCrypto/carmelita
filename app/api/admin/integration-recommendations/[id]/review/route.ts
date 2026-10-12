import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/app/admin/auth";
import { ProposalReviewError, proposalReviewSchema, reviewServiceProposal } from "@/app/integrations/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 6000;
const json = (value: unknown, status: number) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
function sameOrigin(request: Request) {
  try {
    const supplied = request.headers.get("origin");
    if (!supplied) return false;
    const origin = new URL(supplied);
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = request.headers.get("host");
    if (!host) return origin.origin === url.origin;
    if (/[\\/?#@\s,]/.test(host)) return false;
    const external = new URL(`${url.protocol}//${host}`);
    const normalizedLoopback = url.hostname === "localhost" && ["127.0.0.1", "[::1]"].includes(external.hostname) && url.port === external.port;
    if (external.host !== url.host && !normalizedLoopback) return false;
    return origin.origin === external.origin;
  } catch { return false; }
}
async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) { void reader.cancel().catch(() => undefined); throw new RangeError(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try { admin = await getAdminIdentity(); } catch { return json({ error: "admin_auth_required" }, 401); }
  if (!admin) return json({ error: "admin_auth_required" }, 401);
  if (!sameOrigin(request)) return json({ error: "invalid_origin" }, 403);
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return json({ error: "invalid_request" }, 400);
  let body;
  try { body = await boundedBody(request); } catch (error) { return json({ error: "invalid_request" }, error instanceof RangeError ? 413 : 400); }
  const parsed = proposalReviewSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  try {
    return json(await reviewServiceProposal(id, parsed.data, `${admin.method}:${admin.username}`), 200);
  } catch (error) {
    if (error instanceof ProposalReviewError) return json({ error: error.code }, error.code === "not_found" ? 404 : error.code === "version_conflict" ? 409 : 503);
    return json({ error: "review_unavailable" }, 503);
  }
}
