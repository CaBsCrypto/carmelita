import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyProductionDatabase } from "../app/production-database-verification";

const direct = "postgresql://fixture:private@db.example.test/carmelita?sslmode=require";
const runtime = direct.replace("@db.", "@db-pooler.");
const fingerprint = createHash("sha256").update("db.example.test/carmelita").digest("hex");
const env = { VERCEL_ENV: "production", CARMELITA_MAINTENANCE_ENABLED: "true", DATABASE_URL_UNPOOLED: direct,
  CARMELITA_PRODUCTION_DATABASE_FINGERPRINT: fingerprint, CARMELITA_QA_DATABASE_FINGERPRINT: "a".repeat(64) };
const row = { database_name: "carmelita", role_name: "fixture" };

test("maintenance probe verifies both runtime and migration connections without returning credentials", async () => {
  const seen: string[] = [];
  const result = await verifyProductionDatabase(runtime, env, async url => { seen.push(url); return [row]; });
  assert.deepEqual(seen, [runtime, direct]);
  assert.deepEqual(result, { verified: true, databaseFingerprint: fingerprint });
  assert.doesNotMatch(JSON.stringify(result), /private|fixture|postgres/);
});

test("invalid scope, resource, override or TLS configuration fails before a database query", async () => {
  const cases = [
    { VERCEL_ENV: "preview" }, { CARMELITA_MAINTENANCE_ENABLED: "false" },
    { CARMELITA_PREVIEW_DATABASE_URL: "" }, { CARMELITA_QA_DATABASE_FINGERPRINT: fingerprint },
    { CARMELITA_QA_DATABASE_FINGERPRINT: "" }, { CARMELITA_PRODUCTION_DATABASE_FINGERPRINT: "b".repeat(64) },
    { DATABASE_URL_UNPOOLED: runtime }, { DATABASE_URL_UNPOOLED: direct.replace("fixture", "other") },
    { DATABASE_URL_UNPOOLED: direct.replace("private", "other") },
    { DATABASE_URL_UNPOOLED: direct.replace("require", "disable") },
    { DATABASE_URL_UNPOOLED: direct + "&host=evil.test" },
    { DATABASE_URL_UNPOOLED: direct + "&sslmode=require" },
  ];
  for (const patch of cases) await assert.rejects(verifyProductionDatabase(runtime, { ...env, ...patch }, async () => {
    assert.fail("must not query invalid configuration");
  }), /^Error: production_database_not_verified$/);
  for (const url of [undefined, "bad", runtime.replace("db-pooler", "other"), runtime.replace("require", "disable")]) {
    await assert.rejects(verifyProductionDatabase(url, env, async () => { assert.fail("must not query"); }), /production_database_not_verified/);
  }
});

test("wrong observed database or role, unavailable database and raw driver errors fail closed", async () => {
  for (const rows of [[], [row, row], [{ ...row, database_name: "qa" }], [{ ...row, role_name: "other" }]]) {
    await assert.rejects(verifyProductionDatabase(runtime, env, async () => rows), /^Error: production_database_not_verified$/);
  }
  let calls = 0;
  await assert.rejects(verifyProductionDatabase(runtime, env, async () => {
    if (++calls === 1) return [row];
    throw new Error(`secret ${direct}`);
  }), /^Error: production_database_not_verified$/);
  assert.equal(calls, 2);
});
