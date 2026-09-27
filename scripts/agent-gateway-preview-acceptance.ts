import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { agentGatewayAuditEvents, agentGatewayPlans, agentGatewayRateLimits, mcpAccessTokens } from "../db/schema";
import { issuePersonalMcpToken, revokePersonalMcpToken } from "../app/services/personal-mcp-token-store";
import { assertPreviewIsolation } from "../app/preview-isolation";
import { gatewayPseudonym } from "../app/agent-gateway/operations";

const MARKER = "__CARMELITA_HTTP_STATUS__:";
const MAX_OUTPUT = 1024 * 1024;

export type AcceptanceCheck = { name: string; status: "PASS" | "FAIL" | "PENDING"; durationMs: number; detail: string };
export function acceptanceReport(input: { url: string; deployment: string | null; commit: string | null; checks: AcceptanceCheck[] }) {
  const passed = input.checks.filter((check) => check.status === "PASS").length;
  const failed = input.checks.filter((check) => check.status === "FAIL").length;
  const pending = input.checks.filter((check) => check.status === "PENDING").length;
  return { ...input, generatedAt: new Date().toISOString(), status: failed ? "FAIL" : pending ? "PENDING" : "PASS", passed, failed, pending };
}
export function previewAcceptanceTarget(
  input: { url?: string; deployment?: string; commit?: string },
  env: Record<string, string | undefined> = process.env,
) {
  if (!input.url) throw new Error("preview_acceptance_url_required");
  if (!input.deployment) throw new Error("preview_acceptance_deployment_required");
  if (!input.commit || !/^[a-f0-9]{40}$/i.test(input.commit)) throw new Error("preview_acceptance_full_commit_required");
  const isolation = assertPreviewIsolation(env);
  const url = new URL(input.url);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.origin !== isolation.previewOrigin) throw new Error("preview_acceptance_origin_mismatch");
  if (input.deployment.replace(/\/$/, "") !== isolation.deployment.replace(/\/$/, "")) throw new Error("preview_acceptance_deployment_mismatch");
  return { ...isolation, url: url.origin, commit: input.commit };
}
export function acceptanceArg(name: string, args: string[] = process.argv) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) throw new Error(`preview_acceptance_${name.slice(2)}_required`);
  return value;
}
export function assertRemotePreview(body: unknown, target: ReturnType<typeof previewAcceptanceTarget>) {
  const metadata = body as { previewIsolation?: { verified?: boolean; databaseFingerprint?: string }; deployment?: { environment?: string; gitCommitSha?: string } } | null;
  const database = new URL(target.databaseUrl);
  const databaseIdentity = `${database.hostname.toLowerCase().replace(/-pooler(?=\.)/, "")}/${database.pathname.slice(1)}`;
  const fingerprint = createHash("sha256").update(databaseIdentity).digest("hex");
  assert.equal(metadata?.previewIsolation?.verified, true, "Remote Preview isolation is not verified");
  assert.equal(metadata?.previewIsolation?.databaseFingerprint, fingerprint, "Remote Preview database differs from acceptance database");
  assert.equal(metadata?.deployment?.environment, "preview", "Remote deployment is not a Preview");
  assert.equal(metadata?.deployment?.gitCommitSha, target.commit, "Remote Preview commit differs from requested commit");
}

export function redactAcceptanceSecrets(value: string, secrets: Iterable<string>) {
  let result = value.replace(/carmelita_user_[A-Za-z0-9_-]+/g, "[REDACTED_PAT]").replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
  for (const secret of secrets) if (secret) result = result.split(secret).join("[REDACTED]");
  return result;
}
export function parseVercelCurlOutput(output: string) {
  const match = output.match(new RegExp(`\\r?\\n${MARKER}(\\d{3})\\s*$`));
  if (!match || match.index === undefined) throw new Error("preview_acceptance_status_missing");
  let raw = output.slice(0, match.index).trim();
  const headers: Record<string, string> = {};
  while (/^HTTP\/\S+ \d{3}/.test(raw)) {
    const boundary = raw.match(/\r?\n\r?\n/);
    if (!boundary || boundary.index === undefined) throw new Error("preview_acceptance_headers_invalid");
    for (const line of raw.slice(0, boundary.index).split(/\r?\n/).slice(1)) {
      const colon = line.indexOf(":");
      if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
    }
    raw = raw.slice(boundary.index + boundary[0].length).trim();
  }
  return { status: Number(match[1]), body: parsePreviewBody(raw), ...(Object.keys(headers).length ? { headers } : {}) };
}
export function parsePreviewBody(raw: string): unknown {
  if (!raw) return null;
  const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
  const candidate = data.length ? data.at(-1) as string : raw;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return { nonJson: true, raw: candidate.slice(0, 4_096) };
  }
}
export function buildVercelCurlArgs(input: { deployment: string; path: string; token?: string; origin?: string; method?: string; body?: unknown; accept?: string; headers?: string[]; includeHeaders?: boolean }) {
  if (!input.path.startsWith("/") || input.path.startsWith("//") || /[\r\n]/.test(input.path)) throw new Error("preview_acceptance_relative_path_required");
  const tail = ["--silent", "--show-error", "--max-time", "30", "--request", input.method ?? "GET", "--header", `Accept: ${input.accept ?? "application/json"}`, "--write-out", `\\n${MARKER}%{http_code}`];
  if (input.token) tail.push("--header", `Authorization: Bearer ${input.token}`);
  if (input.origin) tail.push("--header", `Origin: ${input.origin}`);
  if (input.includeHeaders) tail.push("--include");
  for (const header of input.headers ?? []) tail.push("--header", header);
  if (input.body !== undefined) tail.push("--header", "Content-Type: application/json", "--data", JSON.stringify(input.body));
  return ["curl", input.path, "--deployment", input.deployment, "--yes", "--", ...tail];
}
function vercelInvocation() {
  if (process.platform !== "win32") return { command: "vercel", prefix: [] as string[] };
  const cli = join(process.env.APPDATA ?? "", "npm", "node_modules", "vercel", "dist", "index.js");
  return existsSync(cli) ? { command: process.execPath, prefix: [cli] } : { command: "vercel.cmd", prefix: [] as string[] };
}
export async function vercelCurl(input: Parameters<typeof buildVercelCurlArgs>[0], secrets: Set<string> = new Set()) {
  const invocation = vercelInvocation();
  return new Promise<ReturnType<typeof parseVercelCurlOutput>>((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.prefix, ...buildVercelCurlArgs(input)], { cwd: process.cwd(), shell: false, windowsHide: true, env: { ...process.env, NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let exceeded = false;
    const append = (current: string, chunk: Buffer) => { const next = current + chunk.toString("utf8"); if (Buffer.byteLength(next) > MAX_OUTPUT) { exceeded = true; child.kill(); } return next.slice(0, MAX_OUTPUT); };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => reject(new Error(redactAcceptanceSecrets(error.message, secrets))));
    child.on("close", (code) => { try { if (exceeded) throw new Error("preview_acceptance_output_limit"); if (code !== 0) throw new Error(`preview_acceptance_vercel_curl_failed:${redactAcceptanceSecrets(stderr, secrets)}`); resolve(parseVercelCurlOutput(stdout)); } catch (error) { reject(error); } });
  });
}
type PreviewFixtures = { actorIds: string[]; idempotencyKeys: string[]; tokenIds: string[]; requestIds: string[] };
export function previewFixtureCleanupFilters(input: Pick<PreviewFixtures, "actorIds" | "tokenIds" | "requestIds">) {
  const actors = [...new Set(input.actorIds)].map((id) => gatewayPseudonym("actor", id));
  const tokens = [...new Set(input.tokenIds)].map((id) => gatewayPseudonym("token", id));
  const requests = [...new Set(input.requestIds)];
  return {
    audit: requests.length ? inArray(agentGatewayAuditEvents.requestId, requests) : undefined,
    rateLimits: or(
      tokens.length ? and(eq(agentGatewayRateLimits.scope, "personal_pat_usage"), inArray(agentGatewayRateLimits.subjectPseudonym, tokens)) : undefined,
      actors.length ? and(eq(agentGatewayRateLimits.scope, "personal_pat_creation"), inArray(agentGatewayRateLimits.subjectPseudonym, actors)) : undefined,
    ),
  };
}
export function tagPreviewRequest(input: Parameters<typeof buildVercelCurlArgs>[0], requestIds: string[]) {
  if ((input.headers ?? []).some((header) => /^x-request-id\s*:/i.test(header))) throw new Error("preview_request_id_already_supplied");
  const requestId = `preview-${randomUUID()}`;
  requestIds.push(requestId);
  return { ...input, headers: [...(input.headers ?? []), `X-Request-ID: ${requestId}`] };
}
export async function cleanupPreviewAcceptanceFixtures(input: PreviewFixtures) {
  assertPreviewIsolation();
  const db = getDb();
  const rows = input.actorIds.length ? await db.select({ id: agentGatewayPlans.id, idempotencyKey: agentGatewayPlans.idempotencyKey }).from(agentGatewayPlans).where(inArray(agentGatewayPlans.actorId, input.actorIds)) : [];
  const keys = new Set(input.idempotencyKeys);
  const exactPlanIds = rows.filter((row) => keys.has(row.idempotencyKey)).map((row) => row.id);
  const filters = previewFixtureCleanupFilters(input);
  const plans = exactPlanIds.length ? await db.delete(agentGatewayPlans).where(inArray(agentGatewayPlans.id, exactPlanIds)).returning({ id: agentGatewayPlans.id }) : [];
  const tokens = input.tokenIds.length ? await db.delete(mcpAccessTokens).where(inArray(mcpAccessTokens.id, input.tokenIds)).returning({ id: mcpAccessTokens.id }) : [];
  const rateLimits = filters.rateLimits ? await db.delete(agentGatewayRateLimits).where(filters.rateLimits).returning({ key: agentGatewayRateLimits.key }) : [];
  const auditEvents = filters.audit ? await db.delete(agentGatewayAuditEvents).where(filters.audit).returning({ id: agentGatewayAuditEvents.id }) : [];
  return { plans: plans.length, tokens: tokens.length, rateLimits: rateLimits.length, auditEvents: auditEvents.length };
}
function mcpRequest(id: string, method: string, params: Record<string, unknown> = {}) { return { jsonrpc: "2.0", id, method, params }; }
function mcpText(result: unknown) { const response = result as { result?: { content?: Array<{ text?: string }> } }; const text = response.result?.content?.[0]?.text; return text ? JSON.parse(text) as Record<string, unknown> : null; }
export async function runPreviewAcceptance(deployment: string, options: { url?: string; commit?: string } = {}) {
  const target = previewAcceptanceTarget({ deployment, url: options.url ?? process.env.CARMELITA_PREVIEW_URL, commit: options.commit ?? process.env.CARMELITA_PREVIEW_COMMIT });
  const checks: AcceptanceCheck[] = [];
  const expectStatus = (actual: number, expected: number, label: string) => {
    const ok = actual === expected;
    checks.push({ name: label, status: ok ? "PASS" : "FAIL", durationMs: 0, detail: `Expected HTTP ${expected}; received ${actual}` });
    assert.equal(actual, expected, `${label}: expected HTTP ${expected}, received ${actual}`);
  };
  const record = (name: string, detail: string) => checks.push({ name, status: "PASS", durationMs: 0, detail });
  const runId = randomUUID(); const actorA = `preview-fixture-a-${runId}`; const actorB = `preview-fixture-b-${runId}`; const key = `preview-acceptance-${runId}`;
  const mcpKey = `mcp-preview-${runId}`;
  const actorIds = [actorA, actorB]; const tokenIds: string[] = []; const requestIds: string[] = []; const secrets = new Set<string>();
  const request = (input: Parameters<typeof buildVercelCurlArgs>[0], requestSecrets: Set<string>) => vercelCurl(tagPreviewRequest(input, requestIds), requestSecrets);
  let fixturesStarted = false;
  try {
    const health = await request({ deployment, path: "/api/health", origin: target.url }, secrets);
    expectStatus(health.status, 200, "Remote Preview health");
    assertRemotePreview(health.body, target);
    record("Remote Preview isolation and commit", "Runtime database fingerprint and commit match the explicitly selected Preview");
    fixturesStarted = true;
    const read = await issuePersonalMcpToken({ userId: actorA, name: `acceptance-read-${runId}`, scopes: ["agent:read"] }); secrets.add(read.token); tokenIds.push(read.credential.id);
    const plan = await issuePersonalMcpToken({ userId: actorA, name: `acceptance-plan-${runId}`, scopes: ["agent:read", "agent:plan"] }); secrets.add(plan.token); tokenIds.push(plan.credential.id);
    const other = await issuePersonalMcpToken({ userId: actorB, name: `acceptance-b-${runId}`, scopes: ["agent:read", "agent:plan"] }); secrets.add(other.token); tokenIds.push(other.credential.id);
    const input = { capabilityId: "stellar.wallet.status", idempotencyKey: key, parameters: { detail: "summary" }, context: { requirementsSatisfied: ["stellar_wallet"] } };
    expectStatus((await request({ deployment, path: "/api/v1/actions/plan", token: read.token, method: "POST", body: input }, secrets)).status, 403, "read-only planning");
    const first = await request({ deployment, path: "/api/v1/actions/plan", token: plan.token, method: "POST", body: input }, secrets); expectStatus(first.status, 201, "plan creation");
    const planId = (first.body as { plan?: { id?: string } })?.plan?.id; assert.ok(planId, "plan creation returned no ID");
    const replay = await request({ deployment, path: "/api/v1/actions/plan", token: plan.token, method: "POST", body: input }, secrets); expectStatus(replay.status, 200, "idempotent replay"); assert.equal((replay.body as { plan?: { id?: string } })?.plan?.id, planId);
    record("REST replay identity", "Repeated request returned the same plan ID");
    expectStatus((await request({ deployment, path: "/api/v1/actions/plan", token: plan.token, method: "POST", body: { ...input, parameters: { detail: "full" } } }, secrets)).status, 409, "idempotency conflict");
    expectStatus((await request({ deployment, path: `/api/v1/actions/${planId}`, token: plan.token }, secrets)).status, 200, "owner plan read");
    expectStatus((await request({ deployment, path: `/api/v1/actions/${planId}`, token: other.token }, secrets)).status, 404, "cross-user plan read");
    expectStatus((await request({ deployment, path: `/api/v1/receipts/${planId}`, token: other.token }, secrets)).status, 404, "cross-user receipt read");
    const receipt = await request({ deployment, path: `/api/v1/receipts/${planId}`, token: plan.token }, secrets); expectStatus(receipt.status, 202, "missing receipt"); assert.equal((receipt.body as { available?: boolean })?.available, false);
    const mcpHeaders = ["MCP-Protocol-Version: 2025-11-25"];
    const mcp = (token: string, body: unknown) => request({ deployment, path: "/api/mcp/agent", token, method: "POST", body, accept: "application/json, text/event-stream", headers: mcpHeaders }, secrets);
    const initialized = await mcp(plan.token, mcpRequest("init-1", "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "carmelita-preview-acceptance", version: "1.0.0" } }));
    expectStatus(initialized.status, 200, "MCP initialize");
    assert.equal((initialized.body as { result?: { serverInfo?: { name?: string } } })?.result?.serverInfo?.name, "agent-assistant-personal");
    const notification = await mcp(plan.token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expectStatus(notification.status, 202, "MCP initialized notification");
    assert.equal(notification.body, null);
    const tools = await mcp(plan.token, mcpRequest("tools-1", "tools/list"));
    expectStatus(tools.status, 200, "MCP tools/list");
    const names = ((tools.body as { result?: { tools?: Array<{ name: string }> } })?.result?.tools ?? []).map((tool) => tool.name);
    for (const name of ["list_capabilities", "get_capability", "plan_action"]) assert.ok(names.includes(name), `MCP missing ${name}`);
    assert.equal(names.some((name) => /approve|sign|submit|execute/i.test(name)), false, "MCP exposed an execution tool");
    record("MCP execution boundary", "Read and planning tools available; no approval, signing or execution tool");
    const listed = await mcp(read.token, mcpRequest("call-list", "tools/call", { name: "list_capabilities", arguments: {} }));
    expectStatus(listed.status, 200, "MCP list_capabilities");
    const catalog = mcpText(listed.body) as { environment?: string; capabilities?: unknown[] } | null;
    assert.equal(catalog?.environment, "testnet");
    assert.ok((catalog?.capabilities?.length ?? 0) >= 30, "MCP capability catalog is incomplete");
    const planCall = (token: string, id: string, detail: string) => mcp(token, mcpRequest(id, "tools/call", { name: "plan_action", arguments: { capabilityId: "stellar.wallet.status", idempotencyKey: mcpKey, parameters: { detail }, context: { requirementsSatisfied: ["stellar_wallet"] } } }));
    const denied = await planCall(read.token, "call-denied", "summary");
    expectStatus(denied.status, 200, "MCP scope denial transport");
    assert.equal((denied.body as { result?: { isError?: boolean } })?.result?.isError, true, "read PAT unexpectedly planned through MCP");
    assert.equal((mcpText(denied.body) as { error?: string } | null)?.error, "mcp_scope_required");
    record("MCP read-only scope enforcement", "Planning rejected with a tool error and mcp_scope_required");
    const mcpFirst = await planCall(plan.token, "call-plan-1", "summary");
    expectStatus(mcpFirst.status, 200, "MCP plan_action");
    const mcpPlan = mcpText(mcpFirst.body) as { plan?: { id?: string; environment?: string; safety?: { executionEnabled?: boolean } } } | null;
    assert.ok(mcpPlan?.plan?.id, "MCP plan returned no ID");
    assert.equal(mcpPlan?.plan?.environment, "testnet");
    assert.equal(mcpPlan?.plan?.safety?.executionEnabled, false);
    record("MCP plan safety", "Plan is Testnet-only with execution disabled");
    const mcpReplay = mcpText((await planCall(plan.token, "call-plan-2", "summary")).body) as { plan?: { id?: string } } | null;
    assert.equal(mcpReplay?.plan?.id, mcpPlan?.plan?.id, "MCP replay changed plan ID");
    record("MCP replay identity", "Repeated request returned the same plan ID");
    const otherPlan = mcpText((await planCall(other.token, "call-plan-b", "summary")).body) as { plan?: { id?: string } } | null;
    assert.ok(otherPlan?.plan?.id, "MCP actor B returned no plan ID");
    assert.notEqual(otherPlan?.plan?.id, mcpPlan?.plan?.id, "MCP actors shared a plan");
    record("MCP actor isolation", "Independent actors received independent plan IDs");
    const mcpConflict = await planCall(plan.token, "call-plan-3", "full");
    assert.equal((mcpConflict.body as { result?: { isError?: boolean } })?.result?.isError, true, "MCP changed replay did not conflict");
    assert.equal((mcpText(mcpConflict.body) as { error?: string } | null)?.error, "gateway_idempotency_conflict");
    record("MCP changed-input conflict", "Changed input rejected with gateway_idempotency_conflict");
    await revokePersonalMcpToken(actorA, plan.credential.id);
    expectStatus((await request({ deployment, path: `/api/v1/actions/${planId}`, token: plan.token }, secrets)).status, 401, "revoked PAT");
    expectStatus((await mcp(plan.token, mcpRequest("tools-revoked", "tools/list"))).status, 401, "revoked MCP PAT");
  } catch (error) {
    checks.push({ name: "Gateway acceptance execution", status: "FAIL", durationMs: 0, detail: redactAcceptanceSecrets(error instanceof Error ? error.message : String(error), secrets) });
  }
  finally {
    for (const [actor, tokenId] of [[actorA, tokenIds[0]], [actorA, tokenIds[1]], [actorB, tokenIds[2]]] as const) if (tokenId) try { await revokePersonalMcpToken(actor, tokenId); } catch { /* exact delete below */ }
    if (fixturesStarted) {
      try {
        const cleaned = await cleanupPreviewAcceptanceFixtures({ actorIds, idempotencyKeys: [key, mcpKey], tokenIds, requestIds });
        record("Exact fixture cleanup", `Removed ${cleaned.plans} plans, ${cleaned.tokens} tokens, ${cleaned.rateLimits} actor/token-specific rate buckets and ${cleaned.auditEvents} request-specific audit events. Shared and historical rows were not selected.`);
      } catch (error) {
        checks.push({ name: "Exact fixture cleanup", status: "FAIL", durationMs: 0, detail: redactAcceptanceSecrets(`preview_acceptance_cleanup_failed:${error instanceof Error ? error.message : String(error)}`, secrets) });
      }
    }
    secrets.clear();
  }
  checks.push({ name: "Privy login, session recovery and two-user persistence", status: "PENDING", durationMs: 0, detail: "Gateway actors are synthetic fixtures. Validate two exclusive Privy test identities through the application." });
  return acceptanceReport({ url: target.url, deployment, commit: target.commit, checks });
}
export function deploymentArg(args: string[] = process.argv, fallback = process.env.CARMELITA_PREVIEW_DEPLOYMENT) {
  const named = acceptanceArg("--deployment", args);
  if (named) return named;
  return args.find((arg, index) => index >= 2 && arg.startsWith("https://") && !args[index - 1]?.startsWith("--")) ?? fallback;
}
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  const result = await runPreviewAcceptance(deploymentArg() ?? "", { url: acceptanceArg("--url"), commit: acceptanceArg("--commit") });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
}
