import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/agent/stellar-bazaar/route";

test("Bazaar discovery rejects missing or invalid Privy authorization", async () => {
  const missing = await GET(new Request("https://preview.invalid/api/agent/stellar-bazaar?query=informe"));
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error, "stellar_bazaar_authorization_required");

  const invalid = await GET(new Request("https://preview.invalid/api/agent/stellar-bazaar?query=informe", {
    headers: { host: "preview.invalid", authorization: "Bearer fake-fixture-only" },
  }));
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error, "stellar_bazaar_authorization_invalid");
});

test("a cross-origin Bazaar request is rejected before any upstream call", async () => {
  for (const origin of ["https://other.invalid", "not-a-url"]) {
    const response = await GET(new Request("https://preview.invalid/api/agent/stellar-bazaar?query=informe", {
      headers: { host: "preview.invalid", origin, authorization: "Bearer fake-fixture-only" },
    }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "stellar_bazaar_invalid_origin");
  }
});

test("the Bazaar route never advertises a cacheable catalog", async () => {
  const response = await GET(new Request("https://preview.invalid/api/agent/stellar-bazaar?query=informe"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});
