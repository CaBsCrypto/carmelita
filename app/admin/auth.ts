import {
  createHmac,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getPrivyAdminIdentity, isPrivyAdminConfigured } from "./privy-auth";

export const ADMIN_COOKIE = "aa_founder_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AdminIdentity = {
  username: string;
  displayName: string;
  method: "password" | "chatgpt" | "privy";
};

function configuredUsername() {
  return process.env.ADMIN_USERNAME?.trim() || "founder";
}

function allowedAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionSignature(payload: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function isPasswordAdminConfigured() {
  return !isPrivyAdminConfigured() && Boolean(
    process.env.ADMIN_PASSWORD_HASH && process.env.ADMIN_SESSION_SECRET,
  );
}

export function verifyAdminCredentials(username: string, password: string) {
  const encoded = process.env.ADMIN_PASSWORD_HASH;
  if (!encoded || !safeEqual(username, configuredUsername())) return false;

  const [algorithm, salt, expected] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;

  try {
    const actual = scryptSync(password, salt, 64).toString("base64url");
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createAdminSessionToken(username: string) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  const signature = sessionSignature(payload);
  if (!signature) throw new Error("admin_session_not_configured");
  return `${payload}.${signature}`;
}

function verifyAdminSessionToken(token: string): AdminIdentity | null {
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;

  const expectedSignature = sessionSignature(payload);
  if (!expectedSignature || !safeEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { username?: string; expiresAt?: number };

    if (
      parsed.username !== configuredUsername() ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }

    return {
      username: parsed.username,
      displayName: "Founder",
      method: "password",
    };
  } catch {
    return null;
  }
}

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  if (isPrivyAdminConfigured()) {
    const token = (await cookies()).get("aa_admin_privy")?.value;
    return token ? getPrivyAdminIdentity(token) : null;
  }
  const chatGPTUser = await getChatGPTUser();
  const allowlist = allowedAdminEmails();

  if (
    chatGPTUser &&
    allowlist.includes(chatGPTUser.email.trim().toLowerCase())
  ) {
    return {
      username: chatGPTUser.email,
      displayName: chatGPTUser.displayName,
      method: "chatgpt",
    };
  }

  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? verifyAdminSessionToken(token) : null;
}

export async function requireAdminPage(returnTo = "/admin") {
  const identity = await getAdminIdentity();
  if (identity) return identity;

  redirect("/admin/login?returnTo=" + encodeURIComponent(returnTo));
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function sanitizeAdminReturnTo(value: string | null | undefined) {
  if (!value?.startsWith("/admin") || value.startsWith("//")) return "/admin";
  return value;
}

