import type { Locale } from "../language-toggle";
import { CHAT_TIMEOUT_MS, sessionAbortable, withSessionDeadline } from "./session-request";

/** Never issue a message with a token resolved after its originating owner session ended. */
export async function requestAgentChat<T>(
  message: string,
  locale: Locale,
  getAccessToken: () => Promise<string | null>,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<T> {
  return withSessionDeadline(signal, timeoutMs, async boundedSignal => {
    const token = await sessionAbortable(getAccessToken, boundedSignal);
    if (!token) throw new Error("authentication_required");
    const response = await sessionAbortable(() => fetcher("/api/agent/chat", {
      method: "POST", signal: boundedSignal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, locale }),
    }), boundedSignal);
    const body = await sessionAbortable(() => response.json(), boundedSignal);
    boundedSignal.throwIfAborted();
    if (!response.ok) throw new Error(body.error ?? "message_failed");
    return body as T;
  });
}
