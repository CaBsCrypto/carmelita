import type { Locale } from "../language-toggle";

/** Same owner-bound read adapter used by chat and MCP; panels never run preparation. */
export async function readWorkspaceQuery<T>(
  query: string,
  getAccessToken: () => Promise<string | null>,
  locale: Locale,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<T> {
  signal.throwIfAborted();
  const token = await getAccessToken();
  signal.throwIfAborted();
  if (!token) throw new Error("authentication_required");
  const response = await fetcher("/api/agent/queries", {
    method: "POST", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    body: JSON.stringify({ query, input: {}, locale }),
  });
  const body = await response.json();
  signal.throwIfAborted();
  if (!response.ok) throw new Error(body.error ?? "read_query_unavailable");
  return body as T;
}

export const workspaceCommands = [
  '/consulta personal.wallets {}',
  '/consulta personal.wallets.balances {}',
  '/consulta offchain.market.quote {"assets":[{"query":"SOL"},{"query":"AVAX"},{"query":"BNB"}]}',
  '/consulta offchain.defillama.chains {"chains":["Solana","Base","Avalanche"]}',
  '/consulta personal.watchlist {}',
  '/consulta personal.connections {}',
  '/consulta offchain.capabilities.list {}',
] as const;
