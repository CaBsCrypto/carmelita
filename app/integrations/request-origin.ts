/** Same-origin cookie mutations; forwarded headers are deliberately not trusted. */
export function hasSameProposalOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const suppliedOrigin = new URL(origin);
    const requestUrl = new URL(request.url);
    if (!["http:", "https:"].includes(requestUrl.protocol)) return false;
    const host = request.headers.get("host");
    if (!host) return suppliedOrigin.origin === requestUrl.origin;
    if (/[\\/?#@\s,]/.test(host)) return false;
    const externalUrl = new URL(`${requestUrl.protocol}//${host}`);
    if (externalUrl.host !== requestUrl.host) {
      const normalizedLoopback = requestUrl.hostname === "localhost"
        && ["127.0.0.1", "[::1]"].includes(externalUrl.hostname)
        && requestUrl.port === externalUrl.port;
      if (!normalizedLoopback) return false;
    }
    return suppliedOrigin.origin === externalUrl.origin;
  } catch { return false; }
}
