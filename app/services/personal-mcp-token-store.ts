import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { mcpAccessTokens } from "@/db/schema";
import { ensureMcpProviderSchema } from "@/app/services/provider-migration";

export const PERSONAL_MCP_TOKEN_PREFIX = "carmelita_user_";
export const PERSONAL_MCP_SCOPES = ["agent:read", "agent:plan", "agent:context", "agent:conversation"] as const;
export type PersonalMcpScope = (typeof PERSONAL_MCP_SCOPES)[number];
const DEFAULT_SCOPES: PersonalMcpScope[] = ["agent:read"];
export const MAX_ACTIVE_PERSONAL_MCP_TOKENS = 10;
const DEFAULT_EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

async function personalMcpDb() { await ensureMcpProviderSchema(); return getDb(); }
export function hashPersonalMcpToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function createRawPersonalMcpToken() { return PERSONAL_MCP_TOKEN_PREFIX + randomBytes(32).toString("base64url"); }
export function personalMcpTokenPrefix(token: string) { return token.slice(0, PERSONAL_MCP_TOKEN_PREFIX.length + 6); }
export function validatePersonalMcpScopes(scopes?: string[]) {
  const requested = scopes?.length ? [...new Set(scopes)] : DEFAULT_SCOPES;
  if (requested.some((scope) => !PERSONAL_MCP_SCOPES.includes(scope as PersonalMcpScope))) throw new Error("personal_mcp_scope_invalid");
  return requested as PersonalMcpScope[];
}
function publicTokenMetadata(token: { id: string; name: string; tokenPrefix: string; scopes: string[]; status: string; expiresAt: Date | null; lastUsedAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: token.id, name: token.name, tokenPrefix: token.tokenPrefix, scopes: token.scopes, status: token.status, expiresAt: token.expiresAt, lastUsedAt: token.lastUsedAt, createdAt: token.createdAt, updatedAt: token.updatedAt };
}
export async function issuePersonalMcpToken(input: { userId: string; name?: string; scopes?: string[]; expiresAt?: Date | null }) {
  const now = Date.now();
  const expiresAt = input.expiresAt ?? new Date(now + DEFAULT_EXPIRATION_MS);
  if (expiresAt.getTime() <= now || expiresAt.getTime() > now + MAX_EXPIRATION_MS) throw new Error("personal_mcp_expiration_invalid");
  const db = await personalMcpDb();
  const active = await db.select({ id: mcpAccessTokens.id }).from(mcpAccessTokens)
    .where(and(
      eq(mcpAccessTokens.subjectType, "user"),
      eq(mcpAccessTokens.subjectId, input.userId),
      eq(mcpAccessTokens.status, "active"),
      or(isNull(mcpAccessTokens.expiresAt), gt(mcpAccessTokens.expiresAt, new Date(now))),
    ))
    .limit(MAX_ACTIVE_PERSONAL_MCP_TOKENS);
  if (active.length >= MAX_ACTIVE_PERSONAL_MCP_TOKENS) throw new Error("personal_mcp_token_limit_reached");
  const rawToken = createRawPersonalMcpToken();
  const [record] = await db.insert(mcpAccessTokens).values({
    id: "mcpk_" + randomUUID(), subjectType: "user", subjectId: input.userId,
    name: input.name?.trim().slice(0, 80) || "Personal agent connection",
    tokenPrefix: personalMcpTokenPrefix(rawToken), tokenHash: hashPersonalMcpToken(rawToken),
    scopes: validatePersonalMcpScopes(input.scopes), expiresAt,
  }).returning();
  return { token: rawToken, credential: publicTokenMetadata(record) };
}
export async function listPersonalMcpTokens(userId: string) {
  const rows = await (await personalMcpDb()).select().from(mcpAccessTokens)
    .where(and(eq(mcpAccessTokens.subjectType, "user"), eq(mcpAccessTokens.subjectId, userId)))
    .orderBy(desc(mcpAccessTokens.createdAt));
  return rows.map(publicTokenMetadata);
}
export async function revokePersonalMcpToken(userId: string, tokenId: string) {
  const [record] = await (await personalMcpDb()).update(mcpAccessTokens).set({ status: "revoked", updatedAt: new Date() })
    .where(and(eq(mcpAccessTokens.id, tokenId), eq(mcpAccessTokens.subjectType, "user"), eq(mcpAccessTokens.subjectId, userId))).returning();
  if (!record) throw new Error("personal_mcp_token_not_found");
  return publicTokenMetadata(record);
}
export async function verifyPersonalMcpToken(rawToken: string) {
  if (!rawToken.startsWith(PERSONAL_MCP_TOKEN_PREFIX)) throw new Error("personal_mcp_token_invalid");
  const db = await personalMcpDb();
  const [record] = await db.select().from(mcpAccessTokens).where(eq(mcpAccessTokens.tokenHash, hashPersonalMcpToken(rawToken))).limit(1);
  if (!record || record.subjectType !== "user" || record.status !== "active" || (record.expiresAt && record.expiresAt.getTime() <= Date.now())) throw new Error("personal_mcp_token_invalid");
  const scopes = validatePersonalMcpScopes(record.scopes); const usedAt = new Date();
  await db.update(mcpAccessTokens).set({ lastUsedAt: usedAt, updatedAt: usedAt }).where(eq(mcpAccessTokens.id, record.id));
  return { userId: record.subjectId, scopes, expiresAt: record.expiresAt, tokenId: record.id };
}
