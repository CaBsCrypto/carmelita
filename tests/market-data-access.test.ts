import assert from "node:assert/strict";
import test from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { executeMarketRead } from "../app/market-data/access";
import { assetQuerySchema, chainComparisonInputSchema, marketQuotesInputSchema } from "../app/market-data/types";

const user: AuthInfo = { token: "fixture-not-a-credential", clientId: "test", scopes: ["agent:read"], extra: { subjectType: "user", userId: "test-user" } };

test("market reads reject anonymous, provider and insufficient scope before calling a source", async () => {
  let sourceCalls = 0;
  const read = async () => { sourceCalls++; return { result: "public market data" }; };
  await assert.rejects(executeMarketRead(undefined, read), /mcp_principal_required/);
  await assert.rejects(executeMarketRead({ ...user, scopes: ["agent:context"] }, read), /mcp_scope_required/);
  await assert.rejects(executeMarketRead({ ...user, extra: { subjectType: "provider", providerId: "other" } }, read), /mcp_principal_required/);
  assert.equal(sourceCalls, 0);
  assert.deepEqual(await executeMarketRead(user, read), { result: "public market data" });
  assert.equal(sourceCalls, 1);
});

test("market requests cannot select another owner and enforce asset and ranking bounds", () => {
  assert.equal(assetQuerySchema.safeParse({ query: "SOL", userId: "someone-else" }).success, false);
  assert.equal(assetQuerySchema.safeParse({ address: "0x123" }).success, false);
  assert.equal(marketQuotesInputSchema.safeParse({ assets: Array.from({ length: 11 }, () => ({ query: "SOL" })) }).success, false);
  assert.equal(chainComparisonInputSchema.safeParse({ limit: 21 }).success, false);
  assert.deepEqual(chainComparisonInputSchema.parse({}), { sortBy: "tvl", limit: 10, locale: "es" });
});
