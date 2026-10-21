export const CONSENT_TIMEOUT_MS = 20_000;

export async function requestConsentRedirect(
  query: string,
  consentGranted: boolean,
  getAccessToken: () => Promise<string | null>,
  fetcher: typeof fetch = fetch,
  timeoutMs = CONSENT_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Connection status is uncertain. Start a new connection from ChatGPT; do not repeat this approval."));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const token = await getAccessToken();
        if (controller.signal.aborted) throw new Error("Connection request expired.");
        if (!token) throw new Error("Privy session is unavailable.");
        const response = await fetcher("/api/oauth/stytch/authorize", {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, consentGranted }),
        });
        const body = await response.json();
        if (!response.ok || typeof body.redirectUri !== "string") {
          throw new Error("Authorization could not be completed. Start a new connection from ChatGPT.");
        }
        const expected = new URL(new URLSearchParams(query).get("redirect_uri") || "");
        const redirect = new URL(body.redirectUri);
        const local = redirect.protocol === "http:" && ["localhost", "127.0.0.1"].includes(redirect.hostname);
        if (redirect.username || redirect.password || (!local && redirect.protocol !== "https:") ||
            redirect.origin !== expected.origin || redirect.pathname !== expected.pathname ||
            redirect.searchParams.get("state") !== new URLSearchParams(query).get("state")) {
          throw new Error("Connection redirect is invalid.");
        }
        return redirect.toString();
      })(),
    ]);
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error("Connection status is uncertain. Start a new connection from ChatGPT; do not repeat this approval.");
    }
    if (cause instanceof Error && ["Privy session is unavailable.", "Connection redirect is invalid.", "Authorization could not be completed. Start a new connection from ChatGPT."].includes(cause.message)) throw cause;
    throw new Error("Authorization could not be completed. Start a new connection from ChatGPT.");
  } finally {
    clearTimeout(timer);
  }
}
