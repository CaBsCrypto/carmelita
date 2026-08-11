const base = process.argv[2]?.replace(/\/$/, "");
if (!base) throw new Error("usage: tsx scripts/oauth-gateway-preview-smoke.mts <preview-url>");
const previewOrigin = new URL(base);
if (previewOrigin.protocol !== "https:") throw new Error("preview_url_must_use_https");

async function check(path: string) {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    headers: { "User-Agent": "Carmelita-OAuth-Gateway-Smoke/1.0" },
  });
  return {
    path,
    status: response.status,
    contentType: response.headers.get("content-type")?.split(";")[0] || null,
    cacheControl: response.headers.get("cache-control") || null,
    redirected: response.status >= 300 && response.status < 400,
  };
}

const home = await check("/");
const consent = await check("/oauth/authorize");
const metadata = await check("/.well-known/oauth-protected-resource");
const protectionStatuses = new Set([302, 401, 403]);
const protectedByVercel = [home, consent, metadata].every((item) => protectionStatuses.has(item.status));
const disabledSafe = metadata.status === 404;
const ok = protectedByVercel || (home.status === 200 && consent.status === 200 && disabledSafe);

console.log(JSON.stringify({
  ok,
  deploymentProtection: protectedByVercel ? "enabled" : "not-detected",
  oauthMode: disabledSafe ? "disabled-safe" : protectedByVercel ? "verify-with-vercel-curl" : "unexpected",
  checks: [home, consent, metadata],
}, null, 2));

if (!ok) process.exitCode = 1;
