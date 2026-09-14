import { createHash, timingSafeEqual } from "node:crypto";

export function maintenanceEnabled(env: Record<string, string | undefined> = process.env) {
  return env.CARMELITA_MAINTENANCE_ENABLED === "true";
}

/** Operational credentials never grant application authorization. */
export function maintenanceBypass(supplied: string | null, env: Record<string, string | undefined> = process.env) {
  const expected = env.CARMELITA_MAINTENANCE_ACCESS_TOKEN;
  if (!supplied || !expected || expected.length < 32 || supplied.length > 512) return false;
  return timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest());
}

export function maintenancePublicRead(path: string, method: string) {
  return ["GET", "HEAD"].includes(method) &&
    (path === "/api/health" || path === "/maintenance" || path.startsWith("/_next/static/"));
}
