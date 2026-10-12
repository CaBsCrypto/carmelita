import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

registerHooks({ load(url, context, next) { return url.endsWith(".module.css") ? { format: "module", source: "export default {details: 'review-details'};", shortCircuit: true } : next(url, context); } });
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
mock.module(new URL("../app/integrations/review.ts", import.meta.url).href, { namedExports: { proposalStatusLabel: (status: string) => status === "new" ? "Pending review" : status === "accepted_for_pilot" ? "Accepted for pilot" : status } });
mock.module(new URL("../app/admin/integrations/review-controls.tsx", import.meta.url).href, { defaultExport: () => createElement("button", null, "Save review") });

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
  assert.deepEqual(operations, ["auth", "available", "db", "select", "from", "query"]);
  assert.ok(!operations.includes("schema"), "GET cannot initialize or migrate storage");
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

test("accepted proposals display only private review evidence and never an activation or install control", async () => {
  rows = [{ id: "synthetic-reviewed-id", integrationName: "Synthetic pilot", email: "pilot@example.test", useCase: "Private read-only pilot", locale: "en", source: "developers", status: "accepted_for_pilot", reviewVersion: 1, reviewReason: "Check adapter <script>untrusted()</script>", reviewActor: "password:synthetic-reviewer", reviewedAt: new Date("2026-10-18T14:30:00Z"), createdAt: new Date("2026-10-18T12:00:00Z") }];
  const html = await renderPage();
  assert.match(html, /Accepted for pilot/);
  assert.match(html, /password:synthetic-reviewer/);
  assert.match(html, /2026-10-18T14:30:00\.000Z/);
  assert.match(html, /Check adapter &lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b|Install app|Activate integration|Publish service/);
  assert.ok(!operations.includes("schema"));
});
test("an empty loaded queue is represented only after a successful storage read", async () => {
  rows = [];
  const html = await renderPage();
  assert.deepEqual(operations, ["auth", "available", "db", "select", "from", "query"]);
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

test("query failures render a private unavailable message without exposing contacts or transport details", async () => {
  for (const stage of ["query"] as const) {
    failure = stage;
    try {
      const html = await renderPage();
      assert.equal(operations[0], "auth");
      assert.ok(!operations.includes("schema"), "GET cannot initialize or migrate storage");
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
