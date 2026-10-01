import assert from "node:assert/strict";
import test from "node:test";
import {
  AAVE_V3_FUJI_POOL,
  DEFILLAMA_PROTOCOLS_URL,
  FUJI_RPC_URL,
  getAaveFujiMarketRead,
  getDefiLlamaYieldsRead,
  getLfjQuoteRead,
  getPredictionMarketsRead,
  getPredictionSectorRead,
} from "../app/connectors/avalanche-ecosystem";
import { parseAvalancheEcosystemReadIntent } from "../app/connectors/avalanche-read-intents";

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
}

function jsonRpc(result: string) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    headers: { "content-type": "application/json" },
  });
}

test("prediction sector read recomputes the Avalanche share from DefiLlama", async () => {
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    assert.equal(url, DEFILLAMA_PROTOCOLS_URL);
    return json([
      { name: "Polymarket", category: "Prediction Market", chains: ["Polygon"], tvl: 400000000, url: "https://polymarket.com" },
      { name: "dripit", category: "Prediction Market", chains: ["Avalanche"], tvl: 200.4, url: "https://dripit.io" },
      { name: "Uniswap", category: "Dexes", chains: ["Ethereum"], tvl: 5000000000, url: "https://uniswap.org" },
    ]);
  };
  const result = await getPredictionSectorRead(fetcher);
  assert.equal(result.readOnly, true);
  assert.equal(result.protocolCount, 2);
  assert.ok(result.avalanche, "Avalanche must appear in the sector");
  assert.equal(typeof result.avalanche!.tvl, "number");
  assert.notEqual(result.avalanche!.tvl, null);
  assert.ok(Math.abs(result.avalanche!.tvl! - 200.4) < 0.01);
  assert.equal(result.byChain[0]?.chain, "Polygon");
});

test("prediction markets read returns venues labeled as mainnet", async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    assert.ok(url.startsWith("https://gamma-api.polymarket.com"));
    return json([{ id: "e1", title: "Will X?", markets: [{ id: "m1", question: "Will X?", outcomePrices: "0.5,0.5", active: true }] }]);
  };
  const result = await getPredictionMarketsRead(fetcher);
  assert.equal(result.venue, "Polymarket Gamma");
  assert.equal(result.markets[0]?.id, "m1");
  assert.match(result.network, /mainnet/);
});

test("Aave market read decodes live Fuji reserves through eth_call", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    const body = JSON.parse(String(init?.body));
    const data = body.params[0].data;
    // getReserveConfigurationData(address) -> 10 outputs, all zero except
    // decimals=6, isActive=true (9th), isFrozen=false (10th).
    if (data.startsWith("0x3e150141")) {
      return jsonRpc(
        "0x0000000000000000000000000000000000000000000000000000000000000006" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000001" +
        "0000000000000000000000000000000000000000000000000000000000000000",
      );
    }
    // getReserveData(address) -> tuple. aTokenAddress is field 9.
    if (data.startsWith("0x35ea6a75")) {
      return jsonRpc(
        "0x0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000" +
        "0000000000000000000000000000000000000000000000000000000000000000",
      );
    }
    throw new Error("unexpected call");
  };
  const result = await getAaveFujiMarketRead(fetcher);
  assert.equal(result.pool, AAVE_V3_FUJI_POOL);
  assert.equal(result.reserves.length, 4);
  assert.ok(calls.every((url) => url === FUJI_RPC_URL));
  const usdc = result.reserves.find((row) => row.symbol === "USDC")!;
  assert.equal(usdc.isActive, true);
  assert.equal(usdc.isFrozen, false);
  assert.equal(usdc.decimals, 6);
});

test("DefiLlama yields read filters Avalanche and labels origin chain", async () => {
  const fetcher: typeof fetch = async () =>
    json({ data: [
      { chain: "Avalanche", project: "Aave", symbol: "USDC", tvlUsd: 100, apy: 5.2, apyBase: 5.0 },
      { chain: "Ethereum", project: "Lido", symbol: "stETH", tvlUsd: 900, apy: 3.1 },
    ] });
  const result = await getDefiLlamaYieldsRead(fetcher);
  assert.equal(result.chain, "avalanche");
  assert.equal(result.pools.length, 1);
  assert.equal(result.pools[0]?.symbol, "USDC");
  assert.match(result.network, /mainnet/);
});

test("LFJ quote is a liveness check, not a price claim", async () => {
  const fetcher: typeof fetch = async () =>
    json({ price: 12.34, routes: [] });
  const result = await getLfjQuoteRead({ amountIn: "1", assetIn: "AVAX", assetOut: "USDC" }, fetcher);
  assert.equal(result.assetIn, "AVAX");
  assert.equal(result.assetOut, "USDC");
  assert.match(result.livenessNote, /not Circle USDC/);
  assert.equal(result.readOnly, true);
});

test("ecosystem parser is deterministic and scoped to Avalanche", () => {
  assert.equal(parseAvalancheEcosystemReadIntent("¿Cuánta TVL hay en mercados de predicción en Avalanche?")?.operation, "predictions.sector");
  assert.equal(parseAvalancheEcosystemReadIntent("Show Aave V3 Fuji market state")?.operation, "aave.market");
  assert.equal(parseAvalancheEcosystemReadIntent("Muestra la posición Aave de 0x1111111111111111111111111111111111111111 en Fuji")?.operation, "aave.position");
  assert.equal(parseAvalancheEcosystemReadIntent("Lista mercados de predicción en Avalanche")?.operation, "predictions.markets");
  assert.equal(parseAvalancheEcosystemReadIntent("Dame yields en Avalanche")?.operation, "defillama.yields");
  assert.equal(parseAvalancheEcosystemReadIntent("LFJ liveness check AVAX to USDC")?.operation, "lfj.liveness");
  assert.equal(parseAvalancheEcosystemReadIntent("Lista los pares de Dexalot en Avalanche"), null);
  assert.equal(parseAvalancheEcosystemReadIntent("Muestra mi wallet Avalanche"), null);
});

test("ecosystem route has no execution surface", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../app/connectors/avalanche-ecosystem.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /sendTransaction|eth_sendTransaction|privateKey|secretKey/i);
});
