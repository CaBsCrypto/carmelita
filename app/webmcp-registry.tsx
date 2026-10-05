"use client";
import { useEffect } from "react";
import { registerWebMcpTools, webMcpRequest } from "./webmcp-client";

export default function WebMcpRegistry() {
  useEffect(() => {
    const controller = new AbortController();
    void registerWebMcpTools([
      {
        name: "search_agent_offers", description: "Search public catalog offers. Read-only; listing does not establish execution availability.",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
        annotations: { readOnlyHint: true, destructiveHint: false },
        execute: async (input, options) => webMcpRequest(`/api/commerce?query=${encodeURIComponent(String(input.query ?? ""))}`, { signal: options?.signal ?? controller.signal }),
      },
    ], controller.signal);
    return () => controller.abort();
  }, []);
  return null;
}
