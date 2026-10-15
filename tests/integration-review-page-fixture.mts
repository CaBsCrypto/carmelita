import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { registerHooks } from "node:module";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The fixture renders actual components; Node does not implement Next's CSS loader.
registerHooks({ load(url, context, nextLoad) {
  if (url.endsWith(".module.css")) return { format: "module", shortCircuit: true,
    source: "export default {panel:'panel',heading:'heading',actions:'actions',jobs:'jobs'}" };
  return nextLoad(url, context);
} });
// Discard inherited configuration; only fictional identities enter this fixture.
for (const key of Object.keys(process.env)) {
  if (/^(?:ADMIN_|CARMELITA_ADMIN|CARMELITA_PROPOSAL_EMAIL_|DATABASE|NEON|PRIVY|STYTCH|RESEND|VERCEL)/.test(key)) delete process.env[key];
}
process.env.CARMELITA_PROPOSAL_EMAIL_ENABLED = "false";
process.env.CARMELITA_ADMIN_EMAILS = "reviewer@example.test";
process.env.ADMIN_EMAILS = "reviewer@example.test";

const table = { createdAt: "created_at" };
const operations: string[] = [];
let accessDenied = false;
let databaseAvailable = true;
let failure: "schema" | "query" | null = null;
let fetches = 0;
let rows: Record<string, unknown>[] = [];
const sessionCookies = new Map<string, string>([["aa_admin_privy", "synthetic-reviewer-session"]]);
let chatUser: { email: string; displayName: string } | null = null;
const errorLogs: unknown[][] = [];
mock.method(console, "error", (...args: unknown[]) => errorLogs.push(args));
mock.method(globalThis, "fetch", async () => {
  fetches++;
  throw new Error("Unexpected network access in private inbox fixture");
});
mock.module("next/headers", { namedExports: { cookies: async () => ({ get: (name: string) => accessDenied || !sessionCookies.has(name) ? undefined : { value: sessionCookies.get(name) } }) } });
mock.module("next/navigation", { namedExports: { redirect: (url: string) => { throw new Error(`admin_redirect_required:${url}`); } } });
mock.module(new URL("../app/chatgpt-auth.ts", import.meta.url).href, { namedExports: { getChatGPTUser: async () => chatUser } });
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, { namedExports: {
  verifyPrivyAccessToken: async (token: string) => {
    if (token === "synthetic-reviewer-session") return { user_id: "did:privy:synthetic-reviewer" };
    if (token === "synthetic-normal-session") return { user_id: "did:privy:synthetic-normal" };
    throw new Error("Synthetic session not authorized");
  },
  getPrivyUserIdentity: async (id: string) => ({ id, email: id === "did:privy:synthetic-reviewer" ? "reviewer@example.test" : "normal@example.test" }),
} });
const actualAuth = await import("../app/admin/auth");
mock.module(new URL("../app/admin/auth.ts", import.meta.url).href, { namedExports: {
  requireAdminPage: async (returnTo: string) => {
    operations.push("auth"); assert.equal(returnTo, "/admin/integrations"); return actualAuth.requireAdminPage(returnTo);
  },
} });
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: {
    hasDatabase: () => {
      operations.push("available");
      return databaseAvailable;
    },
    getDb: () => {
      operations.push("db");
      return {
        select: () => {
          operations.push("select");
          return {
            from: (selected: unknown) => {
              operations.push("from");
              assert.equal(selected, table);
              return {
                orderBy: async () => {
                  operations.push("query");
                  if (failure === "query") throw new Error("private database host and reviewer@example.test");
                  return rows;
                },
              };
            },
          };
        },
      };
    },
  },
});
mock.module(new URL("../db/schema.ts", import.meta.url).href, {
  namedExports: { integrationRecommendations: table },
});
mock.module(new URL("../app/integrations/storage.ts", import.meta.url).href, {
  namedExports: {
    ensureIntegrationRecommendationSchema: async () => {
      operations.push("schema");
      if (failure === "schema") throw new Error("private schema details and reviewer@example.test");
    },
  },
});
mock.module("next/link", {
  defaultExport: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
});
mock.module(new URL("../app/brand-lockup.tsx", import.meta.url).href, {
  defaultExport: () => createElement("span", null, "Carmelita"),
});

const { default: ReviewPage, metadata, dynamic } = await import("../app/admin/integrations/page");
async function renderPage() {
  operations.length = 0;
  return renderToStaticMarkup(await ReviewPage());
}
function assertUnavailable(html: string) {
  assert.match(html, /Proposal storage is unavailable in this environment/);
  assert.match(html, /The review queue could not be loaded/);
  assert.doesNotMatch(html, /No proposals or integration recommendations yet/);
  assert.doesNotMatch(html, /\d+ proposals and recommendations saved/);
  assert.doesNotMatch(html, /<article\b|reviewer@example\.test|private database|private schema/);
}

test("admin denial exits before checking, initializing or querying proposal storage", async () => {
  accessDenied = true;
  try {
    await assert.rejects(renderPage(), /admin_redirect_required/);
    assert.deepEqual(operations, ["auth"]);
  } finally {
    accessDenied = false;
  }
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.equal(dynamic, "force-dynamic");
});

test("a normal authenticated Privy or ChatGPT user cannot read the private proposal inbox", async () => {
  sessionCookies.set("aa_admin_privy", "synthetic-normal-session");
  try {
    await assert.rejects(renderPage(), /admin_redirect_required:\/admin\/login\?returnTo=%2Fadmin%2Fintegrations/);
    assert.deepEqual(operations, ["auth"]);
    delete process.env.CARMELITA_ADMIN_EMAILS;
    chatUser = { email: "normal@example.test", displayName: "Normal user" };
    await assert.rejects(renderPage(), /admin_redirect_required/); assert.deepEqual(operations, ["auth"]);
  } finally {
    chatUser = null; process.env.CARMELITA_ADMIN_EMAILS = "reviewer@example.test"; sessionCookies.set("aa_admin_privy", "synthetic-reviewer-session");
  }
});

test("cancelled access and the worker capability never become an administrative inbox session", async () => {
  const worker = "synthetic-scheduler-capability-1234567890";
  process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN = worker;
  try {
    sessionCookies.delete("aa_admin_privy"); // Cancelling the local authorization leaves no administrative session.
    await assert.rejects(renderPage(), /admin_redirect_required/); assert.deepEqual(operations, ["auth"]);
    sessionCookies.set("aa_admin_privy", worker); sessionCookies.set("aa_founder_session", worker);
    await assert.rejects(renderPage(), /admin_redirect_required/); assert.deepEqual(operations, ["auth"]);
    assert.equal(await actualAuth.getAdminIdentity(), null);
  } finally {
    delete process.env.CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN; sessionCookies.delete("aa_founder_session"); sessionCookies.set("aa_admin_privy", "synthetic-reviewer-session");
  }
});

test("authenticated inbox renders proposed service details and safe pending-review labels", async () => {
  rows = [{
    id: "synthetic-proposal-id",
    integrationName: "Synthetic booking service",
    email: "reviewer@example.test",
    useCase: "Query my bookings. <script>untrusted()</script>",
    locale: "es",
    source: "developers",
    status: "new",
    createdAt: new Date("2026-10-12T12:00:00.000Z"),
  }];
  const html = await renderPage();
  assert.deepEqual(operations, ["auth", "available", "schema", "db", "select", "from", "query"]);
  assert.match(html, /Synthetic booking service/);
  assert.match(html, /Service proposal · ES · Pending review/);
  assert.match(html, /Query my bookings\. &lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
  assert.match(html, /href="mailto:reviewer@example\.test"/);
  assert.match(html, /datetime="2026-10-12T12:00:00\.000Z"/i);
  assert.match(html, /1 proposals and recommendations saved/);
  assert.match(html, /href="\/developers#proposal"/);
  assert.match(html, /does not publish or activate an integration/);
  assert.doesNotMatch(html, /storage is unavailable|No proposals or integration recommendations yet/);
});

test("legacy recommendation retains its classification and missing-use-case fallback", async () => {
  rows = [{
    id: "synthetic-legacy-id",
    integrationName: "Synthetic calendar",
    email: "calendar@example.test",
    useCase: null,
    locale: "en",
    source: "landing",
    status: "reviewing",
    createdAt: new Date("2026-10-11T12:00:00.000Z"),
  }];
  const html = await renderPage();
  assert.match(html, /Integration recommendation · EN · reviewing/);
  assert.match(html, /No use case provided/);
});

test("an empty loaded queue is represented only after a successful storage read", async () => {
  rows = [];
  const html = await renderPage();
  assert.deepEqual(operations, ["auth", "available", "schema", "db", "select", "from", "query"]);
  assert.match(html, /No proposals or integration recommendations yet/);
  assert.match(html, /0 proposals and recommendations saved/);
  assert.doesNotMatch(html, /storage is unavailable|<article\b/);
});

test("unconfigured storage cannot masquerade as an empty inbox", async () => {
  databaseAvailable = false;
  try {
    const html = await renderPage();
    assert.deepEqual(operations, ["auth", "available"]);
    assertUnavailable(html);
  } finally {
    databaseAvailable = true;
  }
});

test("schema and query failures render a private unavailable message without exposing contacts or transport details", async () => {
  for (const stage of ["schema", "query"] as const) {
    failure = stage;
    try {
      const html = await renderPage();
      assert.equal(operations[0], "auth");
      if (stage === "schema") assert.deepEqual(operations, ["auth", "available", "schema"]);
      assertUnavailable(html);
    } finally {
      failure = null;
    }
  }
  assert.deepEqual(errorLogs, []);
});

test("private review fixture never contacted a database or external service", () => {
  assert.equal(fetches, 0);
  assert.deepEqual(errorLogs, []);
});
