import assert from 'node:assert/strict';
import { mock } from 'node:test';

let checks = 0;
mock.module(new URL('../app/admin/privy-auth.ts', import.meta.url).href, {
  namedExports: { getPrivyAdminIdentity: async (token: string) => {
    checks++;
    return token === 'valid-admin-fixture' ? { username: 'admin@example.test', displayName: 'Admin', method: 'privy' } : null;
  } },
});
mock.module(new URL('../app/admin/auth.ts', import.meta.url).href, {
  namedExports: { adminCookieOptions: () => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' }) },
});
const { POST } = await import('../app/api/admin/privy-session/route');
for (const verifyOnly of [true, false]) {
  const url = `https://preview.test/api/admin/privy-session${verifyOnly ? '?verifyOnly=true' : ''}`;
  for (const token of ['valid-admin-fixture', 'ordinary-user-fixture', 'expired-fixture', '']) {
    const response = await POST(new Request(url, { method: 'POST', headers: {
      origin: 'https://preview.test', authorization: `Bearer ${token}`,
    } }));
    assert.equal(response.status, token === 'valid-admin-fixture' ? 200 : 403);
    if (token === 'valid-admin-fixture' && !verifyOnly) {
      assert.match(response.headers.get('set-cookie') ?? '', /aa_admin_privy=valid-admin-fixture/);
      assert.match(response.headers.get('set-cookie') ?? '', /HttpOnly/);
    } else assert.equal(response.headers.get('set-cookie'), null);
    if (token === 'valid-admin-fixture') {
      assert.deepEqual(await response.json(), { authenticated: true });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
}
assert.equal(checks, 6);
const before = checks;
const denied = await POST(new Request('https://preview.test/api/admin/privy-session?verifyOnly=true', {
  method: 'POST', headers: { origin: 'https://foreign.test', authorization: 'Bearer valid-admin-fixture' },
}));
assert.equal(denied.status, 403);
assert.equal(denied.headers.get('set-cookie'), null);
assert.equal(checks, before);
