import { PrivyClient } from "@privy-io/node";

export function requiredPrivyCredentials() {
  const appId = process.env.PRIVY_APP_ID?.trim();
  const appSecret = process.env.PRIVY_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    throw new Error("privy_not_configured");
  }

  return { appId, appSecret };
}

export function getPrivyClient(options: { timeout?: number; maxRetries?: number } = {}) {
  const { appId, appSecret } = requiredPrivyCredentials();
  return new PrivyClient({ appId, appSecret, ...options });
}
