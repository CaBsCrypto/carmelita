import assert from "node:assert/strict";
import test from "node:test";
import { ChatQuotaError, chatQuotaConfig, enforceChatQuota, trustedChatIp, type QuotaBucket } from "../app/chat-quota";

test("chat defaults are 30 per UTC day and 120 per IP hour; invalid config fails", () => {
  assert.deepEqual(chatQuotaConfig({}), { daily: 30, ipHourly: 120 });
  assert.throws(() => chatQuotaConfig({ CARMELITA_CHAT_DAILY_LIMIT: "0" }));
});
test("chat quota separates users, hashes identities and resets at UTC midnight", async () => {
  const rows: QuotaBucket[] = [];
  const consume = async (row: QuotaBucket) => { rows.push(row); return true; };
  await enforceChatQuota("alice", null, { now: new Date("2026-09-28T23:59:59Z"), consume, env: {} });
  await enforceChatQuota("bob", null, { now: new Date("2026-09-28T23:59:59Z"), consume, env: {} });
  await enforceChatQuota("alice", null, { now: new Date("2026-09-29T00:00:00Z"), consume, env: {} });
  assert.notEqual(rows[0].key, rows[1].key);
  assert.notEqual(rows[0].key, rows[2].key);
  assert.equal(rows[0].key.includes("alice"), false);
  assert.equal(rows[0].end.toISOString(), "2026-09-29T00:00:00.000Z");
});
test("quota rejection returns exact retry boundary and does not call later buckets", async () => {
  let count = 0;
  await assert.rejects(enforceChatQuota("alice", "127.0.0.1", { now: new Date("2026-09-28T12:59:40Z"), env: {}, consume: async () => { count++; return false; } }), (error) => error instanceof ChatQuotaError && error.retryAfterSeconds === 20);
  assert.equal(count, 1);
});
test("storage failures fail closed with sanitized error", async () => {
  await assert.rejects(enforceChatQuota("alice", null, { env: {}, consume: async () => { throw new Error("secret connection"); } }), { message: "chat_quota_unavailable" });
});
test("IP quota never trusts client forwarded headers", () => {
  const spoofed = new Request("https://example.com", { headers: { "x-forwarded-for": "1.2.3.4" } });
  assert.equal(trustedChatIp(spoofed, {}), null);
  assert.throws(() => trustedChatIp(spoofed, { VERCEL: "1" }), /chat_quota_ip_unavailable/);
  assert.equal(trustedChatIp(new Request("https://example.com", { headers: { "x-vercel-forwarded-for": "1.2.3.4" } }), { VERCEL: "1" }), "1.2.3.4");
});

test("IP admission and shared account admission count distinct buckets once", async () => {
  const rows: QuotaBucket[] = [];
  const consume = async (row: QuotaBucket) => { rows.push(row); return true; };
  await enforceChatQuota(null, "1.2.3.4", { consume, env: {} });
  await enforceChatQuota("alice", null, { consume, env: {} });
  assert.deepEqual(rows.map(row => row.scope), ["chat_ip_hourly", "chat_user_daily"]);
});
