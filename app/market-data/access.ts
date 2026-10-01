import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { requireMcpSubject } from "@/app/mcp/auth";

/** Authenticate before any external read; market adapters never receive a user ID or token. */
export async function executeMarketRead<T>(authInfo: AuthInfo | undefined, read: () => Promise<T>): Promise<T> {
  requireMcpSubject(authInfo, "user", "userId", "agent:read");
  return read();
}
