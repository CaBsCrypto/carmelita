export const STELLAR_BAZAAR_DEFAULT_BASE_URL =
  "https://stellar-bazaar-x402.vercel.app";

export const STELLAR_BAZAAR_PROVIDER_ALLOWLIST: readonly string[] = [
  "https://website-intelligence-provider.vercel.app",
];

function parsedHttpsOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getStellarBazaarConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const override = env.STELLAR_BAZAAR_BASE_URL ?? "";
  const candidate = parsedHttpsOrigin(override);
  const baseUrl = candidate === STELLAR_BAZAAR_DEFAULT_BASE_URL ? candidate : null;
  const enabled = env.STELLAR_BAZAAR_DISCOVERY_ENABLED === "true" && baseUrl !== null;
  return {
    enabled,
    baseUrl: baseUrl ?? null,
    reason: !enabled ? "stellar_bazaar_config_required" : null,
  } as const;
}

export function assertStellarBazaarProviderUrl(url: string): URL {
  const parsed = parsedHttpsOrigin(new URL(url).origin);
  if (!parsed || !STELLAR_BAZAAR_PROVIDER_ALLOWLIST.includes(parsed)) {
    throw new Error("stellar_bazaar_provider_not_allowed");
  }
  return new URL(url);
}

export function isAllowedStellarBazaarProviderUrl(url: string) {
  try {
    assertStellarBazaarProviderUrl(url);
    return true;
  } catch {
    return false;
  }
}
