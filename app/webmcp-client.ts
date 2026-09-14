"use client";

export type WebMcpToolResponse = { content: { type: "text"; text: string }[]; isError?: boolean };
export type WebMcpToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (args: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<WebMcpToolResponse>;
};
export type WebMcpModelContext = {
  registerTool?: (tool: WebMcpToolDefinition, options?: { signal?: AbortSignal }) => void | Promise<void>;
  unregisterTool?: (name: string) => void | Promise<void>;
};
declare global {
  interface Document { modelContext?: WebMcpModelContext }
  interface Navigator { modelContext?: WebMcpModelContext }
}
export type WebMcpStatus = {
  supported: boolean;
  source: "document.modelContext" | "navigator.modelContext" | "none";
  toolsRegistered: string[];
  flagInstructionsNeeded: boolean;
};
export function getBrowserModelContext(): WebMcpModelContext | null {
  if (typeof document !== "undefined" && document.modelContext?.registerTool) return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext?.registerTool) return navigator.modelContext;
  return null;
}
export function detectWebMcpStatus(): WebMcpStatus {
  const context = getBrowserModelContext();
  return {
    supported: Boolean(context),
    source: !context ? "none" : typeof navigator !== "undefined" && navigator.modelContext === context ? "navigator.modelContext" : "document.modelContext",
    toolsRegistered: [], flagInstructionsNeeded: !context,
  };
}
export function toolError(message: string): WebMcpToolResponse {
  return { content: [{ type: "text", text: message }], isError: true };
}
export async function webMcpRequest(url: string, init?: RequestInit): Promise<WebMcpToolResponse> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) return toolError(`request_failed_${response.status}`);
    const body: unknown = await response.json();
    return { content: [{ type: "text", text: JSON.stringify(body) }] };
  } catch { return toolError("request_unavailable"); }
}

type Registration = { controller: AbortController; owner?: AbortSignal };
const registrations = new WeakMap<WebMcpModelContext, Map<string, Registration>>();
const queues = new WeakMap<WebMcpModelContext, Promise<unknown>>();
function serialize<T>(context: WebMcpModelContext, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(context) ?? Promise.resolve()).catch(() => undefined).then(task);
  queues.set(context, next.catch(() => undefined));
  return next;
}
export async function registerWebMcpTools(tools: WebMcpToolDefinition[], signal?: AbortSignal): Promise<WebMcpStatus> {
  const status = detectWebMcpStatus();
  const context = getBrowserModelContext();
  if (!context?.registerTool || signal?.aborted) return status;
  const owned = registrations.get(context) ?? new Map<string, Registration>();
  registrations.set(context, owned);
  async function remove(name: string, registration: Registration) {
    registration.controller.abort();
    if (owned.get(name) !== registration) return;
    await context?.unregisterTool?.(name);
    owned.delete(name);
  }
  const cleanup = () => { void serialize(context, async () => {
    for (const [name, registration] of owned) if (registration.owner === signal) await remove(name, registration);
  }).catch(() => undefined); };
  signal?.addEventListener("abort", cleanup, { once: true });
  return serialize(context, async () => {
    for (const tool of tools) {
      if (signal?.aborted) break;
      const prior = owned.get(tool.name);
      if (prior) await remove(tool.name, prior);
      const registration: Registration = { controller: new AbortController(), owner: signal };
      try {
        await context.registerTool?.({ ...tool, execute: async (args, options) => {
          if (signal?.aborted || registration.controller.signal.aborted || options?.signal?.aborted) return toolError("tool_inactive");
          try { return await tool.execute(args, { signal: AbortSignal.any([registration.controller.signal, ...(signal ? [signal] : []), ...(options?.signal ? [options.signal] : [])]) }); } catch { return toolError("tool_failed"); }
        } }, { signal: registration.controller.signal });
        owned.set(tool.name, registration);
        if (signal?.aborted) await remove(tool.name, registration);
        else status.toolsRegistered.push(tool.name);
      } catch {
        registration.controller.abort();
        // The inspector reports only registrations that actually succeeded.
      }
    }
    return status;
  });
}
export function registerCarmelitaWebMcpTools(getAccessToken: () => Promise<string | null>, signal?: AbortSignal) {
  const read = (name: string, description: string, url: string): WebMcpToolDefinition => ({
    name, description, inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false },
    execute: async (_args, options) => {
      const token = await getAccessToken();
      if (signal?.aborted || options?.signal?.aborted) return toolError("tool_inactive");
      if (!token) return toolError("authentication_required");
      return webMcpRequest(url, { headers: { Authorization: `Bearer ${token}` }, signal: options?.signal ?? signal });
    },
  });
  return registerWebMcpTools([
    read("carmelita_get_multichain_wallets", "Return the user's registered wallets", "/api/agent/wallets"),
    read("carmelita_get_solana_status", "Return Solana Devnet wallet status", "/api/agent/wallets/solana"),
  ], signal);
}
