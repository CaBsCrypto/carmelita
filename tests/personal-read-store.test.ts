import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../db/schema";
import { readAgentActivity, readAgentAutopilot, readAgentConversation, readAgentVault } from "../app/queries/personal-store";
import { DEFAULT_AUTOPILOT_CONFIG } from "../app/agent-autopilot";

const own = "did:privy:store-owner-a";
const foreign = "did:privy:store-owner-b";
const iso = "2026-10-01T07:00:00.000Z";
const conversationId = (owner: string) => `conv_${createHash("sha256").update(owner).digest("hex").slice(0, 32)}`;

type DataRow = Record<string, unknown>;
function fixture() {
  const tables: Record<string, DataRow[]> = {
    agent_conversations: [own, foreign].map((owner) => ({ id: conversationId(owner), user_id: owner })),
    agent_messages: [own, foreign].map((owner) => ({ id: `${owner}-message`, user_id: owner,
      conversation_id: conversationId(owner), role: "assistant", content: `${owner} private conversation`,
      metadata: { memoryUpdated: true, unknownMetadata: "private", workflow: { id: "read", accessToken: "secret", apiKey: "secret", result: { token: "secret", preparedXdr: "secret", count: 1 } } }, created_at: iso })),
    agent_knowledge_items: [own, foreign].map((owner) => ({ id: `${owner}-knowledge`, user_id: owner,
      kind: "preference", title: "My language", content: owner === own ? "Spanish" : "Portuguese", source: "chat",
      scope: "personal", sensitivity: "standard", status: "active", created_at: iso, updated_at: iso })),
    agent_policies: [own, foreign].map((owner) => ({ id: `${owner}-policy`, user_id: owner, kind: "limit", label: "Limit",
      config: { maxDailyActions: 2, accessTokenEncrypted: "secret", nested: { privateKey: "secret", currency: "XLM" } },
      source: "chat", enforcement: "hard", status: "active", created_at: iso, updated_at: iso })),
    agent_decision_events: [own, foreign].map((owner) => ({ id: `${owner}-decision`, user_id: owner, action_type: "test",
      outcome: "blocked", reason_codes: ["approval_required"], explanation: { reason: "Read only", authorization: "secret" }, created_at: iso })),
    agent_activities: [own, foreign].map((owner) => ({ id: `${owner}-activity`, user_id: owner, event_type: "read",
      summary: `${owner} activity`, metadata: { signedXdr: "secret" }, created_at: iso })),
  };
  const statements: Array<{ query: string; params: unknown[] }> = [];
  const client = Object.assign(async () => { throw new Error("unexpected_query"); }, {
    query: async (query: string, params: unknown[]) => {
      statements.push({ query, params });
      assert.match(query, /^select /, "personal readers must issue only SELECT, never DDL or mutations");
      const table = query.match(/ from "([a-z_]+)"/)?.[1];
      assert.ok(table);
      const ownerPredicate = query.match(/\."user_id" = \$(\d+)/);
      assert.ok(ownerPredicate, "every query must carry the authenticated owner predicate into SQL");
      const owner = params[Number(ownerPredicate[1]) - 1];
      let rows = (tables[table] ?? []).filter((row) => row.user_id === owner);
      const idPredicate = query.match(/\."id" = \$(\d+)/);
      if (idPredicate) rows = rows.filter((row) => row.id === params[Number(idPredicate[1]) - 1]);
      const conversationPredicate = query.match(/\."conversation_id" = \$(\d+)/);
      if (conversationPredicate) rows = rows.filter((row) => row.conversation_id === params[Number(conversationPredicate[1]) - 1]);
      const kindPredicate = query.match(/\."kind" = \$(\d+)/);
      if (kindPredicate) rows = rows.filter((row) => row.kind === params[Number(kindPredicate[1]) - 1]);
      const limitParameter = query.match(/ limit \$(\d+)/);
      assert.ok(limitParameter, "personal reads must be bounded");
      rows = rows.slice(0, Number(params[Number(limitParameter[1]) - 1]));
      const columns = [...query.slice(7, query.indexOf(" from ")).matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
      return { rows: rows.map((row) => columns.map((column) => row[column])) };
    },
  }) as unknown as NeonQueryFunction<false, false>;
  return { tables, statements, db: drizzle(client, { schema }) };
}

test("conversation read preserves existing messages, scopes both tables to owner and never initializes", async () => {
  const { statements, tables, db } = fixture();
  // An inconsistent foreign-owner message in the same conversation must also be excluded.
  tables.agent_messages.push({ ...tables.agent_messages[1], conversation_id: conversationId(own) });
  const before = structuredClone(tables);
  const conversation = await readAgentConversation(own, db);
  assert.equal(conversation.conversationId, conversationId(own));
  assert.equal(conversation.messages.length, 1);
  assert.equal(conversation.messages[0].content, `${own} private conversation`);
  assert.equal(conversation.messages[0].memoryUpdated, true);
  assert.equal(conversation.messages[0].createdAt, iso);
  assert.deepEqual(conversation.messages[0].workflow, { id: "read", result: { count: 1 } });
  assert.doesNotMatch(JSON.stringify(conversation), /secret|unknownMetadata|owner-b/);
  assert.equal(statements.length, 2);
  assert.deepEqual(tables, before);
});

test("missing conversation is empty without inserting a profile, conversation or welcome message", async () => {
  const { statements, tables, db } = fixture();
  const before = structuredClone(tables);
  assert.deepEqual(await readAgentConversation("did:privy:absent", db), { conversationId: null, messages: [] });
  assert.equal(statements.length, 1);
  assert.deepEqual(tables, before);
});

test("memory reader returns only owner records with bounded SELECTs and sanitized structured details", async () => {
  const { tables, statements, db } = fixture();
  const before = structuredClone(tables);
  const vault = await readAgentVault(own, db);
  assert.equal(vault.knowledge.length, 1);
  assert.equal(vault.policies.length, 1);
  assert.equal(vault.decisions.length, 1);
  assert.equal(vault.knowledge[0].label, "My language");
  assert.equal(vault.knowledge[0].content, "Spanish");
  assert.deepEqual(vault.policies[0].config, { maxDailyActions: 2, nested: { currency: "XLM" } });
  assert.deepEqual(vault.decisions[0].explanation, { reason: "Read only" });
  assert.doesNotMatch(JSON.stringify(vault), /secret|owner-b|userId/);
  assert.equal(statements.length, 3);
  assert.deepEqual(tables, before);
});

test("activity reader excludes raw metadata and caps reads at fifty without provider requests", async () => {
  const { tables, statements, db } = fixture();
  const before = structuredClone(tables);
  const activity = await readAgentActivity(own, 1000, db);
  assert.deepEqual(activity, [{ id: `${own}-activity`, eventType: "read", summary: `${own} activity`, createdAt: iso }]);
  assert.equal(statements[0].params.at(-1), 50);
  assert.doesNotMatch(JSON.stringify(activity), /metadata|secret|signedXdr|owner-b/);
  assert.deepEqual(tables, before);
});

test("autopilot with no recorded policy remains off and does not provision a default policy", async () => {
  const { tables, statements, db } = fixture();
  const before = structuredClone(tables);
  assert.deepEqual(await readAgentAutopilot(own, db), { status: "off", config: DEFAULT_AUTOPILOT_CONFIG, signer: { ready: false, status: "manual_signature_required" } });
  assert.equal(statements.length, 1);
  assert.equal(statements[0].params.at(-1), 1);
  assert.ok(statements[0].params.includes("autopilot"));
  assert.deepEqual(tables, before);
});

test("autopilot reports real policy expiration through a read without activating, changing limits or signing", async () => {
  const { tables, statements, db } = fixture();
  tables.agent_policies.unshift({ id: "own-autopilot", user_id: own, kind: "autopilot", status: "active",
    config: { durationHours: 8, xlmPerAction: 2, usdcPerAction: 0.02, maxDailyActions: 4,
      delegatedSignerReady: false, executionMode: "policy_only", expiresAt: "2026-10-01T08:00:00Z", token: "secret" }, updated_at: iso });
  tables.agent_policies.unshift({ id: "foreign-autopilot", user_id: foreign, kind: "autopilot", status: "active",
    config: { delegatedSignerReady: true, executionMode: "delegated" }, updated_at: iso });
  const before = structuredClone(tables);
  const active = await readAgentAutopilot(own, db, Date.parse("2026-10-01T07:59:59Z"));
  assert.equal(active.status, "active");
  assert.equal(active.config.durationHours, 8);
  assert.equal(active.config.xlmPerAction, 2);
  assert.equal(active.config.usdcPerAction, 0.02);
  assert.equal(active.config.maxDailyActions, 4);
  assert.equal(active.config.network, "stellar:testnet");
  assert.deepEqual(active.signer, { ready: false, status: "manual_signature_required" });
  const expired = await readAgentAutopilot(own, db, Date.parse("2026-10-01T08:00:00Z"));
  assert.equal(expired.status, "expired");
  assert.doesNotMatch(JSON.stringify(expired), /secret|foreign-autopilot/);
  assert.equal(statements.length, 2);
  assert.deepEqual(tables, before);
});
