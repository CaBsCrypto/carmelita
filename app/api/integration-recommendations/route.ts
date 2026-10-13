import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, hasDatabase } from "@/db";
import { integrationRecommendations } from "@/db/schema";
import { integrationRecommendationSchema } from "@/app/integrations/schema";
import { ensureIntegrationRecommendationSchema } from "@/app/integrations/storage";
import { hasSameProposalOrigin } from "@/app/integrations/request-origin";
import { isProposalEmailEnabled } from "@/app/integrations/proposal-email";
import { createProposalWithEmailJob } from "@/app/integrations/proposal-email-store";
import { scheduleProposalEmailNotification } from "@/app/integrations/proposal-email-worker";

const MAX_BODY_BYTES = 8_000;

const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

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

    if (parsed.data.source === "developers" && isProposalEmailEnabled()) {
      const created = await createProposalWithEmailJob({ id: randomUUID(), ...parsed.data });
      // A duplicate can also wake due pending jobs. The durable queue owns retries.
      scheduleProposalEmailNotification();
      return json({ status: created ? "received" : "already_received" }, created ? 201 : 200);
    }

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
