import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { mock } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { SQL } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { localProposalPostgresConfig, proposalPostgresSchema } from "../scripts/proposal-email-postgres-config.mjs";

type Result = { rows: Record<string, unknown>[] };
type Client = {
  connect: () => Promise<void>; end: () => Promise<void>;
  query: (query: string | { text: string; values: unknown[]; rowMode: "array" }, params?: unknown[]) => Promise<Result>;
};
const config = localProposalPostgresConfig(process.env.CARMELITA_PROPOSAL_PG_URL);
const { default: driver } = await import(new URL("../work/proposal-email-postgres-runtime/node_modules/pg/lib/index.js", import.meta.url).href) as {
  default: { Client: new (options: typeof config) => Client };
};
const client = new driver.Client(config);
const schema = `carmelita_proposal_qa_${randomUUID().replaceAll("-", "")}`;
const quotedSchema = proposalPostgresSchema(schema);
const marker = randomUUID();
let connected = false, owned = false, externalFetches = 0, databaseQueries = 0;
let currentCase = "prepare owned disposable PostgreSQL schema";
const passed: string[] = [];
const cookies = new Map<string, string>();
const afterCallbacks: (() => Promise<void> | void)[] = [];
const origin = "https://carmelita.example.test";
let revoked = false, providerUnavailable = false;
const providerCalls: { key: string; payload: unknown }[] = [];
const acceptedNotices = new Map<string, unknown>();

// Isolate this child from application secrets and never load an application .env.
for (const key of Object.keys(process.env)) {
  if (/DATABASE|NEON|POSTGRES|PRIVY|STYTCH|VERCEL|ADMIN_|PROPOSAL_EMAIL|RESEND_API_KEY|CARMELITA_PUBLIC_ORIGIN/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  CARMELITA_ADMIN_EMAILS: "reviewer@example.test",
  CARMELITA_PROPOSAL_EMAIL_ENABLED: "true",
  RESEND_API_KEY: "synthetic-provider-key",
  CARMELITA_PROPOSAL_EMAIL_FROM: "notice@example.test",
  CARMELITA_PROPOSAL_EMAIL_TO: "reviewer@example.test",
  CARMELITA_PUBLIC_ORIGIN: origin,
  NODE_ENV: "test",
});
mock.method(globalThis, "fetch", async () => { externalFetches++; throw new Error("proposal_review_external_fetch_forbidden"); });

const query = async (text: string, params: unknown[] = []) => { databaseQueries++; return client.query(text, params); };
const dialect = new PgDialect();
// Production Drizzle builds both the insert and inbox select. Only transport is
// substituted for local pg; SQL is neither reconstructed nor emulated in memory.
const localDb = drizzle(async (text, params, method) => {
  databaseQueries++;
  return method === "all" ? client.query({ text, values: params, rowMode: "array" }) : client.query(text, params);
});
mock.module(new URL("../db/index.ts", import.meta.url).href, { namedExports: {
  hasDatabase: () => true,
  getDatabaseUrl: () => "postgresql://synthetic@127.0.0.1/carmelita_proposal_qa",
  getDb: () => ({
    select: localDb.select.bind(localDb), insert: localDb.insert.bind(localDb),
    execute: async (statement: SQL) => { const built = dialect.sqlToQuery(statement); return query(built.sql, built.params); },
  }),
} });
// Exercise the production base-schema statements without Neon or HTTP.
mock.module("@neondatabase/serverless", { namedExports: { neon: () => ({ query }) } });
mock.module("next/headers", { namedExports: { cookies: async () => ({ get: (name: string) => cookies.has(name) ? { value: cookies.get(name) } : undefined }) } });
mock.module("next/navigation", { namedExports: { redirect: (destination: string) => { throw new Error(`fixture_redirect:${destination}`); } } });
mock.module("next/server", { namedExports: { NextResponse, after: (callback: () => Promise<void> | void) => afterCallbacks.push(callback) } });
mock.module("next/link", { defaultExport: ({ children, ...props }: Record<string, unknown> & { children?: ReactNode }) => createElement("a", props, children) });
mock.module("next/image", { defaultExport: (props: Record<string, unknown>) => createElement("img", props) });
mock.module(new URL("../app/chatgpt-auth.ts", import.meta.url).href, { namedExports: { getChatGPTUser: async () => null } });
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, { namedExports: {
  verifyPrivyAccessToken: async (token: string) => {
    if (token === "synthetic-reviewer" && !revoked) return { user_id: "did:privy:reviewer" };
    if (token === "synthetic-ordinary") return { user_id: "did:privy:ordinary" };
    throw new Error("synthetic_identity_denied");
  },
  getPrivyUserIdentity: async (id: string) => ({ id, email: id === "did:privy:reviewer" ? "reviewer@example.test" : "ordinary@example.test" }),
} });
// Node lacks Next's CSS-module loader. Styling is outside this server acceptance.
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith("proposal-email.module.css")) return { format: "module", shortCircuit: true, source: "export default new Proxy({}, { get: (_, name) => String(name) })" };
  return nextLoad(url, context);
} });
const email = await import("../app/integrations/proposal-email");
const providerFetch: typeof fetch = async (url, init) => {
  assert.equal(String(url), "https://api.resend.com/emails");
  assert.equal(init?.method, "POST");
  const key = new Headers(init.headers).get("Idempotency-Key")!;
  const payload = JSON.parse(String(init.body));
  assert.equal(payload.from, "notice@example.test");
  assert.deepEqual(payload.to, ["reviewer@example.test"]);
  providerCalls.push({ key, payload });
  if (providerUnavailable) return new Response("{}", { status: 503 });
  if (acceptedNotices.has(key)) assert.deepEqual(payload, acceptedNotices.get(key));
  acceptedNotices.set(key, payload);
  return Response.json({ id: `synthetic-${key.split("/").at(-1)}` });
};
mock.module(new URL("../app/integrations/proposal-email.ts", import.meta.url).href, { namedExports: {
  ...email,
  sendProposalEmail: (message: Parameters<typeof email.sendProposalEmail>[0], apiKey: string, key: string) => email.sendProposalEmail(message, apiKey, key, { fetch: providerFetch }),
} });
const { POST: submit } = await import("../app/api/integration-recommendations/route");
const { default: review } = await import("../app/admin/integrations/page");
const { POST: login } = await import("../app/api/admin/privy-session/route");
const { GET: session, DELETE: logout } = await import("../app/api/admin/session/route");
const { POST: dispatch } = await import("../app/api/admin/integrations/notifications/route");

const proposal = {
  integrationName: "  Synthetic bookings  ", email: " DEVELOPER@Example.test ",
  useCase: "  Read my synthetic bookings from the connected account.  ",
  locale: "es", source: "developers", consent: true,
};
function request(path: string, body?: unknown, authorization?: string) {
  return new NextRequest(origin + path, { method: "POST", headers: {
    origin, "content-type": "application/json", ...(authorization ? { authorization: `Bearer ${authorization}` } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function expectResponse(response: Response, status: number, body: unknown) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), body);
}
async function drain() { while (afterCallbacks.length) await afterCallbacks.shift()!(); }
async function denied() {
  const before = databaseQueries;
  await assert.rejects(review(), /^Error: fixture_redirect:\/admin\/login\?returnTo=%2Fadmin%2Fintegrations$/);
  assert.equal(databaseQueries, before, "denied review must not read proposal or outbox tables");
  await expectResponse(await dispatch(request("/api/admin/integrations/notifications")), 401, { status: "unauthorized" });
  assert.equal(databaseQueries, before);
}
async function scenario(name: string, action: () => Promise<void>) { currentCase = name; await action(); passed.push(name); }

try {
  await client.connect(); connected = true;
  const backend = (await query("SELECT host(inet_server_addr()) AS host, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser")).rows[0];
  assert.ok(["127.0.0.1", "::1"].includes(String(backend.host)));
  assert.equal(backend.superuser, false);
  await query(`CREATE SCHEMA ${quotedSchema}`); owned = true;
  await query(`SET search_path TO ${quotedSchema}`);
  await query("SET statement_timeout = '5s'");
  await query("CREATE TABLE acceptance_owner (marker text PRIMARY KEY)");
  await query("INSERT INTO acceptance_owner(marker) VALUES ($1)", [marker]);

  await scenario("anonymous and ordinary identities cannot read the private inbox or dispatch", async () => {
    await denied();
    const ordinary = await login(request("/api/admin/privy-session", undefined, "synthetic-ordinary"));
    assert.equal(ordinary.status, 403); assert.equal(ordinary.headers.get("set-cookie"), null);
    cookies.set("aa_admin_privy", "synthetic-ordinary"); await denied(); cookies.clear();
  });
  await scenario("real proposal route commits normalized proposal and one outbox notice before acknowledgement", async () => {
    await expectResponse(await submit(request("/api/integration-recommendations", proposal)), 201, { status: "received" });
    const rows = (await query("SELECT integration_name, email, use_case, locale, source, status FROM integration_recommendations")).rows;
    assert.deepEqual(rows, [{ integration_name: "Synthetic bookings", email: "developer@example.test", use_case: proposal.useCase.trim(), locale: "es", source: "developers", status: "new" }]);
    assert.equal((await query("SELECT count(*)::int AS count FROM carmelita_proposal_email_jobs")).rows[0].count, 1);
    assert.equal(providerCalls.length, 0); await drain(); assert.equal(acceptedNotices.size, 1);
  });
  await scenario("allowlisted login opens the actual private review component with persisted details", async () => {
    const response = await login(request("/api/admin/privy-session", undefined, "synthetic-reviewer"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
    for (const cookie of response.cookies.getAll()) cookies.set(cookie.name, cookie.value);
    const html = renderToStaticMarkup(await review());
    assert.match(html, /Synthetic bookings/); assert.match(html, /developer@example\.test/);
    assert.ok(html.includes(proposal.useCase.trim())); assert.match(html, /Pending review/);
    const id = String((await query("SELECT id FROM integration_recommendations")).rows[0].id);
    assert.ok(html.includes(`id="proposal-${id}"`)); assert.ok(html.includes(`href="#proposal-${id}"`));
    const payload = JSON.stringify([...acceptedNotices.values()][0]);
    assert.ok(payload.includes(`${origin}/admin/integrations`));
    for (const privateValue of ["Synthetic bookings", "developer@example.test", proposal.useCase.trim()]) assert.ok(!payload.includes(privateValue));
  });
  await scenario("duplicate after accepted notice preserves content and sends no second notice", async () => {
    const before = providerCalls.length;
    await expectResponse(await submit(request("/api/integration-recommendations", { ...proposal, useCase: "Changed duplicate contents" })), 200, { status: "already_received" });
    await drain(); assert.equal(providerCalls.length, before); assert.equal(acceptedNotices.size, 1);
    assert.equal((await query("SELECT count(*)::int AS count FROM carmelita_proposal_email_jobs")).rows[0].count, 1);
    assert.equal((await query("SELECT use_case FROM integration_recommendations")).rows[0].use_case, proposal.useCase.trim());
  });
  await scenario("temporary provider failure keeps proposal reviewable and authorized retry uses frozen reference", async () => {
    providerUnavailable = true;
    await expectResponse(await submit(request("/api/integration-recommendations", { ...proposal, integrationName: "Retry synthetic service" })), 201, { status: "received" });
    await drain(); const failedAttempt = providerCalls.at(-1)!;
    assert.equal((await query("SELECT count(*)::int AS count FROM carmelita_proposal_email_jobs WHERE state = 'retry'")).rows[0].count, 1);
    const html = renderToStaticMarkup(await review()); assert.match(html, /Retry synthetic service/); assert.match(html, /Retry scheduled/);
    await query("UPDATE carmelita_proposal_email_jobs SET next_attempt_at = now() - interval '1 second' WHERE state = 'retry'");
    providerUnavailable = false;
    await expectResponse(await dispatch(request("/api/admin/integrations/notifications")), 200, { status: "processed", processed: 1, accepted: 1, retry: 0, needsReview: 0 });
    assert.deepEqual(providerCalls.at(-1), failedAttempt); assert.equal(acceptedNotices.size, 2);
    assert.equal((await query("SELECT count(*)::int AS count FROM integration_recommendations WHERE status = 'new'")).rows[0].count, 2);
  });
  await scenario("revocation and allowlist removal immediately deny a previously privileged session", async () => {
    revoked = true; await denied(); revoked = false;
    process.env.CARMELITA_ADMIN_EMAILS = "another-reviewer@example.test"; await denied();
    process.env.CARMELITA_ADMIN_EMAILS = "reviewer@example.test";
  });
  await scenario("real logout clears both administrative cookies and subsequent review is denied", async () => {
    const response = await logout(new NextRequest(origin + "/api/admin/session", { method: "DELETE", headers: { origin, host: new URL(origin).host } }));
    await expectResponse(response, 200, { status: "signed_out" });
    const cleared = response.cookies.getAll(); assert.deepEqual(cleared.map(cookie => cookie.name).sort(), ["aa_admin_privy", "aa_founder_session"]);
    for (const cookie of cleared) { assert.equal(cookie.maxAge, 0); cookies.delete(cookie.name); }
    const responseSession = await session(); assert.equal((await responseSession.json()).authenticated, false);
    await denied(); assert.equal(acceptedNotices.size, 2);
  });
  assert.equal(externalFetches, 0);
  console.log(JSON.stringify({ status: "passed", cases: passed, storage: "disposable loopback PostgreSQL", application: "real route, schema, Drizzle queries, private page, auth allowlist and logout", mocked: ["Privy verifier", "cookies request context", "Next after", "email transport"], realEmails: 0, externalFetches, hostedAcceptanceCertified: false }));
} catch {
  console.log(JSON.stringify({ status: "failed", code: "proposal_review_pg_acceptance_failed", failedCase: currentCase, completedCases: passed }));
  process.exitCode = 1;
} finally {
  if (owned) {
    try {
      assert.deepEqual((await query("SELECT marker FROM acceptance_owner")).rows, [{ marker }]);
      await query(`DROP SCHEMA ${quotedSchema} CASCADE`);
    } catch { process.exitCode = 1; console.log("proposal_review_pg_owned_schema_cleanup_failed"); }
  }
  if (connected) await client.end();
  assert.equal(externalFetches, 0);
}
