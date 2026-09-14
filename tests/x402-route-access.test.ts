import assert from "node:assert/strict";
import test from "node:test";
import { GET, POST } from "../app/api/agent/x402/route";

test("wallet status, exact receipt lookup and reconciliation reject missing Privy authorization", async () => {
  for (const query of ["", "?paymentId=12345678-1234-4234-8234-123456789abc"]) {
    const response = await GET(new Request(`https://preview.invalid/api/agent/x402${query}`));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "x402_authorization_required");
  }
  for (const action of ["execute", "reconcile", "prepare"]) {
    const response = await POST(new Request("https://preview.invalid/api/agent/x402", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ action, paymentId: "12345678-1234-4234-8234-123456789abc" }) }));
    assert.equal(response.status, 401);
  }
});

test("a cross-origin or malformed-origin request is rejected before Privy or persistence", async () => {
  for (const origin of ["https://other.invalid", "not-a-url"]) {
    const response = await POST(new Request("https://preview.invalid/api/agent/x402", { method: "POST",
      headers: { host: "preview.invalid", origin, authorization: "Bearer fake-fixture-only" }, body: "{}" }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "x402_invalid_origin");
  }
});
