import test from "node:test";
import assert from "node:assert/strict";
import {
  AAVE_V3_FUJI_DATA_PROVIDER,
  AAVE_V3_FUJI_POOL,
  FUJI_RPC_URL,
  getAaveFujiMarketRead,
  getAaveFujiPositionRead,
} from "../app/connectors/avalanche-ecosystem";
import { AAVE_V3_FUJI_POOL as transactionPool } from "../app/connectors/aave-fuji";

// Reviewed official deployment and ABI fixtures; independent of reader constants.
const pool = "0x8b9b2af4afb389b4a70a474dfd4adcd4a302bb40";
const dataProvider = "0xc65cbd1e309bf0e841ee6f6e786480598e6a4014";
const underlying = [
  "0x5425890298aed601595a70ab815c96711a31bc65",
  "0x5e44db7996c682e92a960b65ac713a54ad815c6b",
  "0xd00ae08403b9bbb9124bb305c09058e32c39a48c",
  "0x22913d4e21d44ef7662b118a6540450e25fe09a9",
];
const aTokens = underlying.map((_, index) => `0x${String(index + 1).repeat(40)}`);
const owner = `0x${"a".repeat(40)}`;
const word = (value: bigint | string) => typeof value === "bigint"
  ? value.toString(16).padStart(64, "0") : value.replace(/^0x/, "").padStart(64, "0");
const rpc = (result: string) => Response.json({ jsonrpc: "2.0", id: 1, result });
const zero = BigInt(0);
const liquidityRate = BigInt("120000000000000000000000000");
const borrowingRate = BigInt("180000000000000000000000000");

function validRpcFixture(balance = zero) {
  const calls: { to: string; selector: string; asset?: string }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(String(url), FUJI_RPC_URL);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.method, "eth_call");
    assert.equal(body.params[1], "latest");
    const { to, data } = body.params[0] as { to: string; data: string };
    const selector = data.slice(0, 10);
    const asset = `0x${data.slice(-40)}`.toLowerCase();
    calls.push({ to: to.toLowerCase(), selector, asset });
    const index = underlying.indexOf(asset);
    if (selector === "0x3e150141") {
      assert.equal(to.toLowerCase(), dataProvider, "configuration belongs to DataProvider, never Pool");
      assert.ok(index >= 0, "only the reviewed current reserves are queried");
      return rpc("0x" + [index < 2 ? 6 : 18, 8250, 8600, 10500, 1000, 1, 1, 0, 1, 0].map(value => word(BigInt(value))).join(""));
    }
    if (selector === "0x35ea6a75") {
      assert.equal(to.toLowerCase(), pool, "getReserveData belongs to the current Pool");
      assert.ok(index >= 0);
      // ReserveDataLegacy has 15 static ABI words; aToken is the ninth word.
      return rpc("0x" + [
        zero, BigInt(10) ** BigInt(27), liquidityRate, BigInt(10) ** BigInt(27), borrowingRate, zero,
        BigInt(1_790_881_000), BigInt(index), aTokens[index], zero, zero, zero, zero, zero, zero,
      ].map(word).join(""));
    }
    if (selector === "0x70a08231") {
      assert.ok(aTokens.includes(to.toLowerCase()), "balance read uses the aToken returned by Pool");
      assert.equal(asset, owner, "balanceOf must retain the supplied owner");
      return rpc("0x" + word(balance));
    }
    assert.fail("unexpected RPC selector");
  };
  return { fetcher, calls };
}

test("Aave read configuration and reserve ABI target distinct current Fuji contracts", async () => {
  const { fetcher, calls } = validRpcFixture();
  const result = await getAaveFujiMarketRead(fetcher);
  assert.equal(AAVE_V3_FUJI_POOL.toLowerCase(), pool);
  assert.equal(AAVE_V3_FUJI_DATA_PROVIDER.toLowerCase(), dataProvider);
  assert.deepEqual(result.reserves.map(reserve => reserve.symbol), ["USDC", "EURC", "WAVAX", "USDX"]);
  assert.deepEqual(result.reserves.map(reserve => reserve.decimals), [6, 6, 18, 18]);
  assert.deepEqual(result.reserves.map(reserve => reserve.aTokenAddress.toLowerCase()), aTokens);
  assert.equal(calls.filter(call => call.to === dataProvider).length, 4);
  assert.equal(calls.filter(call => call.to === pool).length, 4);
  assert.equal(result.reserves[0].id, 0);
  assert.equal(result.reserves[3].id, 3);
  assert.equal(result.reserves[0].isActive, true);
  assert.equal(result.reserves[0].borrowingEnabled, true);
  assert.equal(result.reserves[0].liquidityRateBps, 1200);
  assert.equal(result.reserves[0].currentLiquidityRate, liquidityRate.toString());
  assert.equal(result.reserves[0].currentVariableBorrowRate, borrowingRate.toString());
  assert.doesNotThrow(() => JSON.stringify(result), "both adapters must be able to serialize live reserve results");
});

test("Aave personal read retains exact aToken balances and does not prepare transactions", async () => {
  const exactBalance = BigInt("9007199254740993");
  const { fetcher, calls } = validRpcFixture(exactBalance);
  const result = await getAaveFujiPositionRead(owner, fetcher);
  assert.equal(result.readOnly, true);
  assert.deepEqual(result.supplied, ["USDC", "EURC", "WAVAX", "USDX"]);
  assert.ok(result.rows.every(reserve => reserve.aTokenBalance === exactBalance.toString()));
  assert.equal(calls.filter(call => call.selector === "0x70a08231").length, 4);
  assert.doesNotThrow(() => JSON.stringify(result));
  // Updating reader deployment must not change the separate financial workflow.
  assert.equal(transactionPool, "0xb47673b7a73D78743AFF1487AF69dBB5763F00cA");
});

test("Aave malformed ABI data fails instead of returning empty or zero reserve state", async () => {
  const fetcher: typeof fetch = async () => rpc("0x");
  await assert.rejects(getAaveFujiMarketRead(fetcher));
});

test("Aave RPC reverts and HTTP limits fail without fallback to an obsolete Pool", async () => {
  const destinations: string[] = [];
  const reverted: typeof fetch = async (_url, init) => {
    destinations.push(JSON.parse(String(init?.body)).params[0].to.toLowerCase());
    return Response.json({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } });
  };
  await assert.rejects(getAaveFujiMarketRead(reverted), /ecosystem_rpc_failed/);
  assert.ok(destinations.every(to => to === pool || to === dataProvider));
  await assert.rejects(getAaveFujiMarketRead(async () => new Response(null, { status: 429 })), /ecosystem_rpc_http_429/);
});
