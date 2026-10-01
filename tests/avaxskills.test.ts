import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { searchAvaxSkills } from "../app/connectors/avaxskills";
import { createEcosystemQueries } from "../app/queries/ecosystem";
import { executeMcpReadQuery } from "../app/queries/adapters";
import { parseChatReadRequest } from "../app/queries/chat";
const runMcp = async (...args: Parameters<typeof executeMcpReadQuery>) => executeMcpReadQuery(...args);

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

test("AVAX Skills search is allowlisted, bounded and advisory-only", async () => {
  let requestedUrl = "";
  const result = await searchAvaxSkills("x402 & agents", async (input) => {
    requestedUrl = String(input);
    return jsonResponse([{ name: "x402-integration", description: "A guide", skillUrl: "https://avaxskills.com/x402-integration/SKILL.md" }]);
  });
  assert.equal(requestedUrl, "https://www.avaxskills.com/api/search/?q=x402%20%26%20agents");
  assert.equal(result.trust, "advisory_unverified");
  assert.equal(result.requiresOfficialVerification, true);
  assert.equal(result.executionAllowed, false);
  assert.deepEqual(result.results[0]?.riskFlags, ["legacy_x402"]);
});

test("known unsafe patterns are explicitly flagged", async () => {
  const result = await searchAvaxSkills("wallet agents", async () => jsonResponse([
    { name: "ai-agent-patterns" },
    { name: "account-abstraction" },
  ]));
  assert.deepEqual(result.results[0]?.riskFlags, ["private_key_example"]);
  assert.deepEqual(result.results[1]?.riskFlags, ["future_research"]);
});

test("malformed remote data fails closed", async () => {
  await assert.rejects(searchAvaxSkills("x402", async () => jsonResponse({ unexpected: true })), /avaxskills_schema_invalid/);
  await assert.rejects(searchAvaxSkills("x402", async () => new Response("x", { headers: { "content-type": "text/plain" } })), /avaxskills_content_type_invalid/);
});

test("AVAX Skills route requires Privy and cannot execute remote instructions", async () => {
  const route = await readFile(new URL("../app/api/agent/avalanche/skills/route.ts", import.meta.url), "utf8");
  const connector = await readFile(new URL("../app/connectors/avaxskills.ts", import.meta.url), "utf8");
  assert.match(route, /verifyPrivyAccessToken/);
  assert.match(route, /sameOrigin/);
  assert.doesNotMatch(`${route}\n${connector}`, /eval\s*\(|sendTransaction|signTypedData|privateKey|child_process/);
  assert.match(connector, /executionAllowed: false/);
});
test("chat parser recognizes AVAX Skills in English, Spanish and Portuguese", async () => {
  const { parseAvaxSkillsIntent } = await import("../app/connectors/avalanche-read-intents");
  assert.equal(parseAvaxSkillsIntent("Search AVAX Skills for account abstraction")?.operation, "skills");
  assert.equal(parseAvaxSkillsIntent("Busca un skill de Avalanche para x402")?.operation, "skills");
  assert.equal(parseAvaxSkillsIntent("Procure no AVAX Skills por agentes")?.operation, "skills");
  assert.equal(parseAvaxSkillsIntent("Show my Stellar wallet"), null);
});

test("personal MCP exposes advisory search as a read-only tool", async () => {
  const source = await readFile(new URL("../app/api/mcp/agent/route.ts", import.meta.url), "utf8");
  assert.match(source, /for \(const query of readQueryDefinitions\)/);
  assert.match(source, /server\.registerTool\(query\.toolName/);
  assert.match(source, /inputSchema: query\.inputSchema,/);
  assert.match(source, /readOnlyHint: true, destructiveHint: false/);
  assert.match(source, /executeMcpReadQuery\(query\.id, input, extra\.authInfo\)/);
  let calls = 0;
  const definitions = createEcosystemQueries({ skills: async query => {
    calls++;
    return searchAvaxSkills(query, async () => jsonResponse([{ name: "x402-integration", description: "Advisory guide" }]));
  } });
  const skills = definitions.find(query => query.id === "avalanche.skills.search");
  assert.ok(skills);
  assert.equal(skills.toolName, "search_avax_skills");
  assert.equal(skills.scope, "agent:read");
  assert.deepEqual(Object.keys(skills.inputSchema.shape), ["query"]);
  assert.equal(skills.inputSchema.safeParse({ query: "x402" }).success, true);
  assert.equal(skills.inputSchema.safeParse({ query: "x" }).success, false);
  assert.equal(skills.inputSchema.safeParse({ query: "x402", userId: "another-owner" }).success, false);
  const auth = { token: "fixture-not-a-credential", clientId: "fixture", scopes: ["agent:read"], extra: { subjectType: "user", userId: "owner-a" } };
  await assert.rejects(runMcp(skills.toolName, { query: "x402" }, undefined, definitions), /mcp_principal_required/);
  await assert.rejects(runMcp(skills.toolName, { query: "x402" }, { ...auth, scopes: [] }, definitions), /mcp_scope_required/);
  assert.equal(calls, 0);
  const result = await executeMcpReadQuery(skills.toolName, { query: "x402" }, auth, definitions) as Awaited<ReturnType<typeof searchAvaxSkills>>;
  assert.equal(result.trust, "advisory_unverified");
  assert.equal(result.executionAllowed, false);
  assert.equal(result.requiresOfficialVerification, true);
  assert.deepEqual(result.results[0]?.riskFlags, ["legacy_x402"]);
  assert.equal(calls, 1);
});

test("chat reports AVAX Skills with a supported read-only connection stage", async () => {
  for (const text of ["Search AVAX Skills for account abstraction", "Busca un skill de Avalanche para x402", "Procure no AVAX Skills por agentes"]) {
    const request = parseChatReadRequest(text);
    assert.ok(request && !("invalid" in request));
    assert.equal(request.id, "avalanche.skills.search");
    assert.deepEqual(Object.keys(request.input), ["query"]);
  }
  const chatSource = await readFile(new URL("../app/agent-chat-store.ts", import.meta.url), "utf8");
  assert.match(chatSource, /executeChatRead\(sharedRead, userId, language\)/);
  assert.doesNotMatch(chatSource, /stage: "Advisory read-only"/);
});
