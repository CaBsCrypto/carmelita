import type { Locale } from "../language-toggle";
import { WORKSPACE_TIMEOUT_MS, sessionAbortable, withSessionDeadline } from "./session-request";

/** Same owner-bound read adapter used by chat and MCP; panels never run preparation. */
export async function readWorkspaceQuery<T>(
  query: string,
  getAccessToken: () => Promise<string | null>,
  locale: Locale,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = WORKSPACE_TIMEOUT_MS,
): Promise<T> {
  return withSessionDeadline(signal, timeoutMs, async boundedSignal => {
    const token = await sessionAbortable(getAccessToken, boundedSignal);
    if (!token) throw new Error("authentication_required");
    const response = await sessionAbortable(() => fetcher("/api/agent/queries", {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: boundedSignal,
      body: JSON.stringify({ query, input: {}, locale }),
    }), boundedSignal);
    const body = await sessionAbortable(() => response.json(), boundedSignal);
    boundedSignal.throwIfAborted();
    if (!response.ok) throw new Error(body.error ?? "read_query_unavailable");
    return body as T;
  });
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
