export const CONSENT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export type ConsentErrorCode = "session_unavailable" | "inspection_failed" | "inspection_timeout" | "authorization_failed" | "authorization_uncertain" | "redirect_invalid" | "cancelled";
export class ConsentRequestError extends Error {
  constructor(readonly code: ConsentErrorCode) { super(code); }
}

export type ConsentPreflight = {
  client: { clientId: string; clientName: string; clientDescription?: string };
  requestedScopes: string[];
  consentRequired: boolean;
};

async function readResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error("invalid_response");
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new ConsentRequestError("cancelled");
      const next = await reader.read();
      if (signal.aborted) throw new ConsentRequestError("cancelled");
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("invalid_response");
      chunks.push(next.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(body));
  } finally {
    signal.removeEventListener("abort", cancel);
    if (signal.aborted || bytes > MAX_RESPONSE_BYTES) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function request<T>(
  path: "/api/oauth/stytch/preflight" | "/api/oauth/stytch/authorize",
  body: Record<string, unknown>,
  getAccessToken: () => Promise<string | null>,
  parse: (value: unknown) => T,
  fetcher: typeof fetch,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const authorization = path.endsWith("/authorize");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop!: () => void;
  const deadline = new Promise<never>((_, reject) => {
    stop = () => { controller.abort(); reject(new ConsentRequestError("cancelled")); };
    if (externalSignal?.aborted) { stop(); return; }
    externalSignal?.addEventListener("abort", stop, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new ConsentRequestError(authorization ? "authorization_uncertain" : "inspection_timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      if (controller.signal.aborted) throw new ConsentRequestError("cancelled");
      const token = await getAccessToken();
      if (controller.signal.aborted) throw new ConsentRequestError("cancelled");
      if (!token) throw new ConsentRequestError("session_unavailable");
      const response = await fetcher(path, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const value = await readResponse(response, controller.signal);
      if (controller.signal.aborted) throw new ConsentRequestError("cancelled");
      return parse(value);
    })()]);
  } catch (cause) {
    if (cause instanceof ConsentRequestError) throw cause;
    throw new ConsentRequestError(authorization ? "authorization_failed" : "inspection_failed");
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", stop);
  }
}

function preflight(value: unknown): ConsentPreflight {
  const item = value as Partial<ConsentPreflight> | null;
  const boundedText = (text: unknown, max: number): text is string => typeof text === "string" && text.trim().length > 0 && text.length <= max;
  if (!item || !boundedText(item.client?.clientId, 256) || !boundedText(item.client.clientName, 120) ||
      (item.client.clientDescription !== undefined && !boundedText(item.client.clientDescription, 500)) ||
      typeof item.consentRequired !== "boolean" || !Array.isArray(item.requestedScopes) || item.requestedScopes.length > 32 ||
      !item.requestedScopes.every(scope => typeof scope === "string" && /^[a-z][a-z0-9:_-]{0,99}$/i.test(scope)) ||
      new Set(item.requestedScopes).size !== item.requestedScopes.length) throw new Error("invalid_preflight");
  return { client: { ...item.client }, requestedScopes: [...item.requestedScopes], consentRequired: item.consentRequired };
}

export function requestConsentPreflight(query: string, getAccessToken: () => Promise<string | null>, fetcher: typeof fetch = fetch, timeoutMs = CONSENT_TIMEOUT_MS, signal?: AbortSignal) {
  return request("/api/oauth/stytch/preflight", { query }, getAccessToken, preflight, fetcher, timeoutMs, signal);
}

function callback(query: string, consentGranted: boolean, value: unknown): string {
  try {
    const params = new URLSearchParams(query);
    const redirectUri = (value as { redirectUri?: unknown } | null)?.redirectUri;
    if (typeof redirectUri !== "string" || params.getAll("redirect_uri").length !== 1 || params.getAll("state").length > 1) throw new Error();
    const expected = new URL(params.get("redirect_uri")!);
    const redirect = new URL(redirectUri);
    for (const url of [expected, redirect]) {
      const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
      if (url.username || url.password || url.hash || (!local && url.protocol !== "https:")) throw new Error();
    }
    if (redirect.origin !== expected.origin || redirect.pathname !== expected.pathname ||
        redirect.searchParams.getAll("state").length > 1 || redirect.searchParams.get("state") !== params.get("state")) throw new Error();
    for (const key of new Set(expected.searchParams.keys())) {
      if (["code", "state", "error"].includes(key) || JSON.stringify(expected.searchParams.getAll(key)) !== JSON.stringify(redirect.searchParams.getAll(key))) throw new Error();
    }
    const codes = redirect.searchParams.getAll("code");
    const errors = redirect.searchParams.getAll("error");
    if (codes.length + errors.length !== 1 || !(codes[0] || errors[0]) || (!consentGranted && (codes.length > 0 || errors[0] !== "access_denied"))) throw new Error();
    return redirect.toString();
  } catch { throw new ConsentRequestError("redirect_invalid"); }
}

export function requestConsentRedirect(query: string, consentGranted: boolean, getAccessToken: () => Promise<string | null>, fetcher: typeof fetch = fetch, timeoutMs = CONSENT_TIMEOUT_MS, signal?: AbortSignal): Promise<string> {
  return request("/api/oauth/stytch/authorize", { query, consentGranted }, getAccessToken, value => callback(query, consentGranted, value), fetcher, timeoutMs, signal);
}

// Keep the first decision, even after a timeout: the authorization may already have reached the server.
export function createConsentDecision(query: string, getAccessToken: () => Promise<string | null>, fetcher: typeof fetch = fetch, timeoutMs = CONSENT_TIMEOUT_MS, signal?: AbortSignal) {
  let result: Promise<string> | undefined;
  return (consentGranted: boolean) => result ??= requestConsentRedirect(query, consentGranted, getAccessToken, fetcher, timeoutMs, signal);
}
