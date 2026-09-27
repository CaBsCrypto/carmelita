import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateReleaseEvidence } from "./production-migrate";

type Environment = Record<string, string | undefined>;

export function buildReleaseEvidence(input: {
  databaseFingerprint: string;
  commit: string;
  maintenanceCommit: string;
  backupId: string;
  restoreVerified: boolean;
  rollbackCompatible: boolean;
  maintenanceMode: "application" | "firewall";
  firewallRuleId?: string;
  maintenanceDeploymentId?: string;
  verifiedAt?: string;
}) {
  if (!/^[a-f0-9]{64}$/.test(input.databaseFingerprint)) throw new Error("release_evidence_fingerprint");
  for (const value of [input.commit, input.maintenanceCommit]) if (!/^[a-f0-9]{40}$/.test(value)) throw new Error("release_evidence_commit");
  if (!input.backupId.trim()) throw new Error("release_evidence_backup");
  const evidence: Record<string, unknown> = {
    databaseFingerprint: input.databaseFingerprint,
    commit: input.commit,
    maintenanceCommit: input.maintenanceCommit,
    backupId: input.backupId.trim(),
    restoreVerified: input.restoreVerified,
    rollbackCompatible: input.rollbackCompatible,
    verifiedAt: input.verifiedAt ?? new Date().toISOString(),
  };
  if (input.maintenanceMode === "firewall") {
    evidence.maintenanceMode = "firewall";
    evidence.firewallRuleId = input.firewallRuleId;
    evidence.maintenanceDeploymentId = input.maintenanceDeploymentId;
  } else evidence.maintenanceMode = "application";
  return validateReleaseEvidence(evidence, input.databaseFingerprint, input.commit);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env: Environment = process.env;
  const args = new Map(process.argv.slice(2).map(pair => {
    const [flag, ...rest] = pair.replace(/^--/, "").split("=");
    return [flag, rest.join("=")] as const;
  }));
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    const releaseCommit = args.get("commit") ?? head;
    const mode = args.get("mode") === "firewall" ? "firewall" : "application";
    const evidence = buildReleaseEvidence({
      databaseFingerprint: env.CARMELITA_PRODUCTION_DATABASE_FINGERPRINT ?? "",
      commit: releaseCommit,
      maintenanceCommit: args.get("maintenance-commit") ?? releaseCommit,
      backupId: args.get("backup") ?? "",
      restoreVerified: args.get("restore-verified") === "true",
      rollbackCompatible: args.get("rollback-compatible") === "true",
      maintenanceMode: mode,
      firewallRuleId: args.get("rule"),
      maintenanceDeploymentId: args.get("deployment"),
    });
    const out = args.get("out") ?? "";
    if (!/^work[\\/]/.test(out)) throw new Error("release_evidence_output_must_live_under_work");
    writeFileSync(resolve(out), JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify({ written: out, mode, verifiedAt: evidence.verifiedAt, backupId: evidence.backupId }));
  } catch (error: unknown) {
    console.error(error instanceof Error && /^(release_evidence|production_migration)_[a-z_]+$/.test(error.message) ? error.message : "release_evidence_failed");
    process.exitCode = 1;
  }
}
