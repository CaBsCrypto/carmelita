import assert from "node:assert/strict";
import test from "node:test";
import { Keypair } from "@stellar/stellar-sdk";
import { buildStellarDuplicateCleanup } from "../scripts/stellar-duplicate-cleanup";

test("cleanup only renders an exact identity with rollback and full row comparison", () => {
  const input = { userId: "did:privy:fixture", keepId: "keep", removeId: "remove", keepAddress: Keypair.random().publicKey(),removeAddress: Keypair.random().publicKey(),expectedPublicTables:40 };
  const sql = buildStellarDuplicateCleanup(input);
  assert.ok(sql.endsWith("ROLLBACK;"));
  assert.match(sql,/cleanup_unexpected_reference/);
  assert.match(sql,/cleanup_unexpected_data_change/);
  assert.match(sql,/affected<>1/);
  assert.equal((sql.match(/DELETE FROM/g) ?? []).length,1);
  assert.doesNotMatch(sql,/DELETE FROM public.agent_activities/);
  assert.throws(()=>buildStellarDuplicateCleanup({...input,removeId:input.keepId}),/invalid_identity/);
  assert.throws(()=>buildStellarDuplicateCleanup({...input,userId:"'; DELETE"}),/invalid_identity/);
  assert.throws(()=>buildStellarDuplicateCleanup({...input,expectedPublicTables:NaN}),/invalid_identity/);
});
