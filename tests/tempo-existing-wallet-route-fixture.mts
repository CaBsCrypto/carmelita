import assert from "node:assert/strict";
import { mock } from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

type ToolResult = { isError?: boolean; content: { type: string; text: string }[]; _meta?: Record<string, unknown> };
type ToolConfig = {
  description?: string;
  inputSchema?: unknown;
  annotations?: Record<string, boolean>;
  _meta?: { securitySchemes?: unknown };
};
type Callback = (input: unknown, extra: { authInfo?: AuthInfo; signal?: AbortSignal }) => Promise<ToolResult>;
type RegisteredTool = { config: ToolConfig; callback: Callback };
const registered = new Map<string, RegisteredTool>();
const name = "read_tempo_existing_evm_wallet";
const associationName = "associate_tempo_testnet_wallet";
const associationScope = "agent:wallet:associate";
const ownerA = "did:privy:synthetic-route-owner-a";
const ownerB = "did:privy:synthetic-route-owner-b";
const principal = (userId: string, scopes = ["agent:read"]): AuthInfo => ({
  token: "synthetic-route-token", clientId: "synthetic-route-client", scopes,
  extra: { subjectType: "user", userId },
});
const authA = principal(ownerA);
const authB = principal(ownerB);
const writeA = principal(ownerA, ["agent:read", associationScope]);
const writeB = principal(ownerB, ["agent:read", associationScope]);
const writeOnly = principal(ownerA, [associationScope]);
const authorized = new Map<AuthInfo, string>([[authA, ownerA], [authB, ownerB], [writeA, ownerA], [writeB, ownerB], [writeOnly, ownerA]]);
let currentAuth: AuthInfo = authA;
let rejectToken = false;
let helperError: string | null = null;
const calls = { helper: [] as { input: unknown; authInfo: AuthInfo; signal?: AbortSignal }[], legacy: 0, mutation: 0, fetch: 0 };
const associationCalls: { input: unknown; authInfo: AuthInfo; signal?: AbortSignal }[] = [];
const challengeCalls: { error?: string; requiredScope?: string }[] = [];
const order: string[] = [];
const schema = z.object({}).strict();
const associationSchema = z.object({ explicitUserConfirmation: z.literal(true) }).strict();

function unexpectedMutation() {
  calls.mutation++;
  throw new Error("unexpected_mutation_in_existing_wallet_read");
}
// Authentication and the helper are isolated boundaries in this route fixture.
// Backend's companion tests exercise their real authorization/SQL/Privy/RPC logic.
function requireFixtureSubject(authInfo: AuthInfo | undefined, type: string, key: string, scope?: string) {
  order.push("auth");
  assert.equal(type, "user");
  assert.equal(key, "userId");
  assert.ok(scope === "agent:read" || scope === associationScope);
  if (!authInfo || authInfo.extra?.subjectType !== "user") throw new Error("mcp_principal_required");
  if (!authInfo.scopes.includes(scope)) throw new Error(`mcp_scope_required:${scope}`);
  const owner = authorized.get(authInfo);
  if (!owner) throw new Error("mcp_principal_invalid");
  return owner;
}
function reset() {
  calls.helper.length = 0;
  calls.legacy = 0;
  calls.mutation = 0;
  calls.fetch = 0;
  associationCalls.length = 0;
  challengeCalls.length = 0;
  order.length = 0;
  currentAuth = authA;
  rejectToken = false;
  helperError = null;
}
mock.method(globalThis, "fetch", async () => {
  calls.fetch++;
  throw new Error("unexpected_network_in_route_fixture");
});
mock.module("mcp-handler", {
  namedExports: {
    createMcpHandler: (initialize: (server: { registerTool: (toolName: string, config: ToolConfig, callback: Callback) => void }) => void) => {
      initialize({ registerTool: (toolName, config, callback) => {
        assert.equal(registered.has(toolName), false, "duplicate MCP tool registration");
        registered.set(toolName, { config, callback });
      } });
      return async (request: Request & { auth?: AuthInfo }) => {
        const body = await request.json() as { params: { name: string; arguments: unknown } };
        const tool = registered.get(body.params.name);
        assert.ok(tool, "the requested tool was not registered by the real route");
        const inputSchema = tool.config.inputSchema as z.ZodType;
        const parsed = inputSchema.safeParse(body.params.arguments);
        if (!parsed.success) return Response.json({ isError: true, content: [{ type: "text", text: JSON.stringify({ error: "invalid_tool_input" }) }] });
        return Response.json(await tool.callback(parsed.data, { authInfo: request.auth, signal: request.signal }));
      };
    },
  },
});
mock.module(new URL("../app/queries/registry.ts", import.meta.url).href, {
  namedExports: { readQueryDefinitions: ["read_personal_wallets_status", "read_personal_wallets_balances"].map(toolName => ({
    id: toolName, toolName, title: toolName, description: "Existing personal read", inputSchema: z.object({}).strict(),
  })) },
});
mock.module(new URL("../app/queries/adapters.ts", import.meta.url).href, {
  namedExports: { executeMcpReadQuery: async (_id: string, _input: unknown, authInfo: AuthInfo) => {
    calls.legacy++;
    assert.equal(authInfo, currentAuth);
    return { legacyRead: true };
  } },
});
mock.module(new URL("../app/mcp/auth.ts", import.meta.url).href, {
  namedExports: {
    requireMcpSubject: requireFixtureSubject,
    verifyAgentMcpToken: async (token: string) => {
      assert.equal(token, "synthetic-route-token");
      if (rejectToken) throw new Error("synthetic_revoked_token");
      return currentAuth;
    },
    authenticateMcp: async (request: Request & { auth?: AuthInfo }, verify: (token: string) => Promise<AuthInfo>, handler: (request: Request) => Promise<Response>) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      if (!token) return Response.json({ error: "authentication_required" }, { status: 401 });
      try { request.auth = await verify(token); }
      catch { return Response.json({ error: "authentication_required" }, { status: 401 }); }
      return handler(request);
    },
    publicMcpErrorCode: (error: unknown) => {
      const code = error instanceof Error ? error.message.split(":", 1)[0] : "";
      return /^[a-z_]+$/.test(code) ? code : "mcp_request_failed";
    },
  },
});
mock.module(new URL("../app/mcp/stytch-oauth.ts", import.meta.url).href, {
  namedExports: { agentOAuthBearerChallenge: (input: { error?: string; requiredScope?: string; errorDescription?: string }) => {
    challengeCalls.push(input);
    return `Bearer realm="synthetic-mcp", error="${input.error}", scope="${input.requiredScope}"`;
  } },
});
mock.module(new URL("../app/mcp/tempo-existing-wallet.ts", import.meta.url).href, {
  namedExports: {
    tempoExistingWalletInputSchema: schema,
    readTempoExistingWallet: async (input: unknown, authInfo: AuthInfo | undefined, dependencies: { signal?: AbortSignal } = {}) => {
      const owner = requireFixtureSubject(authInfo, "user", "userId", "agent:read");
      order.push("schema");
      schema.parse(input);
      assert.ok(authInfo);
      calls.helper.push({ input, authInfo, signal: dependencies.signal });
      order.push("helper");
      if (helperError) throw new Error(helperError);
      return {
        source: "existingEVM", evm: { address: `0x${(owner === ownerA ? "a" : "b").repeat(40)}`, family: "evm", chainType: "ethereum", ownershipVerified: true },
        tempo: { network: "tempo:moderato", chainId: 42431, testnet: true, status: "available", token: { symbol: "PathUSD", balanceAtomic: "0", balance: "0" } },
        registryChanged: false, walletCreated: false, fundsMoved: false, signingRequired: false, tempoRegistrationChecked: false,
      };
    },
  },
});
mock.module(new URL("../app/mcp/tempo-wallet-association.ts", import.meta.url).href, {
  namedExports: {
    tempoWalletAssociationInputSchema: associationSchema,
    associateTempoWallet: async (input: unknown, authInfo: AuthInfo | undefined, dependencies: { signal?: AbortSignal } = {}) => {
      const owner = requireFixtureSubject(authInfo, "user", "userId", associationScope);
      requireFixtureSubject(authInfo, "user", "userId", "agent:read");
      associationSchema.parse(input);
      assert.ok(authInfo);
      associationCalls.push({ input, authInfo, signal: dependencies.signal });
      return {
        associated: true, association: { network: "tempo:moderato", address: `0x${(owner === ownerA ? "a" : "b").repeat(40)}` },
        walletCreated: false, fundsMoved: false, signingRequired: false,
      };
    },
  },
});
mock.module(new URL("../app/agent-gateway/service.ts", import.meta.url).href, {
  namedExports: { createGatewayPlan: unexpectedMutation },
});
mock.module(new URL("../app/wallets/tempo-onboarding.ts", import.meta.url).href, {
  namedExports: { ensureTempoTestnetWallet: unexpectedMutation },
});
mock.module(new URL("../app/agent-gateway/catalog.ts", import.meta.url).href, {
  namedExports: { getGatewayCapability: unexpectedMutation },
});
mock.module(new URL("../app/bazaar/native-channel-boundary.ts", import.meta.url).href, {
  namedExports: { createNativeGatewayPlan: unexpectedMutation, projectNativeAvalanchePlan: unexpectedMutation },
});
mock.module(new URL("../app/agent-gateway/operations.ts", import.meta.url).href, {
  namedExports: { createGatewayAudit: () => ({ identify: () => undefined, complete: (response: Response) => response }) },
});
mock.module(new URL("../app/avalanche/capability-registry.ts", import.meta.url).href, {
  namedExports: { avalancheCapabilityIdSchema: z.literal("synthetic-capability"), planAvalancheCapability: unexpectedMutation },
});

const { POST } = await import("../app/api/mcp/agent/route");
function request(input: unknown = {}, token = true, toolName = name, signal?: AbortSignal) {
  return new Request("https://synthetic.example.test/api/mcp/agent", {
    method: "POST", signal, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer synthetic-route-token" } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: input } }),
  });
}
const resultData = (result: ToolResult) => JSON.parse(result.content[0].text) as Record<string, unknown>;
function assertNoEffects() {
  assert.equal(calls.mutation, 0);
  assert.equal(calls.fetch, 0);
  assert.equal(calls.legacy, 0, "the standalone read must not invoke an association or another registry query");
  assert.deepEqual(associationCalls, [], "readonly and denied requests must not invoke the association writer");
}

reset();
await POST(request()); // Initialize registration through the real Next.js route.
const tool = registered.get(name);
assert.ok(tool, "read_tempo_existing_evm_wallet must be registered by the real MCP route");
assert.equal(tool.config.inputSchema, schema);
assert.deepEqual(tool.config.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
assert.deepEqual(tool.config._meta?.securitySchemes, [{ type: "oauth2", scopes: ["agent:read"] }]);
assert.match(tool.config.description ?? "", /existing.*EVM|EVM.*existing/i);
assert.match(tool.config.description ?? "", /does not|never|without/i);
assert.match(tool.config.description ?? "", /tempoRegistrationChecked\s*=\s*false/);
assert.match(tool.config.description ?? "", /(?:does not|never|without)[^.]*persist/i);
assert.ok(registered.has("read_personal_wallets_status"));
assert.ok(registered.has("read_personal_wallets_balances"));
const associationTool = registered.get(associationName);
assert.ok(associationTool, "the real route must register the explicit association separately from reads");
assert.equal(associationTool.config.inputSchema, associationSchema);
assert.deepEqual(associationTool.config.annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true });
assert.deepEqual(associationTool.config._meta?.securitySchemes, [{ type: "oauth2", scopes: ["agent:read", associationScope] }]);

for (const input of [{ userId: ownerB }, { owner: ownerB }, { address: `0x${"b".repeat(40)}` }, { walletId: "synthetic-foreign-wallet" }, { network: "tempo:mainnet" }, { rpcUrl: "https://synthetic-attacker.example.test" }, { context: { userId: ownerB } }, null, []]) {
  reset();
  assert.equal(schema.safeParse(input).success, false);
  const response = await POST(request(input));
  assert.equal((await response.json() as ToolResult).isError, true);
  assert.deepEqual(calls.helper, [], "forged selectors must not reach the helper");
  assertNoEffects();
}
for (const authInfo of [undefined, principal(ownerA, ["agent:context"]), { ...authA, extra: { subjectType: "provider", providerId: "synthetic-provider" } }]) {
  reset();
  const result = await tool.callback({}, { authInfo });
  assert.equal(result.isError, true);
  assert.deepEqual(calls.helper, [], "denied authority must not reach the data-read boundary");
  assert.deepEqual(order, ["auth"]);
  assertNoEffects();
}
for (const tokenPresent of [false, true]) {
  reset();
  rejectToken = true;
  const response = await POST(request({}, tokenPresent));
  assert.equal(response.status, 401);
  assert.deepEqual(calls.helper, [], "transport authentication failure must not execute the tool");
  assertNoEffects();
}
reset();
for (const authInfo of [authA, authB, authA]) {
  currentAuth = authInfo;
  const response = await POST(request());
  const result = await response.json() as ToolResult;
  assert.notEqual(result.isError, true);
  const data = resultData(result);
  assert.equal(data.source, "existingEVM");
  assert.deepEqual(data.evm, { address: `0x${(authInfo === authA ? "a" : "b").repeat(40)}`, family: "evm", chainType: "ethereum", ownershipVerified: true });
  for (const flag of ["registryChanged", "walletCreated", "fundsMoved", "signingRequired", "tempoRegistrationChecked"]) assert.equal(data[flag], false);
  assert.equal(calls.helper.at(-1)?.authInfo, authInfo, "the route must forward the authenticated principal unchanged");
  assert.deepEqual(calls.helper.at(-1)?.input, {});
  assert.doesNotMatch(JSON.stringify(data), /synthetic-route-token|synthetic-route-client|did:privy:/);
}
assert.equal(calls.helper.length, 3, "reads must not share a cached result across authenticated owners");
assertNoEffects();
reset();
helperError = "existing_evm_wallet_required";
const unavailable = await POST(request());
assert.deepEqual(resultData(await unavailable.json() as ToolResult), { error: "existing_evm_wallet_required" });
assertNoEffects();
reset();
await POST(request({}, true, "read_personal_wallets_status"));
assert.equal(calls.legacy, 1, "legacy read registrations retain their existing adapter");
assert.deepEqual(calls.helper, []);
assert.equal(calls.mutation, 0);
assert.equal(calls.fetch, 0);

for (const input of [{}, { explicitUserConfirmation: false }, { explicitUserConfirmation: "true" },
  ...[{ userId: ownerB }, { owner: ownerB }, { address: `0x${"b".repeat(40)}` }, { walletId: "synthetic-foreign-wallet" },
    { network: "tempo:moderato" }, { chainId: 4217 }, { rpcUrl: "https://synthetic-attacker.example.test" }, { context: { userId: ownerB } }]
    .map(value => ({ explicitUserConfirmation: true, ...value }))]) {
  reset(); currentAuth = writeA;
  const response = await POST(request(input, true, associationName));
  assert.equal((await response.json() as ToolResult).isError, true);
  assert.deepEqual(calls.helper, []);
  assertNoEffects();
}
for (const [authInfo, missingScope] of [[authA, associationScope], [writeOnly, "agent:read"]] as const) {
  reset();
  const result = await associationTool.callback({ explicitUserConfirmation: true }, { authInfo });
  assert.equal(result.isError, true);
  assert.deepEqual(resultData(result), { error: "mcp_scope_required" });
  const challenges = result._meta?.["mcp/www_authenticate"];
  assert.ok(Array.isArray(challenges));
  assert.equal(challenges.length, 1);
  assert.match(String(challenges[0]), /error="insufficient_scope"/);
  assert.ok(String(challenges[0]).includes(`scope="${missingScope}"`));
  assert.equal(challengeCalls.length, 1);
  assert.equal(challengeCalls[0].requiredScope, missingScope);
  assert.deepEqual(calls.helper, []);
  assertNoEffects();
}
reset();
for (const authInfo of [writeA, writeB, writeA]) {
  currentAuth = authInfo;
  const response = await POST(request({ explicitUserConfirmation: true }, true, associationName));
  const result = await response.json() as ToolResult;
  assert.notEqual(result.isError, true);
  const data = resultData(result);
  assert.equal(data.associated, true);
  assert.deepEqual(data.association, { network: "tempo:moderato", address: `0x${(authInfo === writeA ? "a" : "b").repeat(40)}` });
  for (const flag of ["walletCreated", "fundsMoved", "signingRequired"]) assert.equal(data[flag], false);
  assert.equal(associationCalls.at(-1)?.authInfo, authInfo);
  assert.deepEqual(associationCalls.at(-1)?.input, { explicitUserConfirmation: true });
}
assert.equal(associationCalls.length, 3, "the route forwards each principal without a shared owner cache");
assert.deepEqual(calls.helper, []);
assert.equal(calls.legacy, 0);
assert.equal(calls.mutation, 0, "the explicit association must not invoke provisioning or unrelated mutations");
assert.equal(calls.fetch, 0);
assert.deepEqual(challengeCalls, []);

for (const toolName of [name, associationName]) {
  reset(); currentAuth = writeA;
  const controller = new AbortController();
  const pending = request(toolName === name ? {} : { explicitUserConfirmation: true }, true, toolName, controller.signal);
  const response = await POST(pending);
  assert.notEqual((await response.json() as ToolResult).isError, true);
  const forwarded: { signal?: AbortSignal } | undefined = toolName === name ? calls.helper.at(-1) : associationCalls.at(-1);
  assert.equal(forwarded?.signal, pending.signal, "both real callbacks must forward the MCP request cancellation signal");
  controller.abort();
  assert.equal(forwarded?.signal?.aborted, true);
  assert.equal(calls.mutation, 0);
  assert.equal(calls.fetch, 0);
}

process.stdout.write(JSON.stringify({ registration: true, strictInput: true, authForwarding: true, ownerIsolation: true,
  readHasNoWrites: true, explicitAssociation: true, scopeChallenges: true }));
