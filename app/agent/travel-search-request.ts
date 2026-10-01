/** Client-safe read request. An owner remount or newer search aborts its predecessor. */
export async function requestTravelSearch<Result>(
  input: { location: string; checkIn: string; checkOut: string; guests: number; maxPrice?: number },
  getAccessToken: () => Promise<string | null>,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Result> {
  signal.throwIfAborted();
  const token = await getAccessToken();
  signal.throwIfAborted();
  if (!token) throw new Error("Authentication token unavailable");
  const response = await fetcher("/api/agent/travel/search", {
    method: "POST", signal,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json();
  signal.throwIfAborted();
  if (!response.ok) throw new Error(body.error ?? "Travel search failed");
  return body;
}
