import assert from "node:assert/strict";
import test from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
import { deleteAgentVaultRecord, updateAgentVaultRecord } from "../app/agent-memory-store";

type Row = { id: string; userId: string; status: string; updatedAt: string };

// Run the production Drizzle query builder against an isolated SQL boundary.
// Owner and ID predicates must both reach the database for every mutation.
function fixture(record: "knowledge" | "policy") {
  const table = record === "knowledge" ? "agent_knowledge_items" : "agent_policies";
  const rows: Row[] = [
    { id: "record-a", userId: "user-a", status: "active", updatedAt: "2026-01-01" },
    { id: "record-b", userId: "user-b", status: "active", updatedAt: "2026-01-01" },
  ];
  const client = Object.assign(async () => { throw new Error("unexpected_query"); }, {
    query: async (query: string, params: unknown[]) => {
      assert.match(query, new RegExp(`^(update|delete from) "${table}" `));
      assert.match(query, / returning "id"$/);
      const predicate = query.split(" where ")[1];
      assert.ok(predicate);
      const idParameter = predicate.match(/\."id" = \$(\d+)/);
      const ownerParameter = predicate.match(/\."user_id" = \$(\d+)/);
      assert.ok(idParameter, "mutation must target the requested record");
      assert.ok(ownerParameter, "mutation must be scoped to the authenticated owner");
      const matched = rows.filter((row) =>
        row.id === params[Number(idParameter[1]) - 1] &&
        row.userId === params[Number(ownerParameter[1]) - 1]);
      for (const row of matched) {
        if (query.startsWith("update ")) {
          row.status = String(params[0]);
          row.updatedAt = String(params[1]);
        } else {
          rows.splice(rows.indexOf(row), 1);
        }
      }
      return { rows: matched.map((row) => [row.id]) };
    },
  }) as unknown as NeonQueryFunction<false, false>;
  const db = drizzle(client, { schema });
  return { rows, dependencies: { ensureSchema: async () => {}, getDb: () => db } };
}

for (const record of ["knowledge", "policy"] as const) {
  test(`${record}: foreign and missing updates fail identically without changing either owner`, async () => {
    const { rows, dependencies } = fixture(record);
    const before = structuredClone(rows);
    for (const input of [
      { userId: "user-a", id: "record-b" },
      { userId: "user-b", id: "record-a" },
      { userId: "user-a", id: "missing" },
    ]) {
      await assert.rejects(updateAgentVaultRecord({ ...input, record, status: "paused" }, dependencies), {
        message: "memory_record_not_found",
      });
      assert.deepEqual(rows, before);
    }
  });

  test(`${record}: own update and same-status retry succeed without changing the other owner`, async () => {
    const { rows, dependencies } = fixture(record);
    const otherBefore = structuredClone(rows[1]);
    const input = { userId: "user-a", id: "record-a", record, status: "paused" as const };
    await updateAgentVaultRecord(input, dependencies);
    assert.equal(rows[0].status, "paused");
    assert.notEqual(rows[0].updatedAt, "2026-01-01");
    await updateAgentVaultRecord(input, dependencies);
    assert.deepEqual(rows[1], otherBefore);
  });

  test(`${record}: foreign and missing deletes fail identically without removing either owner's records`, async () => {
    const { rows, dependencies } = fixture(record);
    const before = structuredClone(rows);
    for (const input of [
      { userId: "user-a", id: "record-b" },
      { userId: "user-b", id: "record-a" },
      { userId: "user-a", id: "missing" },
    ]) {
      await assert.rejects(deleteAgentVaultRecord({ ...input, record }, dependencies), {
        message: "memory_record_not_found",
      });
      assert.deepEqual(rows, before);
    }
  });

  test(`${record}: own delete removes only the selected record and a repeated delete is not reported as success`, async () => {
    const { rows, dependencies } = fixture(record);
    const otherBefore = structuredClone(rows[1]);
    const input = { userId: "user-a", id: "record-a", record };
    await deleteAgentVaultRecord(input, dependencies);
    assert.deepEqual(rows, [otherBefore]);
    await assert.rejects(deleteAgentVaultRecord(input, dependencies), {
      message: "memory_record_not_found",
    });
    assert.deepEqual(rows, [otherBefore]);
  });
}
