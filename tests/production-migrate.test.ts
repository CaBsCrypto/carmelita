import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { productionMigrationConfig, validateReleaseEvidence } from "../scripts/production-migrate";

const commit = "a".repeat(40);
const fingerprint = createHash("sha256").update("db.example.test/carmelita").digest("hex");
const env = { VERCEL_ENV: "production", CARMELITA_RELEASE_COMMIT: commit, DATABASE_URL: "postgresql://fixture:fixture@db-pooler.example.test/carmelita?sslmode=require", DATABASE_URL_UNPOOLED: "postgresql://fixture:fixture@db.example.test/carmelita?sslmode=require", CARMELITA_PRODUCTION_DATABASE_FINGERPRINT: fingerprint, CARMELITA_QA_DATABASE_FINGERPRINT: "b".repeat(64) };
test("production migration binds runtime and unpooled connection to exact resource and commit", () => {
  assert.equal(productionMigrationConfig(env, commit).fingerprint, fingerprint);
  for (const override of [
    { VERCEL_ENV: "preview" }, { CARMELITA_RELEASE_COMMIT: "b".repeat(40) },
    { CARMELITA_PREVIEW_DATABASE_URL: "" }, { CARMELITA_QA_DATABASE_FINGERPRINT: fingerprint },
    { DATABASE_URL_UNPOOLED: env.DATABASE_URL },
    { DATABASE_URL_UNPOOLED: env.DATABASE_URL_UNPOOLED.replace("fixture:fixture", "fixture:other") },
    { DATABASE_URL: env.DATABASE_URL + "&host=other.invalid" },
    { DATABASE_URL: env.DATABASE_URL.replace("sslmode=require", "sslmode=disable") },
    { CARMELITA_PRODUCTION_DATABASE_FINGERPRINT: "b".repeat(64) },
  ]) assert.throws(() => productionMigrationConfig({ ...env, ...override }, commit), /production_migration_/);
});
test("applying requires fresh backup restoration and compatible rollback evidence for this resource and commit", () => {
  const now = Date.now();
  const evidence = { databaseFingerprint: fingerprint, commit, maintenanceCommit: "c".repeat(40), backupId: "fixture-backup", restoreVerified: true, rollbackCompatible: true, verifiedAt: new Date(now).toISOString() };
  assert.equal(validateReleaseEvidence(evidence, fingerprint, commit, now), evidence);
  for (const override of [{ backupId: "" }, { restoreVerified: false }, { rollbackCompatible: false }, { databaseFingerprint: "other" }, { commit: "other" }, { verifiedAt: new Date(now - 3600001).toISOString() }, { verifiedAt: new Date(now + 1).toISOString() }]) assert.throws(() => validateReleaseEvidence({ ...evidence, ...override }, fingerprint, commit, now), /production_migration_/);
  assert.throws(() => validateReleaseEvidence({ ...evidence, maintenanceMode: "firewall" }, fingerprint, commit, now));
  assert.throws(() => validateReleaseEvidence({ ...evidence, maintenanceMode: "ignore" }, fingerprint, commit, now));
  const firewall = { ...evidence, maintenanceMode: "firewall", firewallRuleId: "rule_fixture", maintenanceDeploymentId: "dpl_fixture" };
  assert.equal(validateReleaseEvidence(firewall, fingerprint, commit, now), firewall);
});
