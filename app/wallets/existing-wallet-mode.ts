/** Raw opt-in prevents invalid configuration from falling back to wallet creation. */
export function existingOAuthWalletsRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.CARMELITA_TEMPO_PRODUCTION_READ_ENABLED === "true" ||
    (env.CARMELITA_TEMPO_TESTNET_ENABLED === "true" &&
      (env.VERCEL_ENV === "preview" || env.CARMELITA_PREVIEW_ISOLATED === "true"));
}
