import { WORKSPACE_TIMEOUT_MS, sessionAbortable, withSessionDeadline } from "./session-request";

/** Client-safe read request. An owner remount or newer search aborts its predecessor. */
export async function requestTravelSearch<Result>(
  input: { location: string; checkIn: string; checkOut: string; guests: number; maxPrice?: number },
  getAccessToken: () => Promise<string | null>,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = WORKSPACE_TIMEOUT_MS,
): Promise<Result> {
  return withSessionDeadline(signal, timeoutMs, async boundedSignal => {
    const token = await sessionAbortable(getAccessToken, boundedSignal);
    if (!token) throw new Error("authentication_required");
    const response = await sessionAbortable(() => fetcher("/api/agent/travel/search", {
      method: "POST", signal: boundedSignal,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }), boundedSignal);
    const body = await sessionAbortable(() => response.json(), boundedSignal);
    boundedSignal.throwIfAborted();
    if (!response.ok) throw new Error(body.error ?? "travel_search_failed");
    return body;
  });
}
