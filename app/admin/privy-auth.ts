import { getPrivyUserIdentity, verifyPrivyAccessToken } from "@/app/privy-stellar";
import type { AdminIdentity } from "./auth";

export function isPrivyAdminConfigured() {
  return Boolean(process.env.CARMELITA_ADMIN_EMAILS?.trim());
}

export function isAllowedAdminEmail(email: string | null) {
  if (!email) return false;
  return (process.env.CARMELITA_ADMIN_EMAILS ?? "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export async function getPrivyAdminIdentity(
  token: string,
  dependencies: {
    verifyPrivyAccessToken: (token: string) => Promise<{ user_id: string }>;
    getPrivyUserIdentity: (id: string) => Promise<{ id: string; email: string | null }>;
  } = { verifyPrivyAccessToken, getPrivyUserIdentity },
): Promise<AdminIdentity | null> {
  try {
    const claims = await dependencies.verifyPrivyAccessToken(token);
    const user = await dependencies.getPrivyUserIdentity(claims.user_id);
    if (user.id !== claims.user_id || !isAllowedAdminEmail(user.email)) return null;
    return { username: user.email!, displayName: user.email!, method: "privy" };
  } catch {
    return null;
  }
}
