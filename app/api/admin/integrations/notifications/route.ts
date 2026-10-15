import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/app/admin/auth";
import { dispatchProposalEmails } from "@/app/integrations/proposal-email-worker";
import { hasSameProposalOrigin } from "@/app/integrations/request-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function dispatch() {
  try { return json(await dispatchProposalEmails()); }
  catch { return json({ status: "notification_storage_error" }, 503); }
}

export async function POST(request: Request) {
  if (!await getAdminIdentity()) return json({ status: "unauthorized" }, 401);
  if (!hasSameProposalOrigin(request)) return json({ status: "invalid_origin" }, 403);
  return dispatch();
}

/** Optional future scheduler. Configuration is never accepted in the request. */
export async function GET(request: Request) {
  const token = process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN;
  const expected = token && /^[\x21-\x7e]{32,256}$/.test(token) ? Buffer.from(`Bearer ${token}`) : null;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (!expected || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return json({ status: "unauthorized" }, 401);
  }
  return dispatch();
}
