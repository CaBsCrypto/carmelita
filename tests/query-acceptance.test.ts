import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { acceptanceFingerprint, evaluateQueryAcceptance, queryAcceptanceGroup, queryContractFingerprint,
  queryRuntimeFingerprint, validateQueryAcceptanceArtifacts, type AcceptanceEvidenceRecord } from "../app/queries/acceptance";
import { buildAcceptanceRuntimeFingerprints } from "../app/queries/acceptance-source-fingerprint";
import { listReadQueries, readQueryDefinitions } from "../app/queries/registry";
import { listGatewayCapabilities } from "../app/agent-gateway/catalog";
import { marketQueries } from "../app/queries/market";
import { personalQueries } from "../app/queries/personal";
import { ecosystemQueries } from "../app/queries/ecosystem";
import { discoveryQueries } from "../app/queries/discovery";
import { metadataQueries } from "../app/queries/metadata";
import { commerceQueries } from "../app/queries/commerce";

const root = fileURLToPath(new URL("../", import.meta.url));
const quote = readQueryDefinitions.find(query => query.id === "offchain.market.quote")!;
const now = Date.parse("2026-10-01T09:00:00.000Z");
function fixtures(records?: AcceptanceEvidenceRecord[]) {
  const contractFingerprint = queryContractFingerprint(quote);
  const runtimeFingerprint = queryRuntimeFingerprint(quote);
  const evidenceRecords = records ?? (["carmelita", "chatgpt"] as const).map(channel => ({
    id: `fixture_quote_${channel}`, queryId: quote.id, channel, kind: "real_user_query" as const,
    outcome: "operational" as const, observedAt: "2026-10-01T08:00:00.000Z",
    implementationCommit: "a".repeat(40), deployment: "dpl_fixtureAcceptOnly", environment: "preview" as const,
    testerAlias: "test_account_01", contractFingerprint, runtimeFingerprint,
    checks: { authenticatedOwnerVerified: true, authorizationVerified: true, ownerIsolationVerified: true,
      identitiesWalletsAndPermissionsUnchanged: true, contractAndResultSemanticsVerified: true,
      sourceOperational: true, readOnlyVerified: true, discoveryVerified: true },
  }));
  return { manifest: { schemaVersion: 1, entries: [{ queryId: quote.id, contractFingerprint, runtimeFingerprint,
    channels: Object.fromEntries(evidenceRecords.map(record => [record.channel, { id: record.id, sha256: acceptanceFingerprint(record) }])) }] },
    evidence: { schemaVersion: 1, records: evidenceRecords }, now };
}

test("committed registry and catalog derive acceptance only from validated current artifacts", () => {
  validateQueryAcceptanceArtifacts(readQueryDefinitions);
  for (const query of listReadQueries()) {
    const definition = readQueryDefinitions.find(definition => definition.id === query.id)!;
    const expected = evaluateQueryAcceptance(definition, { providerKnownUnavailable: query.id === "avalanche.nft.floor_read" });
    assert.equal(query.acceptance, expected.acceptance);
    assert.deepEqual(query.acceptanceVerification, expected.verification);
  }
  for (const capability of listGatewayCapabilities().filter(capability => capability.operation === "read")) {
    const queries = readQueryDefinitions.filter(query => capability.readTools?.includes(query.toolName));
    assert.ok(queries.length);
    const expected = queries.map(query => evaluateQueryAcceptance(query, { providerKnownUnavailable: query.id === "avalanche.nft.floor_read" }));
    const accepted = expected.every(query => query.acceptance === "accepted");
    assert.equal(capability.availability?.acceptance, accepted ? "accepted" : "pending");
    assert.equal(capability.availability?.available, expected.every(query => query.available));
    if (capability.availability?.provider === "verified") {
      assert.equal(accepted, true);
      assert.equal(capability.availability.verification?.kind, "historical");
      assert.ok(capability.availability.verification.evidenceIds.length >= 2);
    }
  }
});

test("real observations in both channels bind accepted metadata to the same runtime and contract, with historical evidence", () => {
  const proof = fixtures();
  const result = evaluateQueryAcceptance(quote, proof);
  assert.equal(result.acceptance, "accepted");
  assert.equal(result.available, true);
  assert.deepEqual(result.verification, { kind: "historical", observedAt: "2026-10-01T08:00:00.000Z",
    evidenceIds: ["fixture_quote_carmelita", "fixture_quote_chatgpt"] });
  // Commit identity alone is not equivalence: the checked execution/contract fingerprints establish it.
  assert.equal(evaluateQueryAcceptance(quote, { ...proof, runtimeFingerprint: "b".repeat(64) }).acceptance, "pending");
  const changed = { ...quote, inputSchema: z.object({ changedInput: z.string() }).strict() };
  assert.equal(evaluateQueryAcceptance(changed, proof).acceptance, "pending");
});

test("single channel, HTTP diagnostics, fixtures and non-operational outcomes cannot certify an integration", () => {
  const base = fixtures().evidence.records;
  assert.equal(evaluateQueryAcceptance(quote, fixtures(base.slice(0, 1))).acceptance, "pending");
  for (const kind of ["http_diagnostic", "controlled_test"] as const) {
    const proof = fixtures(base.map(record => ({ ...record, kind })));
    assert.equal(evaluateQueryAcceptance(quote, proof).acceptance, "pending");
    assert.throws(() => validateQueryAcceptanceArtifacts([quote], proof.manifest, proof.evidence), /unverified_query_acceptance/);
  }
  for (const outcome of ["unavailable", "connection_required", "registration_required"] as const) {
    const proof = fixtures(base.map(record => ({ ...record, outcome })));
    assert.equal(evaluateQueryAcceptance(quote, proof).acceptance, "pending");
    assert.throws(() => validateQueryAcceptanceArtifacts([quote], proof.manifest, proof.evidence), /unverified_query_acceptance/);
  }
});

test("current provider failure or missing connection overrides availability without claiming acceptance never occurred", () => {
  for (const blocker of ["providerKnownUnavailable", "currentSourceUnavailable", "userConnectionMissing"] as const) {
    const result = evaluateQueryAcceptance(quote, { ...fixtures(), [blocker]: true });
    assert.equal(result.acceptance, "accepted");
    assert.equal(result.available, false);
    assert.equal(result.verification?.kind, "historical");
  }
});

test("acceptance rejects digest drift, mismatched owners, future dates, missing controls and stale evidence", () => {
  const base = fixtures().evidence.records;
  const changedRecord = fixtures();
  changedRecord.evidence.records[0].checks.authorizationVerified = false;
  assert.equal(evaluateQueryAcceptance(quote, changedRecord).reason, "acceptance_evidence_mismatch");
  for (const records of [
    base.map((record, index) => ({ ...record, testerAlias: index ? "test_account_02" : "test_account_01" })),
    base.map(record => ({ ...record, observedAt: "2099-01-01T00:00:00.000Z" })),
    base.map(record => ({ ...record, runtimeFingerprint: "b".repeat(64) })),
    base.map(record => ({ ...record, checks: { ...record.checks, sourceOperational: false } })),
    base.map(record => ({ ...record, checks: { ...record.checks, identitiesWalletsAndPermissionsUnchanged: false } })),
    base.map(record => ({ ...record, checks: { ...record.checks, discoveryVerified: false } })),
  ]) assert.equal(evaluateQueryAcceptance(quote, fixtures(records)).acceptance, "pending");
});

test("CI gate rejects unknown queries, duplicate evidence, private identities and credential fields", () => {
  const proof = fixtures();
  validateQueryAcceptanceArtifacts([quote], proof.manifest, proof.evidence);
  assert.throws(() => validateQueryAcceptanceArtifacts([], proof.manifest, proof.evidence), /unknown_acceptance_query/);
  assert.throws(() => validateQueryAcceptanceArtifacts([quote], { ...proof.manifest, entries: [...proof.manifest.entries, ...proof.manifest.entries] }, proof.evidence), /duplicate_query_acceptance/);
  assert.throws(() => validateQueryAcceptanceArtifacts([quote], proof.manifest, { ...proof.evidence, records: [...proof.evidence.records, proof.evidence.records[0]] }), /duplicate_acceptance_evidence/);
  for (const extra of [{ token: "secret" }, { email: "private@example.test" }, { userId: "did:privy:private" }, { accessToken: "secret" }]) {
    const records = proof.evidence.records.map(record => ({ ...record, ...extra }));
    assert.throws(() => validateQueryAcceptanceArtifacts([quote], proof.manifest, { ...proof.evidence, records }));
  }
});

test("CI checks current execution fingerprints and the exact grouping of all registered query definitions", () => {
  for (const [group, queries] of Object.entries({ market: marketQueries, personal: personalQueries,
    ecosystem: ecosystemQueries, discovery: discoveryQueries, metadata: metadataQueries, commerce: commerceQueries })) {
    for (const query of queries) {
      assert.equal(queryAcceptanceGroup(query.id), group, query.id);
      assert.match(queryContractFingerprint(query), /^[a-f0-9]{64}$/);
    }
  }
  const expected = JSON.parse(readFileSync(path.join(root, "app/queries/acceptance-runtime.json"), "utf8"));
  const actual = buildAcceptanceRuntimeFingerprints(root);
  assert.deepEqual(actual.groups, expected.groups, "Execution changed: refresh runtime fingerprints and revalidate affected real acceptance; never copy a commit identity as proof.");
  assert.ok(actual.sources.personal?.includes("app/queries/personal-store.ts"));
  assert.ok(!actual.sources.market?.includes("app/queries/personal-store.ts"), "history-only changes must not fabricate a change in the market execution");
  assert.ok(actual.sources.metadata?.includes("app/queries/acceptance.ts"));
  assert.ok(actual.sources.commerce?.includes("app/queries/commerce.ts"));
  assert.ok(actual.sources.commerce?.includes("app/commerce-catalog-read.ts"));
  assert.ok(actual.sources.commerce?.includes("app/services/public-offer-read-store.ts"));
  assert.ok(!actual.sources.market?.includes("app/queries/commerce.ts"), "a separate catalog query must not silently become part of market execution");
});
