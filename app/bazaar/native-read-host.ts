import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { requireMcpSubject } from "@/app/mcp/auth";
import { createBazaarNativeReadAdapter, type HistoryCursor } from "./native-read";
import { existingBazaarConnectionStore, type NativeConnectionStore } from "./native-connection-store";

export type NativeReadAction = "catalog" | "preflight" | "history";
type Dependencies = { store?: NativeConnectionStore; fetcher?: typeof fetch };
/** authInfo comes from authenticateMcp/verifyAgentMcpToken in the existing
 * route. No user, owner, URL or credential selector is accepted in tool args. */
export async function executeBazaarNativeRead(action: NativeReadAction, input: unknown, authInfo: AuthInfo | undefined, deps: Dependencies = {}) {
  const authenticatedUserId = () => Promise.resolve(requireMcpSubject(authInfo, "user", "userId", "agent:read"));
  const userId = await authenticatedUserId();
  const store = deps.store ?? existingBazaarConnectionStore();
  // Public discovery also requires the current Carmelita session, but it needs
  // neither a Bazaar binding nor a secret.
  if (action !== "catalog" && !await store.bindingForUser(userId)) {
    return { status: "not-linked" as const, code: "bazaar_native_link_required", readOnly: true,
      remoteAttempts: 0, secretReads: 0, accountCreated: false, purchaseAuthorized: false };
  }
  const adapter = createBazaarNativeReadAdapter({ authenticatedUserId,
    bindingForUser: store.bindingForUser, agentSecretForUser: store.agentSecretForUser,
    fetcher: deps.fetcher ?? globalThis.fetch });
  try {
    if (action === "catalog") return await adapter.catalog(input as { limit?: number; query?: string; cursor?: string });
    if (action === "preflight") {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("bazaar_native_input_invalid");
      return await adapter.preflight();
    }
    if (action === "history") return await adapter.history(input as { limit?: number; cursor?: HistoryCursor });
    throw new Error("bazaar_native_tool_forbidden");
  } catch (error) {
    const code = error instanceof Error && /^bazaar_native_[a-z_]{1,80}$/.test(error.message)
      ? error.message : "bazaar_native_read_unconfirmed";
    throw new Error(code); // Never return raw upstream/SQL/decryption errors.
  }
}
