import assert from "node:assert/strict";
import test from "node:test";
import { walletPreparationEnabled, workerAuthorized } from "../app/wallets/preparation-config";

test("worker fails closed without a strong configured secret", () => {
  const request = new Request("https://example.test/api/cron/wallet-preparation");
  assert.equal(workerAuthorized(request, {}), false);
  assert.equal(workerAuthorized(request, { CRON_SECRET: "short" }), false);
  assert.equal(walletPreparationEnabled({}), false);
});
test("worker requires exact server Bearer credential", () => {
  const secret = "a".repeat(40);
  for (const authorization of ["", secret, `Bearer ${secret}x`, `Basic ${secret}`]) {
    assert.equal(workerAuthorized(new Request("https://example.test", { headers: { authorization } }), { CRON_SECRET: secret }), false);
  }
  assert.equal(workerAuthorized(new Request("https://example.test", { headers: { authorization: `Bearer ${secret}` } }), { CRON_SECRET: secret }), true);
});
