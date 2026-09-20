import assert from "node:assert/strict";
import test from "node:test";
import { buildX402EventsReconciliation } from "../scripts/reconcile-x402-events";

test("reconciliation defaults to rollback and guards schema and content before journaling", () => {
  const sql = buildX402EventsReconciliation();
  assert.ok(sql.endsWith("ROLLBACK;"));
  assert.ok(sql.indexOf("reconciliation_index_drift") < sql.indexOf("INSERT INTO drizzle"));
  assert.match(sql, /reconciliation_journal_drift/);
  assert.match(sql, /reconciliation_content_changed/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|CREATE TABLE public/);
  assert.ok(buildX402EventsReconciliation("apply").endsWith("COMMIT;"));
});
