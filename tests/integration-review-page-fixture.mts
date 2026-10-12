import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const table = { createdAt: "created_at" };
const operations: string[] = [];
let accessDenied = false;
let databaseAvailable = true;
let failure: "schema" | "query" | null = null;
let fetches = 0;
let rows: Record<string, unknown>[] = [];
const errorLogs: unknown[][] = [];
mock.method(console, "error", (...args: unknown[]) => errorLogs.push(args));
mock.method(globalThis, "fetch", async () => {
  fetches++;
  throw new Error("Unexpected network access in private inbox fixture");
});
mock.module(new URL("../app/admin/auth.ts", import.meta.url).href, {
  namedExports: {
    requireAdminPage: async (returnTo: string) => {
      operations.push("auth");
      assert.equal(returnTo, "/admin/integrations");
      if (accessDenied) throw new Error("admin_redirect_required");
      return { username: "synthetic-reviewer", displayName: "Fixture", method: "password" };
    },
  },
});
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
