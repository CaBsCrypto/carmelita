import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assertPreviewIsolation, requiresPreviewDatabaseIsolation } from "../app/preview-isolation";
import * as schema from "./schema";

/**
 * Vercel Marketplace prefixes integration variables. The project's original
 * prefix was DATABASE_URL, so Neon's DATABASE_URL is exposed as
 * DATABASE_URL_DATABASE_URL. Keep the standard name first for portability.
 */
export function getDatabaseUrl() {
  if (requiresPreviewDatabaseIsolation()) {
    return assertPreviewIsolation().databaseUrl;
  }
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED
  );
}

export function hasDatabase() {
  return Boolean(getDatabaseUrl());
}

export function getDb() {
  const url = getDatabaseUrl();
  if (!url) throw new Error("database_not_configured");
  return drizzle(neon(url), { schema });
}
