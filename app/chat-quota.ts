import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agentGatewayRateLimits } from "@/db/schema";

export class ChatQuotaError extends Error {
  constructor(readonly retryAfterSeconds: number) { super("chat_quota_exceeded"); }
}
export type QuotaBucket = { key: string; scope: string; subject: string; start: Date; end: Date; limit: number };
export type ConsumeBucket = (bucket: QuotaBucket) => Promise<boolean>;
function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("chat_quota_configuration_invalid");
  return Number(value);
}
export function chatQuotaConfig(env: Record<string, string | undefined> = process.env) {
  return { daily: positiveInteger(env.CARMELITA_CHAT_DAILY_LIMIT, 30), ipHourly: positiveInteger(env.CARMELITA_CHAT_IP_HOURLY_LIMIT, 120) };
}
function bucket(scope: string, subject: string, limit: number, seconds: number, now: Date): QuotaBucket {
  const digest = createHash("sha256").update(`carmelita-chat-quota-v1\0${scope}\0${subject}`).digest("hex");
  const start = new Date(Math.floor(now.getTime() / (seconds * 1000)) * seconds * 1000);
  return { scope, subject: digest, key: `${scope}:${digest}:${start.getTime()}`, start, end: new Date(start.getTime() + seconds * 1000), limit };
}
export const consumeChatBucket: ConsumeBucket = async (input) => {
  const [row] = await getDb().insert(agentGatewayRateLimits).values({
    key: input.key, scope: input.scope, subjectPseudonym: input.subject,
    windowStartedAt: input.start, windowEndsAt: input.end, requestCount: 1,
  }).onConflictDoUpdate({ target: agentGatewayRateLimits.key, set: {
    requestCount: sql`${agentGatewayRateLimits.requestCount} + 1`, updatedAt: new Date(),
  }, setWhere: sql`${agentGatewayRateLimits.requestCount} < ${input.limit}` }).returning({ count: agentGatewayRateLimits.requestCount });
  return Boolean(row);
};
// Trust only the Vercel-generated header on Vercel, never client x-forwarded-for.
export function trustedChatIp(request: Request, env: Record<string, string | undefined> = process.env) {
  if (env.VERCEL !== "1") return null;
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim();
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new Error("chat_quota_ip_unavailable");
  return ip;
}
export async function enforceChatQuota(userId: string | null, ip: string | null, options: {
  now?: Date; consume?: ConsumeBucket; env?: Record<string, string | undefined>;
} = {}) {
  const now = options.now ?? new Date();
  const consume = options.consume ?? consumeChatBucket;
  try {
    const config = chatQuotaConfig(options.env);
    const buckets = [
      ...(ip ? [bucket("chat_ip_hourly", ip, config.ipHourly, 3600, now)] : []),
      ...(userId ? [bucket("chat_user_daily", userId, config.daily, 86400, now)] : []),
    ];
    for (const item of buckets) {
      if (!await consume(item)) throw new ChatQuotaError(Math.max(1, Math.ceil((item.end.getTime() - now.getTime()) / 1000)));
    }
  } catch (error) {
    if (error instanceof ChatQuotaError) throw error;
    throw new Error("chat_quota_unavailable");
  }
}

export async function enforceChatIpQuota(ip: string | null) {
  return enforceChatQuota(null, ip);
}


