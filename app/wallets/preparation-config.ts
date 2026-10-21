import { createHash, timingSafeEqual } from "node:crypto";
import { enabledWalletNetworks } from "./networks";

export function walletPreparationEnabled(env: Record<string, string | undefined> = process.env) {
  return env.CARMELITA_WALLET_PREPARATION_ENABLED === "true";
}
export function preparationCatalog() {
  return "wallets-v1:" + createHash("sha256").update(enabledWalletNetworks().map(item => item.id).sort().join(",")).digest("hex").slice(0, 24);
}
export function workerAuthorized(request: Request, env: Record<string, string | undefined> = process.env) {
  const secret = env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}
