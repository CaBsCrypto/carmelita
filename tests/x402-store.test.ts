import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildClaimX402Execution, buildSaveX402Delivery, buildSaveX402Reconciliation,
  claimX402Execution, markX402Uncertain, saveX402Delivery, saveX402Reconciliation, saveX402Settlement,
  type X402StoreDependencies, type X402StoreStatement,
} from "../app/x402/store";
import { buildX402StoreSqlFixtures, fixtureDelivery, fixtureExecution, fixtureOutcome, fixtureOwner, fixtureOtherOwner } from "./x402-store-sql-fixtures";
import { quoteX402FixtureSchema, runX402StoreSqlAcceptance, x402FixtureCleanup } from "../scripts/x402-store-sql-acceptance";

const target = { paymentId: "fixture-payment", userId: fixtureOwner };
const neverQuery: X402StoreDependencies = { query: async () => assert.fail("Invalid input must fail before a database request") };

test("execution evidence preserves the entire signed payload and accepts the full signed Int64 nonce range", () => {
  for (const nonce of ["0", "-1", "9223372036854775807", "-9223372036854775808"]) {
    const statement = buildClaimX402Execution({ ...target, execution: { ...fixtureExecution, nonce } });
    assert.deepEqual(JSON.parse(statement.parameters[2] as string), { ...fixtureExecution, nonce });
  }
  for (const nonce of ["9223372036854775808", "-9223372036854775809", "1.5", "not-a-nonce"]) {
    assert.throws(() => buildClaimX402Execution({ ...target, execution: { ...fixtureExecution, nonce } }), /invalid_execution_evidence/);
  }
});

test("corrupt or empty delivery is rejected before persistence", () => {
  const result = fixtureDelivery();
  for (const changed of [
    { resourceBody: "altered" }, { resourceSha256: "0".repeat(64) }, { resourcePreview: "unrelated preview" },
    { resourceStatus: 402 }, { resourceStatus: 500 }, fixtureDelivery(""),
  ]) assert.throws(() => saveX402Delivery({ ...target, result: { ...result, ...changed } }, neverQuery), /delivery_integrity_mismatch/);
});

test("settlement headers are durable claims and cannot inject server delivery proof", async () => {
  let captured: X402StoreStatement | undefined;
  const result = await saveX402Settlement({ ...target, settlement: { transaction: "C".repeat(64), success: true, resourceEvidence: { sha256: "forged" } } }, {
    query: async value => { captured = value; return [{ id: target.paymentId }]; },
  });
  assert.equal(result, true);
  assert.deepEqual(JSON.parse(captured!.parameters[2] as string), { transaction: "c".repeat(64), success: true });
  assert.doesNotMatch(captured!.text.split("WHERE id", 1)[0], /transaction_hash\s*=/);
});

test("receipt and RPC hashes are stored canonically regardless of hexadecimal casing", () => {
  const originalHash = fixtureOutcome.transactionHash!;
  const delivery = fixtureDelivery();
  const deliveryStatement = buildSaveX402Delivery({ ...target, result: {
    ...delivery, settlement: { success: true, transaction: originalHash.toUpperCase() },
  } });
  assert.equal(JSON.parse(deliveryStatement.parameters[2] as string).transaction, originalHash.toLowerCase());
  for (const transactionHash of [originalHash.toLowerCase(), originalHash.toUpperCase()]) {
    const verification = { ...fixtureOutcome.verification!, transactionHash: originalHash.toUpperCase() };
    const statement = buildSaveX402Reconciliation({ ...target, outcome: { ...fixtureOutcome, transactionHash, verification } });
    assert.equal(statement.parameters[2], originalHash.toLowerCase());
    assert.equal(JSON.parse(statement.parameters[3] as string).transactionHash, originalHash.toLowerCase());
    assert.equal(verification.transactionHash, originalHash.toUpperCase());
  }
});

test("delivery persistence retains contradictory receipt claims instead of silently repairing them", () => {
  const delivery = fixtureDelivery();
  for (const settlement of [
    { success: false, network: fixtureExecution.network, transaction: fixtureOutcome.transactionHash },
    { success: true, network: "stellar:wrong-network", transaction: fixtureOutcome.transactionHash },
    { success: true, network: fixtureExecution.network, transaction: fixtureOutcome.transactionHash, payer: "fixture-other-wallet" },
  ]) {
    const query = buildSaveX402Delivery({ ...target, result: { ...delivery, settlement } });
    const persisted = JSON.parse(query.parameters[2] as string);
    delete persisted.resourceEvidence;
    assert.deepEqual(persisted, settlement);
  }
  const headerless = buildSaveX402Delivery({ ...target, result: { ...delivery, settlement: null } });
  assert.deepEqual(Object.keys(JSON.parse(headerless.parameters[2] as string)), ["resourceEvidence"]);
});

test("verified status requires complete matching server evidence before querying", () => {
  for (const changed of [
    { verification: undefined }, { transactionHash: "untrusted" },
    { verification: { ...fixtureOutcome.verification, transactionHash: "f".repeat(64) } },
    { verification: { ...fixtureOutcome.verification, version: "provider-success" } },
    { verification: { ...fixtureOutcome.verification, nonce: undefined } },
  ]) assert.throws(() => saveX402Reconciliation({ ...target, outcome: { ...fixtureOutcome, ...changed } }, neverQuery), /invalid_verification_evidence/);
});

test("every store write passes its owner identity and reports an unmatched row as false", async () => {
  const captured: X402StoreStatement[] = [];
  const db: X402StoreDependencies = { query: async query => { captured.push(query); return []; } };
  const other = { ...target, userId: fixtureOtherOwner };
  const results = await Promise.all([
    claimX402Execution({ ...other, execution: fixtureExecution }, db),
    saveX402Settlement({ ...other, settlement: null }, db),
    saveX402Delivery({ ...other, result: fixtureDelivery() }, db),
    saveX402Reconciliation({ ...other, outcome: fixtureOutcome }, db),
    markX402Uncertain({ ...other, reason: "x402_transport_timeout" }, db),
  ]);
  assert.deepEqual(results, [false, false, false, false, false]);
  for (const query of captured) {
    assert.deepEqual(query.parameters.slice(0, 2), [target.paymentId, fixtureOtherOwner]);
    assert.match(query.text, /WHERE id = \$1 AND user_id = \$2/);
  }
});

test("cursor updates carry the exact observed checkpoint and unsafe failure detail is not persisted", () => {
  const statement = buildSaveX402Reconciliation({ ...target, expectedCursor: "120", outcome: { status: "pending", cursor: "130", reason: "Connection error postgresql://secret@example.invalid" } });
  assert.deepEqual(statement.parameters, [target.paymentId, fixtureOwner, "130", "x402_reconciliation_pending", true, "120"]);
  assert.match(statement.text, /IS NOT DISTINCT FROM/);
  assert.throws(() => buildSaveX402Reconciliation({ ...target, outcome: { status: "pending", cursor: "x".repeat(513) } }), /invalid_reconciliation_cursor/);
});

test("migration is additive and changes only missing recovery state, not historical payment claims", async () => {
  const migration = await readFile(new URL("../drizzle/0021_x402_recovery.sql", import.meta.url), "utf8");
  assert.equal((migration.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length, 6);
  assert.match(migration, /WHERE "payment_state" IS NULL/);
  assert.match(migration, /WHEN "status" = 'prepared' THEN 'pending' ELSE 'uncertain'/);
  assert.doesNotMatch(migration, /SET "status"|DROP|UPDATE.+transaction_hash/i);
  const fixtures = await buildX402StoreSqlFixtures();
  assert.ok(fixtures.cases.some(item => item.name.includes("Historical")));
  assert.ok(fixtures.cases.some(item => item.name.includes("Stale pending")));
  assert.ok(fixtures.cases.some(item => item.expectedErrorCode === "23514"));
});

test("external SQL runner is opt-in and cleanup is limited to its marked UUID schema", async () => {
  assert.equal((await runX402StoreSqlAcceptance(false)).status, "DISABLED");
  const schema = "carmelita_x402_qa_0123456789ab4cde81230123456789ab";
  assert.equal(quoteX402FixtureSchema(schema), `"${schema}"`);
  for (const value of ["public", "drizzle", "carmelita_x402_qa_0123456789ab4cde71230123456789ab", `${schema};DROP SCHEMA public CASCADE`]) assert.throws(() => x402FixtureCleanup(value), /invalid_fixture_schema/);
  const cleanup = x402FixtureCleanup(schema);
  assert.deepEqual(cleanup[1].parameters, [schema, `carmelita-x402-store-acceptance:${schema}`]);
  assert.equal(cleanup[2].text, `DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
});

test("delivery evidence binds the exact full UTF-8 body without truncating it to the preview", () => {
  const result = fixtureDelivery("café".repeat(1500));
  const statement = buildSaveX402Delivery({ ...target, result });
  assert.equal(statement.parameters[3], result.resourceBody);
  assert.equal(statement.parameters[4], result.resourceBody.slice(0, 4000));
  const evidence = JSON.parse(statement.parameters[2] as string).resourceEvidence;
  assert.equal(evidence.sha256, result.resourceSha256);
  assert.equal(evidence.status, 200);
});
