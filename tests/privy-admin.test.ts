import assert from "node:assert/strict";
import test from "node:test";
import { getPrivyAdminIdentity } from "../app/admin/privy-auth";
import { isPasswordAdminConfigured } from "../app/admin/auth";
import { POST } from "../app/api/admin/privy-session/route";

test("Privy admin authorization uses verified identity, exact allowlist and current membership", async () => {
  const previous = process.env.CARMELITA_ADMIN_EMAILS;
  process.env.CARMELITA_ADMIN_EMAILS = "owner@example.com, second@example.com";
  let email: string | null = " OWNER@example.com ";
  const dependencies = {
    verifyPrivyAccessToken: async () => ({ user_id: "verified-user" }),
    getPrivyUserIdentity: async () => ({ id: "verified-user", email }),
  };
  try {
    assert.equal((await getPrivyAdminIdentity("token", dependencies))?.method, "privy");
    email = "second@example.com";
    assert.ok(await getPrivyAdminIdentity("token", dependencies));
    for (const denied of ["test@example.com", "owner@example.com.attacker.test", null]) {
      email = denied;
      assert.equal(await getPrivyAdminIdentity("token", dependencies), null);
    }
    email = "owner@example.com";
    assert.equal(await getPrivyAdminIdentity("expired", { ...dependencies,
      verifyPrivyAccessToken: async () => { throw new Error("expired"); },
    }), null);
    assert.equal(await getPrivyAdminIdentity("token", { ...dependencies,
      getPrivyUserIdentity: async () => ({ id: "other-user", email }),
    }), null);
    assert.equal(isPasswordAdminConfigured(), false);
    process.env.CARMELITA_ADMIN_EMAILS = "second@example.com";
    assert.equal(await getPrivyAdminIdentity("token", dependencies), null);
  } finally {
    if (previous === undefined) delete process.env.CARMELITA_ADMIN_EMAILS;
    else process.env.CARMELITA_ADMIN_EMAILS = previous;
  }
});

test("admin session exchange rejects missing/cross origin and forged email headers", async () => {
  for (const origin of [undefined, "https://attacker.test", "not-a-url", "https://preview.test"]) {
    const headers: Record<string, string> = { "oai-authenticated-user-email": "owner@example.com" };
    if (origin) headers.origin = origin;
    const response = await POST(new Request("https://preview.test/api/admin/privy-session", { method: "POST", headers }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});
