import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { requireMcpSubject } from "@/app/mcp/auth";
import { executeReadQuery, getReadQuery } from "./registry";
import type { QueryDefinition, QueryLocale } from "./types";

export function executeWebReadQuery(id: string, input: unknown, userId: string, locale: QueryLocale = "es", definitions?: readonly QueryDefinition[]) {
  // The caller must verify the Privy session. These are internal authority grants,
  // not added OAuth scopes or consent on the user's external connection.
  return executeReadQuery(id, input, { userId, scopes: ["agent:read", "agent:context", "agent:conversation"] }, { locale, definitions });
}

export function executeMcpReadQuery(id: string, input: unknown, authInfo: AuthInfo | undefined, definitions?: readonly QueryDefinition[]) {
  const definition = getReadQuery(id, definitions);
  const userId = requireMcpSubject(authInfo, "user", "userId", definition.scope);
  return executeReadQuery(id, input, { userId, scopes: authInfo?.scopes ?? [] }, { definitions });
}
