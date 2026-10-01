/** Only a configured HTTPS origin may be used for a visible continuation link. */
export function agentContinuationUrl() {
  try {
    const origin = new URL(process.env.CARMELITA_PUBLIC_ORIGIN ?? "https://carmelita.browns.studio");
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("invalid_public_origin");
    return origin.origin + "/agent";
  } catch { return "https://carmelita.browns.studio/agent"; }
}
