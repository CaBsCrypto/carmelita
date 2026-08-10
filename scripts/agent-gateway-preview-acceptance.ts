import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inArray } from "drizzle-orm";
import { getDb } from "../db";
import { agentGatewayPlans, mcpAccessTokens } from "../db/schema";
import { issuePersonalMcpToken, revokePersonalMcpToken } from "../app/services/personal-mcp-token-store";

const MARKER = "__CARMELITA_HTTP_STATUS__:";
const MAX_OUTPUT = 1024 * 1024;

export function redactAcceptanceSecrets(value: string, secrets: Iterable<string>) {
  let result = value.replace(/carmelita_user_[A-Za-z0-9_-]+/g, "[REDACTED_PAT]");
  for (const secret of secrets) if (secret) result = result.split(secret).join("[REDACTED]");
  return result;
}
export function parseVercelCurlOutput(output: string) {
  const match = output.match(new RegExp(`\\r?\\n${MARKER}(\\d{3})\\s*$`));
  if (!match || match.index === undefined) throw new Error("preview_acceptance_status_missing");
  const raw = output.slice(0, match.index).trim();
  return { status: Number(match[1]), body: parsePreviewBody(raw) };
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
export function buildVercelCurlArgs(input: { deployment: string; path: string; token: string; method?: string; body?: unknown; accept?: string; headers?: string[] }) {
  const tail = ["--silent", "--show-error", "--request", input.method ?? "GET", "--header", `Authorization: Bearer ${input.token}`, "--header", `Accept: ${input.accept ?? "application/json"}`, "--write-out", `\\n${MARKER}%{http_code}`];
  for (const header of input.headers ?? []) tail.push("--header", header);
  if (input.body !== undefined) tail.push("--header", "Content-Type: application/json", "--data", JSON.stringify(input.body));
  return ["curl", input.path, "--deployment", input.deployment, "--yes", "--no-color", "--", ...tail];
}
function vercelInvocation() {
  if (process.platform !== "win32") return { command: "vercel", prefix: [] as string[] };
  const cli = join(process.env.APPDATA ?? "", "npm", "node_modules", "vercel", "dist", "index.js");
  return existsSync(cli) ? { command: process.execPath, prefix: [cli] } : { command: "vercel.cmd", prefix: [] as string[] };
}
async function vercelCurl(input: Parameters<typeof buildVercelCurlArgs>[0], secrets: Set<string>) {
  const invocation = vercelInvocation();
  return new Promise<ReturnType<typeof parseVercelCurlOutput>>((resolve, reject) => {
    const child = spawn(invocation.command, [...invocation.prefix, ...buildVercelCurlArgs(input)], { cwd: process.cwd(), shell: false, windowsHide: true, env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let exceeded = false;
    const append = (current: string, chunk: Buffer) => { const next = current + chunk.toString("utf8"); if (Buffer.byteLength(next) > MAX_OUTPUT) { exceeded = true; child.kill(); } return next.slice(0, MAX_OUTPUT); };
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => reject(new Error(redactAcceptanceSecrets(error.message, secrets))));
    child.on("close", (code) => { try { if (exceeded) throw new Error("preview_acceptance_output_limit"); if (code !== 0) throw new Error(`preview_acceptance_vercel_curl_failed:${redactAcceptanceSecrets(stderr, secrets)}`); resolve(parseVercelCurlOutput(stdout)); } catch (error) { reject(error); } });
  });
}
function loadMigrationEnv() {
  if (!existsSync(".env.migrate")) return;
  for (const line of readFileSync(".env.migrate", "utf8").split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!match) continue; const value = match[2].replace(/^["']|["']$/g, "").trim(); if (value && !process.env[match[1]]) process.env[match[1]] = value; }
}
export async function cleanupPreviewAcceptanceFixtures(input: { actorIds: string[]; idempotencyKeys: string[]; tokenIds: string[] }) {
  const db = getDb();
  const rows = input.actorIds.length ? await db.select({ id: agentGatewayPlans.id, idempotencyKey: agentGatewayPlans.idempotencyKey }).from(agentGatewayPlans).where(inArray(agentGatewayPlans.actorId, input.actorIds)) : [];
  const keys = new Set(input.idempotencyKeys);
  const exactPlanIds = rows.filter((row) => keys.has(row.idempotencyKey)).map((row) => row.id);
  if (exactPlanIds.length) await db.delete(agentGatewayPlans).where(inArray(agentGatewayPlans.id, exactPlanIds));
  if (input.tokenIds.length) await db.delete(mcpAccessTokens).where(inArray(mcpAccessTokens.id, input.tokenIds));
}
function expectStatus(actual: number, expected: number, label: string, body?: unknown) {
  assert.equal(
    actual,
    expected,
    `${label}: expected HTTP ${expected}, received ${actual}; body=${JSON.stringify(body ?? null)}`,
  );
}
function mcpRequest(id: string, method: string, params: Record<string, unknown> = {}) { return { jsonrpc: "2.0", id, method, params }; }
function mcpText(result: unknown) { const response = result as { result?: { content?: Array<{ text?: string }> } }; const text = response.result?.content?.[0]?.text; return text ? JSON.parse(text) as Record<string, unknown> : null; }
export async function runPreviewAcceptance(deployment: string) {
  loadMigrationEnv();
  if (!deployment) throw new Error("preview_acceptance_deployment_required");
  const runId = randomUUID(); const actorA = `preview-fixture-a-${runId}`; const actorB = `preview-fixture-b-${runId}`; const key = `preview-acceptance-${runId}`;
  const mcpKey = `mcp-preview-${runId}`;
  const actorIds = [actorA, actorB]; const tokenIds: string[] = []; const secrets = new Set<string>(); let failure: unknown;
  try {
    const read = await issuePersonalMcpToken({ userId: actorA, name: `acceptance-read-${runId}`, scopes: ["agent:read"] }); secrets.add(read.token); tokenIds.push(read.credential.id);
    const plan = await issuePersonalMcpToken({ userId: actorA, name: `acceptance-plan-${runId}`, scopes: ["agent:read", "agent:plan"] }); secrets.add(plan.token); tokenIds.push(plan.credential.id);
    const other = await issuePersonalMcpToken({ userId: actorB, name: `acceptance-b-${runId}`, scopes: ["agent:read", "agent:plan"] }); secrets.add(other.token); tokenIds.push(other.credential.id);
    const input = { capabilityId: "stellar.wallet.status", idempotencyKey: key, parameters: { detail: "summary" }, context: { requirementsSatisfied: ["stellar_wallet"] } };
    expectStatus((await vercelCurl({ deployment, path: "/api/v1/actions/plan", token: read.token, method: "POST", body: input }, secrets)).status, 403, "read-only planning");
    const first = await vercelCurl({ deployment, path: "/api/v1/actions/plan", token: plan.token, method: "POST", body: input }, secrets); expectStatus(first.status, 201, "plan creation");
    const planId = (first.body as { plan?: { id?: string } })?.plan?.id; assert.ok(planId, "plan creation returned no ID");
    const replay = await vercelCurl({ deployment, path: "/api/v1/actions/plan", token: plan.token, method: "POST", body: input }, secrets); expectStatus(replay.status, 200, "idempotent replay"); assert.equal((replay.body as { plan?: { id?: string } })?.plan?.id, planId);
    expectStatus((await vercelCurl({ deployment, path: "/api/v1/actions/plan", token: plan.token, method: "POST", body: { ...input, parameters: { detail: "full" } } }, secrets)).status, 409, "idempotency conflict");
    expectStatus((await vercelCurl({ deployment, path: `/api/v1/actions/${planId}`, token: plan.token }, secrets)).status, 200, "owner plan read");
    expectStatus((await vercelCurl({ deployment, path: `/api/v1/actions/${planId}`, token: other.token }, secrets)).status, 404, "cross-user plan read");
    const receipt = await vercelCurl({ deployment, path: `/api/v1/receipts/${planId}`, token: plan.token }, secrets); expectStatus(receipt.status, 202, "missing receipt"); assert.equal((receipt.body as { available?: boolean })?.available, false);
    const mcpHeaders = ["MCP-Protocol-Version: 2025-11-25"];
    const mcp = (token: string, body: unknown) => vercelCurl({ deployment, path: "/api/mcp/agent", token, method: "POST", body, accept: "application/json, text/event-stream", headers: mcpHeaders }, secrets);
    const initialized = await mcp(plan.token, mcpRequest("init-1", "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "carmelita-preview-acceptance", version: "1.0.0" } }));
    expectStatus(initialized.status, 200, "MCP initialize", initialized.body);
    assert.equal((initialized.body as { result?: { serverInfo?: { name?: string } } })?.result?.serverInfo?.name, "agent-assistant-personal");
    const notification = await mcp(plan.token, { jsonrpc: "2.0", method: "notifications/initialized" });
    expectStatus(notification.status, 202, "MCP initialized notification", notification.body);
    assert.equal(notification.body, null);
    const tools = await mcp(plan.token, mcpRequest("tools-1", "tools/list"));
    expectStatus(tools.status, 200, "MCP tools/list", tools.body);
    const names = ((tools.body as { result?: { tools?: Array<{ name: string }> } })?.result?.tools ?? []).map((tool) => tool.name);
    for (const name of ["list_capabilities", "get_capability", "plan_action"]) assert.ok(names.includes(name), `MCP missing ${name}`);
    assert.equal(names.some((name) => /approve|sign|submit|execute/i.test(name)), false, "MCP exposed an execution tool");
    const listed = await mcp(read.token, mcpRequest("call-list", "tools/call", { name: "list_capabilities", arguments: {} }));
    expectStatus(listed.status, 200, "MCP list_capabilities", listed.body);
    const catalog = mcpText(listed.body) as { environment?: string; capabilities?: unknown[] } | null;
    assert.equal(catalog?.environment, "testnet");
    assert.ok((catalog?.capabilities?.length ?? 0) >= 30, "MCP capability catalog is incomplete");
    const planCall = (token: string, id: string, detail: string) => mcp(token, mcpRequest(id, "tools/call", { name: "plan_action", arguments: { capabilityId: "stellar.wallet.status", idempotencyKey: mcpKey, parameters: { detail }, context: { requirementsSatisfied: ["stellar_wallet"] } } }));
    const denied = await planCall(read.token, "call-denied", "summary");
    expectStatus(denied.status, 200, "MCP scope denial transport", denied.body);
    assert.equal((denied.body as { result?: { isError?: boolean } })?.result?.isError, true, "read PAT unexpectedly planned through MCP");
    assert.equal((mcpText(denied.body) as { error?: string } | null)?.error, "mcp_scope_required");
    const mcpFirst = await planCall(plan.token, "call-plan-1", "summary");
    expectStatus(mcpFirst.status, 200, "MCP plan_action", mcpFirst.body);
    const mcpPlan = mcpText(mcpFirst.body) as { plan?: { id?: string; environment?: string; safety?: { executionEnabled?: boolean } } } | null;
    assert.ok(mcpPlan?.plan?.id, "MCP plan returned no ID");
    assert.equal(mcpPlan?.plan?.environment, "testnet");
    assert.equal(mcpPlan?.plan?.safety?.executionEnabled, false);
    const mcpReplay = mcpText((await planCall(plan.token, "call-plan-2", "summary")).body) as { plan?: { id?: string } } | null;
    assert.equal(mcpReplay?.plan?.id, mcpPlan?.plan?.id, "MCP replay changed plan ID");
    const otherPlan = mcpText((await planCall(other.token, "call-plan-b", "summary")).body) as { plan?: { id?: string } } | null;
    assert.ok(otherPlan?.plan?.id, "MCP actor B returned no plan ID");
    assert.notEqual(otherPlan?.plan?.id, mcpPlan?.plan?.id, "MCP actors shared a plan");
    const mcpConflict = await planCall(plan.token, "call-plan-3", "full");
    assert.equal((mcpConflict.body as { result?: { isError?: boolean } })?.result?.isError, true, "MCP changed replay did not conflict");
    assert.equal((mcpText(mcpConflict.body) as { error?: string } | null)?.error, "gateway_idempotency_conflict");
    await revokePersonalMcpToken(actorA, plan.credential.id);
    expectStatus((await vercelCurl({ deployment, path: `/api/v1/actions/${planId}`, token: plan.token }, secrets)).status, 401, "revoked PAT");
    expectStatus((await mcp(plan.token, mcpRequest("tools-revoked", "tools/list"))).status, 401, "revoked MCP PAT");
    return { ok: true, checks: 20 };
  } catch (error) { failure = error; throw new Error(redactAcceptanceSecrets(error instanceof Error ? error.message : String(error), secrets)); }
  finally {
    for (const [actor, tokenId] of [[actorA, tokenIds[0]], [actorA, tokenIds[1]], [actorB, tokenIds[2]]] as const) if (tokenId) try { await revokePersonalMcpToken(actor, tokenId); } catch { /* exact delete below */ }
    try { await cleanupPreviewAcceptanceFixtures({ actorIds, idempotencyKeys: [key, mcpKey], tokenIds }); } catch (error) { const cleanup = `preview_acceptance_cleanup_failed:${error instanceof Error ? error.message : String(error)}`; const original = failure instanceof Error ? failure.message : failure ? String(failure) : ""; throw new Error(redactAcceptanceSecrets(original ? `${original};${cleanup}` : cleanup, secrets)); }
    secrets.clear();
  }
}
export function deploymentArg(args: string[] = process.argv, fallback = process.env.CARMELITA_PREVIEW_URL) {
  const index = args.indexOf("--deployment");
  if (index >= 0) return args[index + 1];
  return args.slice(2).find((arg) => arg.startsWith("https://")) ?? fallback;
}
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) { const result = await runPreviewAcceptance(deploymentArg() ?? ""); console.log(`Gateway Preview acceptance: PASS (${result.checks} checks)`); }
