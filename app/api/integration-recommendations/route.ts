import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/db";
import { integrationRecommendations } from "@/db/schema";
import { integrationRecommendationSchema } from "@/app/integrations/schema";
import { ensureIntegrationRecommendationSchema } from "@/app/integrations/storage";

const MAX_BODY_BYTES = 8_000;

const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function hasSameProposalOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const suppliedOrigin = new URL(origin);
    const requestUrl = new URL(request.url);
    if (!["http:", "https:"].includes(requestUrl.protocol)) return false;

    const host = request.headers.get("host");
    if (!host) return suppliedOrigin.origin === requestUrl.origin;
    if (/[\\/?#@\s,]/.test(host)) return false;
    const externalUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (externalUrl.host !== requestUrl.host) {
      // NextRequest canonicalizes these loopback hosts to localhost. Keep the
      // actual Host authority, scheme and port; do not trust forwarded headers.
      const normalizedLoopback = requestUrl.hostname === "localhost"
        && ["127.0.0.1", "[::1]"].includes(externalUrl.hostname)
        && requestUrl.port === externalUrl.port;
      if (!normalizedLoopback) return false;
    }
    return suppliedOrigin.origin === externalUrl.origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("request_body_missing");

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) {
        // Do not await cancellation: an untrusted stream may never settle it.
        void reader.cancel().catch(() => undefined);
        return { tooLarge: true } as const;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    tooLarge: false,
    value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown,
  } as const;
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return json({ status: "invalid_request" }, 413);

  if (!hasSameProposalOrigin(request)) {
    return json({ status: "invalid_origin" }, 403);
  }

  let body: unknown;
  try {
    const result = await readBoundedJson(request);
    if (result.tooLarge) return json({ status: "invalid_request" }, 413);
    body = result.value;
  } catch {
    return json({ status: "invalid_request" }, 400);
  }

  const parsed = integrationRecommendationSchema.safeParse(body);
  if (!parsed.success) {
    return json({ status: "invalid_request" }, 400);
  }

  if (parsed.data.website) {
    return json({ status: "ignored" }, 200);
  }

  if (!hasDatabase()) {
    return json({ status: "storage_unavailable" }, 503);
  }

  try {
    await ensureIntegrationRecommendationSchema();

    const [created] = await getDb()
      .insert(integrationRecommendations)
      .values({
        id: randomUUID(),
        integrationName: parsed.data.integrationName,
        email: parsed.data.email,
        useCase: parsed.data.useCase,
        locale: parsed.data.locale,
        source: parsed.data.source,
      })
      .onConflictDoNothing({
        target: [
          integrationRecommendations.email,
          integrationRecommendations.integrationName,
        ],
      })
      .returning({ id: integrationRecommendations.id });

    return json(
      { status: created ? "received" : "already_received" },
      created ? 201 : 200,
    );
  } catch {
    return json({ status: "storage_error" }, 500);
  }
}
