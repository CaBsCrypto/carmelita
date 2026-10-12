import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

const endpoint = "https://preview.example.test/api/integration-recommendations";
const columns = { id: "id", email: "email", integrationName: "integrationName" };
const rows = new Map<string, Record<string, unknown>>();
let databaseAvailable = true;
let schemaFailure = false;
let writeFailure = false;
let ensures = 0;
let inserts = 0;
let fetches = 0;
const errorLogs: unknown[][] = [];
mock.method(console, "error", (...args: unknown[]) => errorLogs.push(args));
mock.method(globalThis, "fetch", async () => {
  fetches++;
  throw new Error("Unexpected external request");
});
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: {
    hasDatabase: () => databaseAvailable,
    getDb: () => ({
      insert: (table: unknown) => {
        assert.equal(table, columns);
        inserts++;
        return {
          values: (values: Record<string, unknown>) => ({
            onConflictDoNothing: ({ target }: { target: unknown[] }) => {
              assert.deepEqual(target, [columns.email, columns.integrationName]);
              return {
                returning: async (selection: unknown) => {
                  assert.deepEqual(selection, { id: columns.id });
                  if (writeFailure) throw new Error("private transport details owner@example.test");
                  const key = values.email + "\0" + values.integrationName;
                  if (rows.has(key)) return [];
                  rows.set(key, values);
                  return [{ id: values.id }];
                },
              };
            },
          }),
        };
      },
    }),
  },
});
mock.module(new URL("../db/schema.ts", import.meta.url).href, {
  namedExports: { integrationRecommendations: columns },
});
mock.module(new URL("../app/integrations/storage.ts", import.meta.url).href, {
  namedExports: {
    ensureIntegrationRecommendationSchema: async () => {
      ensures++;
      if (schemaFailure) throw new Error("private schema details owner@example.test");
    },
  },
});

const { POST } = await import("../app/api/integration-recommendations/route");
const submission = {
  integrationName: "  Booking service  ",
  email: " OWNER@Example.test ",
  useCase: "  Consult my bookings. Docs: https://service.example.test/docs  ",
  locale: "es",
  source: "developers",
  consent: true,
  website: "",
};
function request(body: unknown = submission, extraHeaders: Record<string, string> = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: { origin: new URL(endpoint).origin, "content-type": "application/json", ...extraHeaders },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
async function expectResponse(response: Response, status: number, result: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { status: result });
}

test("proposal is normalized, persisted and only then acknowledged without echoing contact data", async () => {
  await expectResponse(await POST(request()), 201, "received");
  assert.equal(rows.size, 1);
  const stored = [...rows.values()][0];
  assert.match(String(stored.id), /^[a-f0-9-]{36}$/);
  assert.deepEqual({ ...stored, id: "generated" }, {
    id: "generated",
    integrationName: "Booking service",
    email: "owner@example.test",
    useCase: "Consult my bookings. Docs: https://service.example.test/docs",
    locale: "es",
    source: "developers",
  });
  assert.equal(ensures, 1);
  assert.equal(inserts, 1);
});

test("duplicate uses the same email/name conflict key and preserves the original proposal", async () => {
  await expectResponse(await POST(request({ ...submission, useCase: "A changed proposal" })), 200, "already_received");
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].useCase, "Consult my bookings. Docs: https://service.example.test/docs");
});

test("missing storage returns unavailable and does not acknowledge or write", async () => {
  databaseAvailable = false;
  const before = { ensures, inserts };
  try {
    await expectResponse(await POST(request()), 503, "storage_unavailable");
    assert.deepEqual({ ensures, inserts }, before);
  } finally {
    databaseAvailable = true;
  }
});

test("schema or insert failure returns a safe error without logging private contact details", async () => {
  const before = inserts;
  schemaFailure = true;
  try {
    await expectResponse(await POST(request()), 500, "storage_error");
    assert.equal(inserts, before);
  } finally {
    schemaFailure = false;
  }
  writeFailure = true;
  try {
    await expectResponse(await POST(request()), 500, "storage_error");
  } finally {
    writeFailure = false;
  }
  assert.equal(rows.size, 1);
  assert.deepEqual(errorLogs, []);
});

test("honeypot is ignored, never saved and never receives a genuine saved status", async () => {
  const before = { ensures, inserts };
  await expectResponse(await POST(request({ ...submission, website: "https://spam.example.test" })), 200, "ignored");
  assert.deepEqual({ ensures, inserts }, before);
});

test("malformed, missing, schema-invalid or unconsented bodies cannot reach storage", async () => {
  const before = { ensures, inserts };
  for (const body of ["{", "null", { ...submission, email: "invalid" }, { ...submission, useCase: "  " }, { ...submission, useCase: "  brief  " }, { ...submission, consent: false }]) {
    await expectResponse(await POST(request(body)), 400, "invalid_request");
  }
  await expectResponse(await POST(new Request(endpoint, { method: "POST", headers: { origin: new URL(endpoint).origin } })), 400, "invalid_request");
  assert.deepEqual({ ensures, inserts }, before);
});

test("untrusted or missing origins are rejected even without a Host header or with a spoofed Host", async () => {
  const before = { ensures, inserts };
  const invalidOrigins: Record<string, string>[] = [
    { origin: "https://outside.example.test" },
    { origin: "http://preview.example.test" },
    { origin: "null" },
    { origin: "not a URL" },
    { origin: "https://outside.example.test", host: "outside.example.test" },
  ];
  for (const headers of invalidOrigins) {
    await expectResponse(await POST(request(submission, headers)), 403, "invalid_origin");
  }
  await expectResponse(await POST(new Request(endpoint, { method: "POST", body: JSON.stringify(submission) })), 403, "invalid_origin");
  assert.deepEqual({ ensures, inserts }, before);
});

test("same-origin fallback and legacy minimal submissions remain accepted", async () => {
  await expectResponse(await POST(request({ integrationName: "Calendar service", email: "calendar@example.test", consent: true })), 201, "received");
  assert.equal(rows.size, 2);
});

test("real NextRequest loopback normalization preserves a valid browser Origin and Host", async () => {
  const before = { ensures, inserts };
  databaseAvailable = false;
  try {
    for (const host of ["127.0.0.1:8143", "[::1]:8143", "localhost:8143"]) {
      const origin = "http://" + host;
      const normalized = new NextRequest(origin + "/api/integration-recommendations", {
        method: "POST",
        headers: { origin, host, "content-type": "application/json" },
        body: JSON.stringify(submission),
      });
      assert.equal(new URL(normalized.url).origin, "http://localhost:8143");
      await expectResponse(await POST(normalized), 503, "storage_unavailable");
    }
    assert.deepEqual({ ensures, inserts }, before);
  } finally {
    databaseAvailable = true;
  }
});

test("loopback exception cannot authorize a foreign Host, alternate port, downgrade or forwarded-header override", async () => {
  const before = { ensures, inserts };
  const headers: Record<string, string>[] = [
    { origin: "https://127.0.0.1:8143", host: "127.0.0.1:8143" },
    { origin: "http://127.0.0.1:8144", host: "127.0.0.1:8144" },
    { origin: "http://outside.example.test:8143", host: "outside.example.test:8143" },
    { origin: "http://localhost:8143", host: "127.0.0.1:8143" },
    { origin: "http://outside.example.test:8143", host: "127.0.0.1:8143", "x-forwarded-host": "outside.example.test:8143" },
    { origin: "https://127.0.0.1:8143", host: "127.0.0.1:8143", "x-forwarded-proto": "https" },
    { origin: "http://127.0.0.1:8143", host: "127.0.0.1:8143@outside.example.test" },
  ];
  for (const requestHeaders of headers) {
    await expectResponse(await POST(new Request("http://localhost:8143/api/integration-recommendations", {
      method: "POST", headers: requestHeaders, body: JSON.stringify(submission),
    })), 403, "invalid_origin");
  }
  await expectResponse(await POST(new Request("https://preview.example.test/api/integration-recommendations", {
    method: "POST", headers: { origin: "http://preview.example.test", host: "preview.example.test" }, body: JSON.stringify(submission),
  })), 403, "invalid_origin");
  await expectResponse(await POST(request(submission, { host: "outside.example.test" })), 403, "invalid_origin");
  assert.deepEqual({ ensures, inserts }, before);
});

test("oversized real bytes are rejected without trusting absent, small or invalid Content-Length", async () => {
  const before = { ensures, inserts };
  const oversized = { ...submission, padding: "x".repeat(8_001) };
  const declaredLengths: Record<string, string>[] = [{}, { "content-length": "1" }, { "content-length": "invalid" }, { "content-length": "-1" }];
  for (const headers of declaredLengths) {
    await expectResponse(await POST(request(oversized, headers)), 413, "invalid_request");
  }
  await expectResponse(await POST(request(submission, { "content-length": "8001" })), 413, "invalid_request");
  assert.deepEqual({ ensures, inserts }, before);
});

test("streaming and UTF-8 byte bounds stop oversized uploads before parsing or persistence", async () => {
  const before = { ensures, inserts };
  let cancellations = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('{"padding":"'));
      controller.enqueue(encoder.encode("ñ".repeat(4_001)));
    },
    cancel() { cancellations++; },
  });
  const streamedRequest = new Request(endpoint, {
    method: "POST",
    headers: { origin: new URL(endpoint).origin },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await expectResponse(await POST(streamedRequest), 413, "invalid_request");
  assert.equal(cancellations, 1);
  assert.deepEqual({ ensures, inserts }, before);
});

test("a valid proposal split across UTF-8 byte boundaries is persisted", async () => {
  const body = new TextEncoder().encode(JSON.stringify({
    ...submission,
    integrationName: "Conversación service",
    useCase: "Consultar mi información pública.",
  }));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let index = 0; index < body.byteLength; index += 3) {
        controller.enqueue(body.slice(index, index + 3));
      }
      controller.close();
    },
  });
  await expectResponse(await POST(new Request(endpoint, {
    method: "POST",
    headers: { origin: new URL(endpoint).origin },
    body: stream,
    duplex: "half",
  } as RequestInit)), 201, "received");
  assert.equal(rows.get("owner@example.test\0Conversación service")?.useCase, "Consultar mi información pública.");
});

test("a failed body stream returns a safe error before touching storage", async () => {
  const before = { ensures, inserts };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("private upload details owner@example.test"));
    },
  });
  await expectResponse(await POST(new Request(endpoint, {
    method: "POST",
    headers: { origin: new URL(endpoint).origin },
    body: stream,
    duplex: "half",
  } as RequestInit)), 400, "invalid_request");
  assert.deepEqual({ ensures, inserts }, before);
});

test("fixture performed no network requests or contact logging", () => {
  assert.equal(fetches, 0);
  assert.deepEqual(errorLogs, []);
});
