import type { Locale } from "../language-toggle";

/** Never issue a message with a token resolved after its originating owner session ended. */
export async function requestAgentChat<T>(
  message: string,
  locale: Locale,
  getAccessToken: () => Promise<string | null>,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  signal.throwIfAborted();
  const token = await getAccessToken();
  signal.throwIfAborted();
  if (!token) throw new Error("authentication_required");
  const response = await fetcher("/api/agent/chat", {
    method: "POST", signal,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, locale }),
  });
  const body = await response.json();
  signal.throwIfAborted();
  if (!response.ok) throw new Error(body.error ?? "message_failed");
  return body as T;
}
