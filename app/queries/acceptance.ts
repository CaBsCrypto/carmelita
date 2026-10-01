import { createHash } from "node:crypto";
import { z } from "zod";
import manifestJson from "./acceptance-manifest.json";
import evidenceJson from "./acceptance-evidence.json";
import runtimeJson from "./acceptance-runtime.json";
import type { QueryDefinition } from "./types";

const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const safeId = z.string().regex(/^[a-z][a-z0-9_-]{2,79}$/);
const queryId = z.string().regex(/^[a-z][a-z0-9_.]{2,119}$/);
const channel = z.enum(["carmelita", "chatgpt"]);
const evidenceReference = z.object({ id: safeId, sha256: fingerprint }).strict();
const evidenceRecord = z.object({
  id: safeId,
  queryId,
  channel,
  kind: z.enum(["real_user_query", "http_diagnostic", "controlled_test"]),
  outcome: z.enum(["operational", "unavailable", "connection_required", "registration_required"]),
  observedAt: z.string().datetime(),
  implementationCommit: z.string().regex(/^[a-f0-9]{40}$/),
  deployment: z.string().regex(/^dpl_[A-Za-z0-9]{5,80}$/),
  environment: z.enum(["preview", "production"]),
  // A reviewed tester alias correlates the channels without publishing an identity.
  testerAlias: z.string().regex(/^test_account_[0-9]{2,4}$/),
  contractFingerprint: fingerprint,
  runtimeFingerprint: fingerprint,
  checks: z.object({
    authenticatedOwnerVerified: z.boolean(),
    authorizationVerified: z.boolean(),
    ownerIsolationVerified: z.boolean(),
    identitiesWalletsAndPermissionsUnchanged: z.boolean(),
    contractAndResultSemanticsVerified: z.boolean(),
    sourceOperational: z.boolean(),
    readOnlyVerified: z.boolean(),
    discoveryVerified: z.boolean(),
  }).strict(),
}).strict();

export const acceptanceEvidenceSchema = z.object({
  schemaVersion: z.literal(1), records: z.array(evidenceRecord).max(500),
}).strict();
export const acceptanceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    queryId, contractFingerprint: fingerprint, runtimeFingerprint: fingerprint,
    channels: z.object({ carmelita: evidenceReference, chatgpt: evidenceReference }).strict(),
  }).strict()).max(100),
}).strict();
export type AcceptanceEvidenceRecord = z.infer<typeof evidenceRecord>;
export type AcceptanceManifest = z.infer<typeof acceptanceManifestSchema>;
export type AcceptanceEvidence = z.infer<typeof acceptanceEvidenceSchema>;
export type QueryAcceptance = {
  acceptance: "pending" | "accepted";
  available: boolean;
  reason: string;
  verification?: { kind: "historical"; observedAt: string; evidenceIds: readonly string[] };
};

export function canonicalAcceptanceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalAcceptanceJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalAcceptanceJson(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function acceptanceFingerprint(value: unknown) {
  return createHash("sha256").update(canonicalAcceptanceJson(value)).digest("hex");
}
export function queryContractFingerprint(query: QueryDefinition) {
  return acceptanceFingerprint({ id: query.id, toolName: query.toolName, scope: query.scope,
    dataScope: query.dataScope, requirements: query.requirements ?? [],
    inputSchema: z.toJSONSchema(query.inputSchema, { target: "draft-7", io: "input" }),
  });
}

/** Groups deliberately invalidate conservatively when any shared dependency changes. */
export function queryAcceptanceGroup(id: string): keyof typeof runtimeJson.groups {
  if (["offchain.market.search", "offchain.market.quote", "offchain.defillama.chains"].includes(id)) return "market";
  if (id.startsWith("personal.")) return "personal";
  if (["offchain.capabilities.list", "offchain.capabilities.get", "avalanche.capabilities.list", "avalanche.docs.tools"].includes(id)) return "metadata";
  if (["stellar.soroswap.quote", "offchain.mpp.catalog", "offchain.infrastructure.status", "stellar.defindex.position.read", "circle.cctp.fees.read", "circle.cctp.readiness.read"].includes(id)) return "discovery";
  return "ecosystem";
}
export function queryRuntimeFingerprint(query: Pick<QueryDefinition, "id">) {
  return runtimeJson.groups[queryAcceptanceGroup(query.id)];
}

/** Historical acceptance is distinct from a current source failure or missing user connection. */
export function evaluateQueryAcceptance(query: QueryDefinition, options: {
  manifest?: unknown; evidence?: unknown; runtimeFingerprint?: string; now?: number;
  providerKnownUnavailable?: boolean; currentSourceUnavailable?: boolean; userConnectionMissing?: boolean;
} = {}): QueryAcceptance {
  const pending = (reason: string): QueryAcceptance => ({ acceptance: "pending", available: false, reason });
  const parsedManifest = acceptanceManifestSchema.safeParse(options.manifest ?? manifestJson);
  const parsedEvidence = acceptanceEvidenceSchema.safeParse(options.evidence ?? evidenceJson);
  if (!parsedManifest.success || !parsedEvidence.success) return pending("invalid_acceptance_artifacts");
  const entries = parsedManifest.data.entries.filter(entry => entry.queryId === query.id);
  if (entries.length !== 1) return pending(entries.length ? "duplicate_acceptance" : "real_channel_acceptance_missing");
  const entry = entries[0];
  const currentContract = queryContractFingerprint(query);
  const currentRuntime = options.runtimeFingerprint ?? queryRuntimeFingerprint(query);
  if (entry.contractFingerprint !== currentContract || entry.runtimeFingerprint !== currentRuntime) return pending("implementation_fingerprint_changed");
  const records: AcceptanceEvidenceRecord[] = [];
  for (const name of ["carmelita", "chatgpt"] as const) {
    const reference = entry.channels[name];
    const matches = parsedEvidence.data.records.filter(record => record.id === reference.id);
    if (matches.length !== 1 || acceptanceFingerprint(matches[0]) !== reference.sha256) return pending("acceptance_evidence_mismatch");
    const record = matches[0];
    if (record.queryId !== query.id || record.channel !== name || record.kind !== "real_user_query") return pending("real_channel_acceptance_missing");
    if (record.outcome !== "operational" || !record.checks.sourceOperational) return pending("operational_integration_unverified");
    if (record.contractFingerprint !== currentContract || record.runtimeFingerprint !== currentRuntime) return pending("implementation_fingerprint_changed");
    if (Date.parse(record.observedAt) > (options.now ?? Date.now()) + 300_000) return pending("acceptance_date_invalid");
    const { discoveryVerified, ...requiredChecks } = record.checks;
    if (!Object.values(requiredChecks).every(Boolean) || (name === "chatgpt" && !discoveryVerified)) return pending("acceptance_controls_incomplete");
    records.push(record);
  }
  if (records[0].testerAlias !== records[1].testerAlias) return pending("channel_owner_not_correlated");
  const blocked = options.providerKnownUnavailable || options.currentSourceUnavailable || options.userConnectionMissing;
  return { acceptance: "accepted", available: !blocked, reason: blocked ? "current_prerequisite_unavailable" : "both_channels_operationally_verified",
    verification: { kind: "historical", observedAt: records.map(record => record.observedAt).sort().at(-1)!, evidenceIds: records.map(record => record.id) },
  };
}

/** CI gate: malformed, synthetic, stale-contract or non-operational entries cannot be certified. */
export function validateQueryAcceptanceArtifacts(queries: readonly QueryDefinition[], manifestInput: unknown = manifestJson, evidenceInput: unknown = evidenceJson) {
  const manifest = acceptanceManifestSchema.parse(manifestInput);
  const evidence = acceptanceEvidenceSchema.parse(evidenceInput);
  if (new Set(manifest.entries.map(entry => entry.queryId)).size !== manifest.entries.length) throw new Error("duplicate_query_acceptance");
  if (new Set(evidence.records.map(record => record.id)).size !== evidence.records.length) throw new Error("duplicate_acceptance_evidence");
  for (const entry of manifest.entries) {
    const query = queries.find(query => query.id === entry.queryId);
    if (!query) throw new Error("unknown_acceptance_query");
    const result = evaluateQueryAcceptance(query, { manifest, evidence, providerKnownUnavailable: query.id === "avalanche.nft.floor_read" });
    if (result.acceptance !== "accepted" || !result.available) throw new Error(`unverified_query_acceptance:${result.reason}`);
  }
  return { manifest, evidence };
}
