export const CONVERSATION_TIMEOUT_MS = 15_000;
export const CHAT_TIMEOUT_MS = 30_000;
export const WORKSPACE_TIMEOUT_MS = 20_000;

/** Race SDK, fetch and body promises too, including transports that ignore AbortSignal. */
export function sessionAbortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", cancel);
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal.reason);
    };
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(() => {
      signal.throwIfAborted();
      return operation();
    }).then(value => {
      if (settled) return;
      signal.throwIfAborted();
      settled = true;
      cleanup();
      resolve(value);
    }).catch(cause => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(cause);
    });
  });
}

/** One deadline covers all sequential steps; completing or cancelling releases its timer. */
export async function withSessionDeadline<T>(owner: AbortSignal, timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  owner.throwIfAborted();
  const deadline = new AbortController();
  const signal = AbortSignal.any([owner, deadline.signal]);
  const timer = setTimeout(() => deadline.abort(new DOMException("Session request timed out", "TimeoutError")), timeoutMs);
  try { return await sessionAbortable(() => operation(signal), signal); }
  finally { clearTimeout(timer); }
}

export async function requestAgentConversation<Message, Connection>(
  getAccessToken: () => Promise<string | null>,
  owner: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = CONVERSATION_TIMEOUT_MS,
): Promise<{ messages: Message[]; connections: Connection[] }> {
  return withSessionDeadline(owner, timeoutMs, async signal => {
    const token = await sessionAbortable(getAccessToken, signal);
    if (!token) throw new Error("authentication_required");
    const headers = { Authorization: "Bearer " + token };
    const response = await sessionAbortable(() => fetcher("/api/agent/chat", { headers, cache: "no-store", signal }), signal);
    const body = await sessionAbortable(() => response.json(), signal);
    if (!response.ok) throw new Error(body.error ?? "conversation_unavailable");
    if (!Array.isArray(body.messages)) throw new Error("conversation_response_invalid");
    const connectionsResponse = await sessionAbortable(() => fetcher("/api/connections", { headers, cache: "no-store", signal }), signal);
    const connectionsBody = await sessionAbortable(() => connectionsResponse.json(), signal);
    signal.throwIfAborted();
    return {
      messages: body.messages,
      connections: connectionsResponse.ok && Array.isArray(connectionsBody.connections) ? connectionsBody.connections : [],
    };
  });
}

/** Only the authenticated server chooses the owner. The expected ID is checked locally, never posted. */
export async function requestWalletBootstrap<Result extends { user?: { id?: string } }>(
  expectedOwner: string,
  getAccessToken: () => Promise<string | null>,
  refreshUser: () => Promise<unknown>,
  owner: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = WORKSPACE_TIMEOUT_MS,
): Promise<Result> {
  return withSessionDeadline(owner, timeoutMs, async signal => {
    const token = await sessionAbortable(getAccessToken, signal);
    if (!token) throw new Error("authentication_required");
    const response = await sessionAbortable(() => fetcher("/api/agent/bootstrap", {
      method: "POST", signal,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    }), signal);
    const body = await sessionAbortable(() => response.json(), signal);
    if (!response.ok) throw new Error(body.error ?? "wallet_bootstrap_failed");
    if (body.user?.id !== expectedOwner) throw new Error("wallet_response_mismatch");
    // Refresh the SDK identity under the same budget before publishing prepared-wallet state.
    await sessionAbortable(refreshUser, signal);
    signal.throwIfAborted();
    return body as Result;
  });
}
