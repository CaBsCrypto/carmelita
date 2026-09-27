import { defineConfig } from "drizzle-kit";

import { assertPreviewIsolation, requiresPreviewDatabaseIsolation } from "./app/preview-isolation";

const databaseUrl = requiresPreviewDatabaseIsolation()
  ? assertPreviewIsolation().migrationDatabaseUrl
  : process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.DATABASE_URL_DATABASE_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/agente_asistente";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
