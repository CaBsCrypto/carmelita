import { connectionConfiguration } from "../connect-chatgpt/connection-config";

export type ProposalEmailMessage = { from: string; to: string[]; subject: string; text: string };

type SendResult =
  | { status: "accepted"; providerId: string }
  | { status: "retry"; code: string; retryAfterMs?: number }
  | { status: "rejected"; code: string };

const SUBJECT = "New Carmelita service proposal";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RESPONSE_BYTES = 16_384;
const MAX_TIMEOUT_MS = 10_000;

function bareEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2 || parts[0].length > 64 || !parts[0].length) return false;
  if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(parts[0])) return false;
  const labels = parts[1].split(".");
  return labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

function headerToken(value: unknown, maxLength = 1_024): value is string {
  return typeof value === "string" && value.length <= maxLength && /^[\x21-\x7e]+$/.test(value);
}

function publicOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_048 || /\s/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    return url.origin;
  } catch { return undefined; }
}

function privateReviewUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_048 || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/admin/integrations" && !url.search && !url.hash;
  } catch { return false; }
}

export function isProposalEmailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CARMELITA_PROPOSAL_EMAIL_ENABLED === "true";
}

/** Configuration is server-owned. A ready configuration does not verify the sender domain or delivery. */
export function readProposalEmailConfig(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean; ready: boolean; apiKey?: string; from?: string; to?: string; reviewUrl?: string; missing: string[];
} {
  const missing: string[] = [];
  const apiKey = headerToken(env.RESEND_API_KEY) ? env.RESEND_API_KEY : undefined;
  const from = bareEmail(env.CARMELITA_PROPOSAL_EMAIL_FROM) ? env.CARMELITA_PROPOSAL_EMAIL_FROM : undefined;
  const to = bareEmail(env.CARMELITA_PROPOSAL_EMAIL_TO) ? env.CARMELITA_PROPOSAL_EMAIL_TO : undefined;
  const configuredOrigin = publicOrigin(env.CARMELITA_PUBLIC_ORIGIN);
  const connection = configuredOrigin ? connectionConfiguration({ ...env, CARMELITA_PUBLIC_ORIGIN: configuredOrigin }) : { mcpUrl: null };
  const reviewUrl = connection.mcpUrl ? new URL("/admin/integrations", connection.mcpUrl).href : undefined;
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("CARMELITA_PROPOSAL_EMAIL_FROM");
  if (!to) missing.push("CARMELITA_PROPOSAL_EMAIL_TO");
  if (!reviewUrl) missing.push("CARMELITA_PUBLIC_ORIGIN");
  return { enabled: isProposalEmailEnabled(env), ready: missing.length === 0, apiKey, from, to, reviewUrl, missing };
}

/** The alert contains only a reference and the private inbox link; proposal content remains in the inbox. */
export function buildProposalEmailMessage(proposalId: string, snapshot: { from: string; to: string; reviewUrl: string }): ProposalEmailMessage {
  if (!UUID.test(proposalId) || !bareEmail(snapshot.from) || !bareEmail(snapshot.to) || !privateReviewUrl(snapshot.reviewUrl)) {
    throw new Error("proposal_email_invalid_message");
  }
  return {
    from: snapshot.from,
    to: [snapshot.to],
    subject: SUBJECT,
    text: `A new service proposal is awaiting review in Carmelita.\n\nProposal ID: ${proposalId.toLowerCase()}\nReview proposals: ${snapshot.reviewUrl}\n`,
  };
}

function validMessage(message: ProposalEmailMessage): boolean {
  // The durable outbox owns this payload. Do not require the current template: old jobs must replay unchanged.
  return !!message && bareEmail(message.from) && Array.isArray(message.to) && message.to.length === 1 && bareEmail(message.to[0])
    && typeof message.subject === "string" && message.subject.length > 0 && message.subject.length <= 200 && !/[\x00-\x1f\x7f]/.test(message.subject)
    && typeof message.text === "string" && message.text.length > 0 && message.text.length <= 4_096 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message.text);
}

function retryDelay(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value || value.length > 128) return undefined;
  const milliseconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1_000 : Date.parse(value) - Date.now();
  return Number.isFinite(milliseconds) && milliseconds >= 0 ? Math.min(Math.ceil(milliseconds), 86_400_000) : undefined;
}

function discardBody(response: Response) {
  if (response.body) void response.body.cancel().catch(() => {});
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    discardBody(response);
    throw new Error("provider_response_too_large");
  }
  if (!response.body) throw new Error("provider_response_invalid");
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("provider_response_too_large");
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof Error && error.message === "provider_response_too_large") throw error;
    throw new Error("provider_response_invalid");
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Call only after claiming the durable job with enabled, ready server configuration. */
export async function sendProposalEmail(message: ProposalEmailMessage, apiKey: string, idempotencyKey: string, deps: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<SendResult> {
  if (!validMessage(message)) return { status: "rejected", code: "proposal_email_invalid_message" };
  if (!headerToken(apiKey)) return { status: "rejected", code: "proposal_email_invalid_credentials" };
  if (typeof idempotencyKey !== "string" || !/^[a-z0-9/._:-]{1,256}$/i.test(idempotencyKey)) return { status: "rejected", code: "proposal_email_invalid_idempotency_key" };
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(deps.timeoutMs) ? Math.max(1, Math.min(MAX_TIMEOUT_MS, deps.timeoutMs!)) : 5_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<SendResult>(resolve => {
    timer = setTimeout(() => {
      resolve({ status: "retry", code: "provider_timeout" });
      controller.abort();
    }, timeoutMs);
  });
  const operation = (async (): Promise<SendResult> => {
    try {
      const response = await (deps.fetch ?? fetch)("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ from: message.from, to: message.to, subject: message.subject, text: message.text }),
        signal: controller.signal,
        redirect: "error",
      });
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        discardBody(response);
        return { status: "retry", code: response.status === 408 ? "provider_timeout" : response.status === 429 ? "provider_rate_limited" : "provider_unavailable", retryAfterMs: retryDelay(response) };
      }
      if (!response.ok && response.status !== 409) {
        discardBody(response);
        return { status: "rejected", code: response.status === 401 || response.status === 403 ? "provider_credentials_rejected" : "provider_request_rejected" };
      }
      let payload: unknown;
      try { payload = await boundedJson(response, controller.signal); }
      catch (error) {
        if (response.status === 409 && !controller.signal.aborted) return { status: "rejected", code: "provider_conflict" };
        throw error;
      }
      if (response.status === 409) {
        return payload && typeof payload === "object" && "name" in payload && payload.name === "concurrent_idempotent_requests"
          ? { status: "retry", code: "provider_concurrent_request", retryAfterMs: retryDelay(response) }
          : { status: "rejected", code: "provider_conflict" };
      }
      if (payload && typeof payload === "object" && "id" in payload && typeof payload.id === "string" && /^[a-z0-9][a-z0-9_-]{0,127}$/i.test(payload.id)) {
        return { status: "accepted", providerId: payload.id };
      }
      return { status: "retry", code: "provider_response_invalid" };
    } catch (error) {
      if (controller.signal.aborted) return { status: "retry", code: "provider_timeout" };
      if (error instanceof Error && (error.message === "provider_response_too_large" || error.message === "provider_response_invalid")) return { status: "retry", code: error.message };
      return { status: "retry", code: "provider_network_error" };
    }
  })();
  try { return await Promise.race([operation, deadline]); }
  finally { if (timer) clearTimeout(timer); }
}
