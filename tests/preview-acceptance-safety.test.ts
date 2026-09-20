import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { gatewayPseudonym } from "../app/agent-gateway/operations";
import { acceptanceConfig, authenticatedAcceptanceRequest } from "../scripts/acceptance";
import { acceptanceReport, assertRemotePreview, buildVercelCurlArgs, deploymentArg, parseVercelCurlOutput, previewAcceptanceTarget, previewFixtureCleanupFilters, redactAcceptanceSecrets, tagPreviewRequest } from "../scripts/agent-gateway-preview-acceptance";
import { validateRegistryUser, type Registry } from "../scripts/wallet-onboarding-preview-acceptance";

const preview = "https://isolated-preview.vercel.app";
const commit = "a".repeat(40);
const env = {
  CARMELITA_PREVIEW_ISOLATED: "true",
  CARMELITA_PREVIEW_DATABASE_HOST: "ep-test.neon.tech",
  CARMELITA_PREVIEW_ORIGIN: preview,
  CARMELITA_PREVIEW_DEPLOYMENT: preview,
  CARMELITA_PREVIEW_COMMIT: commit,
  CARMELITA_PREVIEW_DATABASE_URL: "postgresql://test:fixture@ep-test-pooler.neon.tech/preview?sslmode=require",
  CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED: "postgresql://test:fixture@ep-test.neon.tech/preview?sslmode=require",
  AGENT_ACCEPTANCE_BASE_URL: preview,
  AGENT_ACCEPTANCE_PRIVY_TOKEN: "temporary-test-token",
};
const authenticatedArgs = ["node", "script", "authenticated"];

test("acceptance rejects legacy automatic execution before any requests", () => {
  assert.throws(() => acceptanceConfig(["node", "script", "execute"], env), /automatic_payment_execution_disabled/);
});
test("doctor requires an explicit URL and permits read-only production without a database", () => {
  assert.throws(() => acceptanceConfig(["node", "script", "doctor"], {}), /BASE_URL_or_url_required/);
  const config = acceptanceConfig(["node", "script", "doctor", "--url", "https://carmelita-agent.vercel.app"], {});
  assert.equal(config.preview, undefined);
  assert.equal(config.allowBootstrap, false);
  assert.equal(acceptanceConfig(["node", "script", "doctor", "--url", "https://carmelita-agent.vercel.app"], env).deployment, undefined);
});
test("a URL flag cannot implicitly supply the separate deployment selection", () => {
  assert.equal(deploymentArg(["node", "script", "--url", preview], ""), "");
  assert.throws(() => deploymentArg(["node", "script", "--deployment", "--url", preview], ""), /deployment_required/);
});
test("authenticated acceptance rejects missing URL, deployment and commit, production and target substitution", () => {
  for (const [key, error] of [["AGENT_ACCEPTANCE_BASE_URL", /BASE_URL_or_url_required/], ["CARMELITA_PREVIEW_DEPLOYMENT", /deployment_required/], ["CARMELITA_PREVIEW_COMMIT", /full_commit_required/]] as const) {
    assert.throws(() => acceptanceConfig(authenticatedArgs, { ...env, [key]: undefined }), error);
  }
  assert.throws(() => acceptanceConfig(authenticatedArgs, { ...env, CARMELITA_PREVIEW_ISOLATED: "false" }), /not_enabled/);
  assert.throws(() => acceptanceConfig(authenticatedArgs, { ...env, AGENT_ACCEPTANCE_BASE_URL: "https://carmelita-agent.vercel.app" }), /origin_mismatch/);
  assert.throws(() => previewAcceptanceTarget({ url: preview, deployment: "https://other.vercel.app", commit }, env), /deployment_mismatch/);
});
test("authenticated acceptance requires dedicated Preview connections and cannot fall back to Marketplace variables", () => {
  const marketplace = { DATABASE_URL: "postgresql://legacy:fixture@ep-production.neon.tech/production?sslmode=require", DATABASE_URL_UNPOOLED: "postgresql://legacy:fixture@ep-production.neon.tech/production?sslmode=require" };
  const config = acceptanceConfig(authenticatedArgs, { ...env, ...marketplace });
  assert.equal(config.preview?.databaseUrl, env.CARMELITA_PREVIEW_DATABASE_URL);
  assert.equal(config.preview?.migrationDatabaseUrl, env.CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED);
  for (const key of ["CARMELITA_PREVIEW_DATABASE_URL", "CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED"]) {
    assert.throws(() => acceptanceConfig(authenticatedArgs, { ...env, ...marketplace, [key]: undefined }), /missing_CARMELITA_PREVIEW_DATABASE_URL/);
  }
});
test("bootstrap requires a separate opt-in and sends the correct Origin", () => {
  const readOnly = acceptanceConfig(authenticatedArgs, env);
  assert.throws(() => authenticatedAcceptanceRequest("/api/agent/bootstrap", readOnly, {}), /write_not_allowed/);
  const writes = acceptanceConfig([...authenticatedArgs, "--allow-bootstrap"], env);
  const request = authenticatedAcceptanceRequest("/api/agent/bootstrap", writes, {});
  assert.equal(request.origin, preview);
  assert.equal(request.method, "POST");
  assert.ok(buildVercelCurlArgs(request).includes(`Origin: ${preview}`));
  for (const action of ["prepare_trustline", "execute_trustline", "claim_testnet_usdc", "prepare", "execute"]) {
    assert.throws(() => authenticatedAcceptanceRequest("/api/agent/x402", writes, { action, explicitConfirmation: true }), /write_not_allowed/);
  }
  assert.equal(authenticatedAcceptanceRequest("/api/agent/x402", readOnly).method, "GET");
});
test("remote Preview verification binds database and exact commit before authenticated writes", () => {
  const target = previewAcceptanceTarget({ url: preview, deployment: preview, commit }, env);
  const valid = { previewIsolation: { verified: true, databaseFingerprint: createHash("sha256").update("ep-test.neon.tech/preview").digest("hex") }, deployment: { environment: "preview", gitCommitSha: commit } };
  assert.doesNotThrow(() => assertRemotePreview(valid, target));
  assert.throws(() => assertRemotePreview({}, target), /is not verified/);
  assert.throws(() => assertRemotePreview({ ...valid, previewIsolation: { ...valid.previewIsolation, databaseFingerprint: "different" } }, target), /database differs/);
  assert.throws(() => assertRemotePreview({ ...valid, deployment: { ...valid.deployment, environment: "production" } }, target), /not a Preview/);
  assert.throws(() => assertRemotePreview({ ...valid, deployment: { ...valid.deployment, gitCommitSha: "b".repeat(40) } }, target), /commit differs/);
});
test("protected Preview transport retains cookies without following redirects or accepting external paths", () => {
  const parsed = parseVercelCurlOutput('HTTP/2 200\r\nset-cookie: aa_founder_session=test; Secure; HttpOnly\r\ncontent-type: application/json\r\n\r\n{"ok":true}\n__CARMELITA_HTTP_STATUS__:200');
  assert.equal(parsed.headers?.["set-cookie"], "aa_founder_session=test; Secure; HttpOnly");
  assert.deepEqual(parsed.body, { ok: true });
  const args = buildVercelCurlArgs({ deployment: preview, path: "/api/admin/session", origin: preview, includeHeaders: true });
  assert.ok(args.includes("--include"));
  assert.equal(args.includes("--location"), false);
  assert.equal(args.some((arg) => arg.startsWith("Authorization:")), false);
  for (const path of ["https://other.example/api", "//other.example/api", "/api\nheader"]) assert.throws(() => buildVercelCurlArgs({ deployment: preview, path }), /relative_path_required/);
});
test("reports count actual outcomes and preserve pending human acceptance", () => {
  const report = acceptanceReport({ url: preview, deployment: preview, commit, checks: [
    { name: "Metadata", status: "PASS", durationMs: 10, detail: "Checked" },
    { name: "Browser login", status: "PENDING", durationMs: 0, detail: "Not checked" },
  ] });
  assert.equal(report.status, "PENDING");
  assert.equal(report.passed, 1);
  assert.equal(report.pending, 1);
  assert.equal(report.failed, 0);
  assert.ok(Number.isFinite(Date.parse(report.generatedAt)));
  assert.equal(acceptanceReport({ ...report, checks: [...report.checks, { name: "Request", status: "FAIL", durationMs: 1, detail: "HTTP 401" }] }).status, "FAIL");
});
test("failure reports redact database URLs as well as tokens", () => {
  assert.equal(redactAcceptanceSecrets(`connection=${env.CARMELITA_PREVIEW_DATABASE_URL} token=temporary-test-token`, [env.AGENT_ACCEPTANCE_PRIVY_TOKEN]), "connection=[REDACTED_DATABASE_URL] token=[REDACTED]");
});
test("wallet acceptance requires every bootstrap network, unique records and valid registered addresses without funding", () => {
  const registry: Registry = { summary: { users: 1, wallets: 3, completeUsers: 0, needsAttention: 1 }, users: [{ email: "test@example.com", registeredComplete: true, missingNetworks: [], invalidAddressNetworks: [], duplicateNetworks: [], wallets: ["stellar:testnet", "avalanche:fuji", "solana:devnet"].map((network) => ({ network, address: "fixture", validAddress: true, status: "pending" })) }] };
  assert.doesNotThrow(() => validateRegistryUser(registry, "TEST@example.com"));
  const missing = structuredClone(registry); missing.users[0].wallets.pop();
  assert.throws(() => validateRegistryUser(missing, "test@example.com"), /exactly one solana:devnet/);
  const duplicate = structuredClone(registry); duplicate.users.push(duplicate.users[0]);
  assert.throws(() => validateRegistryUser(duplicate, "test@example.com"), /exactly one registry record/);
});
test("cleanup selects only this run's request IDs and scope-specific actor/token rate buckets", () => {
  const filters = previewFixtureCleanupFilters({ actorIds: ["preview-fixture-a-run"], tokenIds: ["mcpk_run_token"], requestIds: ["preview-request-a", "preview-request-b", "preview-request-a"] });
  assert.ok(filters.audit);
  assert.ok(filters.rateLimits);
  const dialect = new PgDialect();
  const audit = dialect.sqlToQuery(filters.audit);
  assert.deepEqual(audit.params, ["preview-request-a", "preview-request-b"]);
  assert.match(audit.sql, /"request_id" in/);
  const rate = dialect.sqlToQuery(filters.rateLimits);
  assert.deepEqual(rate.params, ["personal_pat_usage", gatewayPseudonym("token", "mcpk_run_token"), "personal_pat_creation", gatewayPseudonym("actor", "preview-fixture-a-run")]);
  assert.match(rate.sql, /"scope" = \$1 and .*"subject_pseudonym" in \(\$2\)/);
  assert.match(rate.sql, /"scope" = \$3 and .*"subject_pseudonym" in \(\$4\)/);
  assert.equal(rate.params.includes(gatewayPseudonym("actor", "real-user")), false);
  assert.equal(rate.params.includes("global"), false);
  assert.deepEqual(previewFixtureCleanupFilters({ actorIds: [], tokenIds: [], requestIds: [] }), { audit: undefined, rateLimits: undefined });
});
test("every Gateway request receives an exact cleanup ID including failed authentication", () => {
  const requestIds: string[] = [];
  const input = { deployment: preview, path: "/api/mcp/agent", token: "revoked-fixture", headers: ["MCP-Protocol-Version: 2025-11-25"] };
  const first = tagPreviewRequest(input, requestIds);
  const second = tagPreviewRequest(input, requestIds);
  assert.equal(requestIds.length, 2);
  assert.notEqual(requestIds[0], requestIds[1]);
  for (const [index, request] of [first, second].entries()) {
    assert.match(requestIds[index], /^[A-Za-z0-9_-]{8,80}$/);
    assert.ok(buildVercelCurlArgs(request).includes(`X-Request-ID: ${requestIds[index]}`));
    assert.ok(request.headers.includes("MCP-Protocol-Version: 2025-11-25"));
  }
  assert.throws(() => tagPreviewRequest({ ...input, headers: ["x-request-id: existing-request"] }, requestIds), /already_supplied/);
});
