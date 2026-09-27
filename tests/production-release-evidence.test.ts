import assert from "node:assert/strict";
import test from "node:test";
import { buildReleaseEvidence } from "../scripts/production-release-evidence";
import { validateReleaseEvidence } from "../scripts/production-migrate";

const fingerprint = "a".repeat(64), commit = "b".repeat(40), maintenance = "c".repeat(40);
const base = { databaseFingerprint: fingerprint, commit, maintenanceCommit: maintenance, backupId: "br_fixture", restoreVerified: true, rollbackCompatible: true };

test("builder output round-trips through the migration validator", () => {
  const application = buildReleaseEvidence({ ...base, maintenanceMode: "application" });
  assert.equal(validateReleaseEvidence(application, fingerprint, commit), application);
  assert.equal(application.maintenanceMode, "application");
  assert.equal(application.firewallRuleId, undefined);
  const firewall = buildReleaseEvidence({ ...base, maintenanceMode: "firewall", firewallRuleId: "rule_fixture", maintenanceDeploymentId: "dpl_fixture" });
  assert.equal(validateReleaseEvidence(firewall, fingerprint, commit), firewall);
  assert.equal(firewall.firewallRuleId, "rule_fixture");
  assert.ok(Date.now() - Date.parse(String(firewall.verifiedAt)) < 60000);
});

test("builder rejects malformed evidence before the window", () => {
  assert.throws(() => buildReleaseEvidence({ ...base, databaseFingerprint: "short" }), /release_evidence_fingerprint/);
  assert.throws(() => buildReleaseEvidence({ ...base, commit: "deadbeef" }), /release_evidence_commit/);
  assert.throws(() => buildReleaseEvidence({ ...base, backupId: "  " }), /release_evidence_backup/);
  assert.throws(() => buildReleaseEvidence({ ...base, maintenanceMode: "firewall", firewallRuleId: "bad", maintenanceDeploymentId: "dpl_fixture" }), /production_migration_/);
  assert.throws(() => buildReleaseEvidence({ ...base, maintenanceMode: "firewall", firewallRuleId: "rule_ok", maintenanceDeploymentId: "" }), /production_migration_/);
  assert.throws(() => buildReleaseEvidence({ ...base, maintenanceMode: "application", restoreVerified: false }), /production_migration_/);
});
