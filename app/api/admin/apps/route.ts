import { z } from "zod";
import { getAdminIdentity } from "@/app/admin/auth";
import { approveRegisteredApp, suspendRegisteredApp, publicAppDefinition } from "@/app/apps/registry";
import { listAvailableApps } from "@/app/apps/service";
import { appResponse, appFailure, hasSameAppRequestOrigin } from "@/app/apps/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.object({ appId: z.literal("bazaar"), action: z.enum(["approve", "suspend"]), expectedVersion: z.string().min(1).max(80), expectedApprovalRevision: z.number().int().min(0), evidence: z.string().trim().min(3).max(1000) }).strict();
export async function GET() { try { if (!await getAdminIdentity()) return appResponse({ error: "apps_admin_required" }, 401); return appResponse(await listAvailableApps()); } catch (error) { return appFailure(error); } }
export async function POST(request: Request) {
  try { const admin = await getAdminIdentity(); if (!admin) return appResponse({ error: "apps_admin_required" }, 401); if (!hasSameAppRequestOrigin(request)) throw new Error("apps_invalid_origin"); const body = input.parse(await request.json()); const review = { appId: body.appId, expectedVersion: body.expectedVersion, expectedApprovalRevision: body.expectedApprovalRevision, reviewer: admin.username, evidence: body.evidence }; return appResponse({ app: publicAppDefinition(await (body.action === "approve" ? approveRegisteredApp : suspendRegisteredApp)(review)) }); }
  catch (error) { return appFailure(error); }
}
