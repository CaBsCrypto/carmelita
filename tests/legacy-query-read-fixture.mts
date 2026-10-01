import assert from "node:assert/strict";
import { mock } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";

const dbModule = await import("../db/index");
const walletModule = await import("../app/multichain-account");
const stellarModule = await import("../app/privy-stellar");
const schema = await import("../db/schema");
const owner = "owner-a";
const ownAddress = "G".padEnd(56, "A");
const foreignAddress = "G".padEnd(56, "B");
const operations: string[] = [];
let rejectAuthentication = false;

const rawApproval = {
  id: "approval-a", userId: owner, action: "deposit", asset: "XLM", amount: "1", status: "confirmed",
  walletAddress: ownAddress, transactionHash: "public-hash", preview: { asset: "XLM", amount: "1" },
  expiresAt: new Date("2026-10-01T00:00:00Z"), confirmedAt: new Date("2026-09-30T23:00:00Z"), error: null,
  preparedXdr: "never-return-prepared-xdr", signedXdr: "never-return-signed-xdr", walletId: "provider-secret-id",
};
const select = (projection: Record<string, unknown>) => {
  operations.push("SELECT");
  assert.doesNotMatch(Object.keys(projection).join(" "), /preparedXdr|signedXdr|walletId|userId/);
  return {
    from: (table: unknown) => {
      assert.equal(table, schema.agentStellarActions);
      return {
        where: (predicate: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const sql = new PgDialect().sqlToQuery(predicate);
          assert.deepEqual(sql.params, [owner]);
          assert.match(sql.sql, /user_id/);
          return { orderBy: () => ({ limit: async (limit: number) => {
            assert.equal(limit, 10);
            return [rawApproval];
          } }) };
        },
      };
    },
  };
};
mock.module(new URL("../db/index.ts", import.meta.url).href, {
  namedExports: { ...dbModule, hasDatabase: () => true,
    getDatabaseUrl: () => { assert.fail("Read panels must never initialize schema or acquire database credentials"); },
    getDb: () => ({ select, insert: () => assert.fail("Unexpected write"), update: () => assert.fail("Unexpected write"), delete: () => assert.fail("Unexpected write") }),
  },
});
mock.module(new URL("../app/multichain-account.ts", import.meta.url).href, {
  namedExports: { ...walletModule, listPersistedUserWallets: async (userId: string) => {
    assert.equal(userId, owner);
    operations.push("wallet-registry");
    return [
      { userId: "owner-b", address: foreignAddress, chainType: "stellar", network: "stellar:testnet", status: "active" },
      { userId: owner, address: ownAddress, chainType: "stellar", network: "stellar:testnet", status: "active" },
    ];
  } },
});
mock.module(new URL("../app/privy-stellar.ts", import.meta.url).href, {
  namedExports: { ...stellarModule,
    verifyPrivyAccessToken: async (token: string) => {
      assert.equal(token, "fixture-token");
      if (rejectAuthentication) throw new Error("privy_invalid_token");
      return { user_id: owner };
    },
    getStellarTestnetAccount: async (address: string, signal?: AbortSignal) => {
      assert.equal(address, ownAddress);
      assert.ok(signal);
      operations.push("Horizon");
      return { exists: true, balances: [{ asset: "XLM", issuer: null, balance: "0" }] };
    },
  },
});
const queryCalls: Array<{ id: string; input: unknown; userId: string }> = [];
mock.module(new URL("../app/queries/adapters.ts", import.meta.url).href, {
  namedExports: { executeWebReadQuery: async (id: string, input: unknown, userId: string) => {
    queryCalls.push({ id, input, userId });
    assert.equal(userId, owner);
    if (id === "stellar.defindex.position.read") return { status: "partial", positions: [
      { asset: "XLM", status: "ok", vault: "xlm-vault", sharesAtomic: "0", shares: "0" },
      { asset: "USDC", status: "unavailable", error: "source_unavailable" },
    ] };
    if (id === "circle.cctp.readiness.read") return { status: "partial", errors: ["stellar_horizon_unavailable"], fetchedAt: "2026-10-01T00:00:00Z",
      sourceAddress: "0x1111111111111111111111111111111111111111", destinationAddress: ownAddress,
      sourceGasReady: true, sourceUsdcBalance: "0", destinationGasReady: null, destinationTrustlineReady: null };
    if (id === "circle.cctp.fees.read") return { status: "ok", sourceDomain: 1, destinationDomain: 27, options: [{ finalityThreshold: 1000, minimumFee: 0, minimumFeeUsdc: "0.000000" }], fetchedAt: "2026-10-01T00:00:00Z" };
    assert.fail(`Unexpected query: ${id}`);
  } },
});
globalThis.fetch = async () => { assert.fail("Read-route fixtures never contact real providers"); };
const request = (path: string, body?: object) => new Request(`https://carmelita.example${path}`, {
  method: body ? "POST" : "GET", headers: { authorization: "Bearer fixture-token", origin: "https://carmelita.example", host: "carmelita.example", "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

const defindex = await import("../app/api/agent/defindex/route");
const response = await defindex.GET(request("/api/agent/defindex"));
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "no-store");
const body = await response.json();
assert.equal(body.wallet, ownAddress);
assert.deepEqual(body.positions, { XLM: { asset: "XLM", vault: "xlm-vault", sharesAtomic: "0", shares: "0" }, USDC: null });
assert.equal(body.balances[0].balance, "0");
assert.equal(body.recent.length, 1);
assert.equal(body.recent[0].transactionHash, "public-hash");
assert.doesNotMatch(JSON.stringify(body), /provider-secret-id|never-return|preparedXdr|signedXdr|owner-b/);
assert.deepEqual(operations.sort(), ["Horizon", "SELECT", "wallet-registry"]);
assert.deepEqual(queryCalls, [{ id: "stellar.defindex.position.read", input: {}, userId: owner }]);

const cctp = await import("../app/api/agent/bridge/cctp/route");
const readinessResponse = await cctp.POST(request("/api/agent/bridge/cctp", { action: "readiness" }));
assert.equal(readinessResponse.status, 200);
const readiness = await readinessResponse.json();
assert.equal(readiness.readiness.destinationGasReady, null);
assert.equal(readiness.readiness.destinationTrustlineReady, null);
assert.equal(readiness.readiness.sourceUsdcBalance, "0");
assert.deepEqual(readiness.errors, ["stellar_horizon_unavailable"]);
assert.equal(readiness.transactionPrepared, false);
const feesResponse = await cctp.POST(request("/api/agent/bridge/cctp", { action: "fees" }));
assert.equal(feesResponse.status, 200);
const fees = await feesResponse.json();
assert.equal(fees.options[0].minimumFeeUsdc, "0.000000");
assert.deepEqual(queryCalls.map(call => call.id), ["stellar.defindex.position.read", "circle.cctp.readiness.read", "circle.cctp.fees.read"]);
assert.deepEqual(operations.sort(), ["Horizon", "SELECT", "wallet-registry"], "CCTP read branches must not enter the separate plan/context lifecycle");

rejectAuthentication = true;
const count = queryCalls.length;
assert.equal((await defindex.GET(request("/api/agent/defindex"))).status, 401);
assert.equal((await cctp.POST(request("/api/agent/bridge/cctp", { action: "readiness" }))).status, 401);
assert.equal(queryCalls.length, count, "Authentication must precede all shared queries and owner lookup");
