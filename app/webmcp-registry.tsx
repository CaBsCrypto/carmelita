"use client";
import { useEffect } from "react";
import { registerWebMcpTools, webMcpRequest } from "./webmcp-client";

export default function WebMcpRegistry() {
  useEffect(() => {
    const controller = new AbortController();
    void registerWebMcpTools([
      {
        name: "search_agent_offers", description: "Search available demo offers. Read-only.",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
        annotations: { readOnlyHint: true, destructiveHint: false },
        execute: async (input, options) => webMcpRequest(`/api/commerce?query=${encodeURIComponent(String(input.query ?? ""))}`, { signal: options?.signal ?? controller.signal }),
      },
      {
        name: "prepare_commerce_intent", description: "Prepare a demo intent. No funds move; approval is separate.",
        inputSchema: { type: "object", properties: { offerId: { type: "string" }, actorId: { type: "string" } }, required: ["offerId", "actorId"] },
        annotations: { readOnlyHint: false, destructiveHint: false },
        execute: async (input, options) => webMcpRequest("/api/commerce", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: options?.signal ?? controller.signal,
          body: JSON.stringify({ action: "create_intent", offerId: input.offerId, actorId: input.actorId, idempotencyKey: crypto.randomUUID() }),
        }),
      },
    ], controller.signal);
    return () => controller.abort();
  }, []);
  return null;
}
