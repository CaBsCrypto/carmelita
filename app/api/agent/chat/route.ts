import { NextResponse } from "next/server";
import { z } from "zod";
import { ChatQuotaError, enforceChatIpQuota, trustedChatIp } from "@/app/chat-quota";
import {
  getAgentConversation,
  sendAgentMessage,
} from "@/app/agent-chat-store";
import { verifyPrivyAccessToken } from "@/app/privy-stellar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  return !origin || !host || new URL(origin).host === host;
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function authenticatedUser(request: Request) {
  if (!sameOrigin(request)) throw new Error("invalid_origin");
  const claims = await verifyPrivyAccessToken(bearerToken(request));
  return claims.user_id;
}

export async function GET(request: Request) {
  try {
    const userId = await authenticatedUser(request);
    const conversation = await getAgentConversation(userId);
    return NextResponse.json(conversation, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const code =
      error instanceof Error ? error.message.split(":")[0] : "chat_load_failed";
    const status =
      code === "invalid_origin"
        ? 403
        : code === "database_not_configured"
          ? 503
          : 401;
    return NextResponse.json({ error: code }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await authenticatedUser(request);
    const input = messageSchema.parse(await request.json());
    await enforceChatIpQuota(trustedChatIp(request));
    const result = await sendAgentMessage(userId, input.message);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ChatQuotaError) return NextResponse.json({ error: error.message, retryAfterSeconds: error.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds), "Cache-Control": "no-store" } });
    if (error instanceof Error && error.message.startsWith("chat_quota_")) return NextResponse.json({ error: "chat_quota_unavailable" }, { status: 503 });
    const code =
      error instanceof z.ZodError
        ? "invalid_message"
        : error instanceof Error
          ? error.message.split(":")[0]
          : "chat_send_failed";
    const status =
      code === "invalid_message"
        ? 400
        : code === "invalid_origin"
          ? 403
          : code === "database_not_configured"
            ? 503
            : 401;
    return NextResponse.json({ error: code }, { status });
  }
}


