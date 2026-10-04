import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Compute source hashes only. Never write app artifacts or certify human evidence.
const root = "C:/Users/MGC/Documents/ChatGPT/Carmelita";
const candidate = path.resolve(process.argv[2] ?? "");
const commit = process.argv[3];
assert.equal(process.argv.length, 4);
assert.equal(candidate.toLowerCase(), path.resolve(root, "work/pilot-readiness").toLowerCase());
assert.match(commit, /^[a-f0-9]{40}$/);
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: candidate, encoding: "utf8", windowsHide: true }).trim();
const trackedDiff = () => execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: candidate, encoding: "utf8", windowsHide: true }).trim();
assert.equal(head(), commit);
assert.equal(trackedDiff(), "", "Run the proposal only after root commits the final package/source changes");
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");
const artifacts = ["acceptance-runtime.json", "acceptance-manifest.json", "acceptance-evidence.json"];
const before = Object.fromEntries(artifacts.map(file => [file, fs.readFileSync(path.join(candidate, "app/queries", file), "utf8")]));
const { buildAcceptanceRuntimeFingerprints } = await import(pathToFileURL(path.join(candidate, "app/queries/acceptance-source-fingerprint.ts")).href);
const { acceptanceManifestSchema, acceptanceEvidenceSchema, queryAcceptanceGroup } = await import(pathToFileURL(path.join(candidate, "app/queries/acceptance.ts")).href);
const manifest = acceptanceManifestSchema.parse(JSON.parse(before["acceptance-manifest.json"]));
const evidence = acceptanceEvidenceSchema.parse(JSON.parse(before["acceptance-evidence.json"]));
const computed = buildAcceptanceRuntimeFingerprints(candidate);
const proposedRuntime = { schemaVersion: computed.schemaVersion, groups: computed.groups };
const oldRuntime = JSON.parse(before["acceptance-runtime.json"]);
const changedGroups = Object.keys(computed.groups).filter(group => computed.groups[group] !== oldRuntime.groups[group]);
const historicalRuntimeMismatch = manifest.entries.filter((entry: { queryId: string; runtimeFingerprint: string }) =>
  entry.runtimeFingerprint !== computed.groups[queryAcceptanceGroup(entry.queryId)]).map((entry: { queryId: string }) => entry.queryId);
const unchangedHashes = Object.fromEntries(artifacts.map(file => {
  const after = fs.readFileSync(path.join(candidate, "app/queries", file), "utf8");
  assert.equal(after, before[file]);
  return [file, hash(after)];
}));
assert.equal(head(), commit);
assert.equal(trackedDiff(), "");
const proposal = { utc: new Date().toISOString(), commit, mode: "source_hash_proposal_only_no_acceptance_certification",
  proposedRuntime, changedGroups, historicalRuntimeMismatch,
  historicalManifestEntryCount: manifest.entries.length, historicalEvidenceRecordCount: evidence.records.length,
  historicalArtifactsUnchanged: true, artifactHashes: unchangedHashes, currentAcceptanceCertified: false,
  rootMutationRequired: "Write proposedRuntime only to app/queries/acceptance-runtime.json after reviewing final source. Leave historical manifest and evidence bytes unchanged.",
  requiredGate: "Stale historical entries must evaluate pending/available=false until fresh actual observations in both authenticated channels; tests and public provider probes cannot replace them." };
const file = path.join(root, "work", `pilot-acceptance-runtime-proposal-${commit.slice(0,7)}-${Date.now()}.json`);
fs.writeFileSync(file, JSON.stringify(proposal, null, 2), { flag: "wx" });
console.log(JSON.stringify({ file, ...proposal }, null, 2));
