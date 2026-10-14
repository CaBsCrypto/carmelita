import assert from "node:assert/strict";
import test from "node:test";
import { requestConsentRedirect } from "../app/oauth/authorize/consent-request";

test("Claude callback preserves state and rejects changes to callback or decision", async () => {
  const callback = "https://claude.ai/api/mcp/auth_callback";
  const query = `?redirect_uri=${encodeURIComponent(callback)}&state=claude-test`;
  const granted = callback + "?code=synthetic&state=claude-test";
  assert.equal(await requestConsentRedirect(query, true, async () => "synthetic", async () => Response.json({ redirectUri: granted })), granted);
  const denied = callback + "?error=access_denied&state=claude-test";
  assert.equal(await requestConsentRedirect(query, false, async () => "synthetic", async () => Response.json({ redirectUri: denied })), denied);
  for (const redirectUri of [granted.replace("claude.ai", "attacker.example"), granted.replace("claude-test", "wrong"), granted.replace("auth_callback", "other")]) {
    await assert.rejects(requestConsentRedirect(query, true, async () => "synthetic", async () => Response.json({ redirectUri })), /redirect_invalid/);
  }
  await assert.rejects(requestConsentRedirect(query, false, async () => "synthetic", async () => Response.json({ redirectUri: granted })), /redirect_invalid/);
});
