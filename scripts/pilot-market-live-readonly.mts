import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import type { MarketQuotes, MarketSearch } from "../app/market-data/types";

// Public GET-only upstream probe of a pinned source tree. No sessions or DB calls.
const root = "C:/Users/MGC/Documents/ChatGPT/Carmelita";
const candidate = path.resolve(process.argv[2] ?? "");
const expectedCommit = process.argv[3];
assert.equal(process.argv.length, 4);
assert.equal(candidate.toLowerCase(), path.resolve(root, "work/pilot-readiness").toLowerCase());
assert.match(expectedCommit, /^[a-f0-9]{40}$/);
const actualCommit = () => execFileSync("git", ["rev-parse", "HEAD"], { cwd: candidate, encoding: "utf8", windowsHide: true }).trim();
assert.equal(actualCommit(), expectedCommit);
const assertCleanProductSource = () => assert.equal(execFileSync("git", ["diff", "--name-only", "HEAD", "--", "app"],
  { cwd: candidate, encoding: "utf8", windowsHide: true }).trim(), "");
assertCleanProductSource();
const originalFetch = fetch;
const requestCounts: Record<string, number> = {};
const fetcher: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.protocol, "https:");
  assert.ok(["api.coingecko.com", "pro-api.coinmarketcap.com", "coins.llama.fi", "api.llama.fi"].includes(url.hostname));
  assert.equal(url.username, ""); assert.equal(url.password, "");
  assert.equal(init?.method, "GET"); assert.equal(init?.credentials, "omit");
  assert.equal(init?.redirect, "error"); assert.equal(init?.body, undefined);
  if (url.hostname === "pro-api.coinmarketcap.com") assert.match(url.pathname, /^\/public-api\//);
  requestCounts[url.hostname] = (requestCounts[url.hostname] ?? 0) + 1;
  return originalFetch(input, init);
};
const startedUtc = new Date().toISOString();
const { createMarketQueries } = await import(pathToFileURL(path.join(candidate, "app/queries/market.ts")).href);
const definitions = createMarketQueries({ fetcher, now: Date.now });
const search = definitions.find((row: { id: string }) => row.id === "offchain.market.search")!;
const quote = definitions.find((row: { id: string }) => row.id === "offchain.market.quote")!;
const context = { userId: "public-probe-fixture", locale: "es" as const };
const records: Array<Record<string, unknown>> = [];
function identity(row: { id: string; name: string; symbol: string; coingeckoId: string | null; cmcId: number | null }) {
  return { id: row.id, name: row.name, symbol: row.symbol, coingeckoId: row.coingeckoId, cmcId: row.cmcId };
}
function project(result: MarketSearch | MarketQuotes) {
  if ("results" in result) return { dataScope: result.dataScope, results: result.results.map(row => ({
    status: row.status, reason: (row as { reason?: string }).reason, error: row.error,
    asset: row.asset ? identity(row.asset) : undefined, candidates: row.candidates?.map(identity),
    inactiveCandidates: (row as { inactiveCandidates?: Parameters<typeof identity>[0][] }).inactiveCandidates?.map(identity),
    quote: row.quote ? { price: row.quote.price, marketCap: row.quote.marketCap, volume24h: row.quote.volume24h,
      source: row.quote.source, sourceUrl: row.quote.sourceUrl, updatedAt: row.quote.updatedAt,
      fetchedAt: row.quote.fetchedAt, fromCache: row.quote.fromCache, dataScope: row.quote.dataScope } : undefined,
  })) };
  return { status: result.status, reason: (result as { reason?: string }).reason, error: result.error,
    candidates: result.candidates.map(identity),
    inactiveCandidates: (result as { inactiveCandidates?: Parameters<typeof identity>[0][] }).inactiveCandidates?.map(identity) };
}
const quoteCases = [
  { label: "PAY ticker", assets: [{ query: "PAY" }] },
  { label: "TenX name", assets: [{ query: "TenX" }] },
  { label: "TenX exact CMC ID", assets: [{ cmcId: 1758 }] },
  { label: "AI ambiguous ticker", assets: [{ query: "AI" }] },
  { label: "unknown valid slug", assets: [{ query: "pilot-token-absence-2026-10-04" }] },
  { label: "unknown valid CoinGecko ID", assets: [{ coingeckoId: "pilot-token-absence-2026-10-04" }] },
  { label: "four canonical tickers", assets: [{ query: "XLM" }, { query: "SOL" }, { query: "AVAX" }, { query: "BNB" }] },
  { label: "Solana USDC exact public mint", assets: [{ query: "uSd CoIn", network: "sOlAnA", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }] },
  { label: "partial batch", assets: [{ query: "XLM" }, { query: "pilot-token-absence-2026-10-04" }] },
];
for (const entry of quoteCases) {
  const result = await quote.execute({ assets: entry.assets }, context) as MarketQuotes;
  for (const row of result.results) {
    assert.equal(row.quote?.dataScope ?? result.dataScope, "mainnet_market_data");
    if (row.status === "ambiguous") assert.equal(row.quote, undefined);
    if ((row as { reason?: string }).reason === "inactive") assert.equal(row.quote, undefined);
  }
  records.push({ label: entry.label, ...project(result) });
}
for (const asset of [{ query: "PAY" }, { query: "TenX" }, { cmcId: 1758 }]) {
  const result = await search.execute({ asset }, context) as MarketSearch;
  if ((result as { reason?: string }).reason === "inactive") assert.deepEqual(result.candidates, []);
  records.push({ label: "inactive search " + (asset.query ?? "cmc1758"), ...project(result) });
}
const requestsBeforeInvalid = Object.values(requestCounts).reduce((sum, count) => sum + count, 0);
assert.throws(() => quote.execute({ assets: [{ coingeckoId: "INVALID ID!" }] }, context));
assert.equal(Object.values(requestCounts).reduce((sum, count) => sum + count, 0), requestsBeforeInvalid);
assert.equal(actualCommit(), expectedCommit);
assertCleanProductSource();
const evidence = { startedUtc, utc: new Date().toISOString(), commit: expectedCommit,
  mode: "pinned_source_public_provider_GET_only", requestCounts, records,
  checks: { publicGetAllowlistEnforced: true, invalidInputRejectedBeforeProviderIO: true,
    inactiveAndAmbiguousNeverQuoted: true, sourceCommitStayedPinned: true },
  limitations: ["This invokes the integrated shared source directly; it does not prove a deployed candidate, web session, ChatGPT connection or phone/tester acceptance.",
    "Public provider availability and catalogs can change; observed unavailable results remain explicit and do not prove absence."],
  mutations: { database: false, authentication: false, financial: false, sessions: false, walletRegistry: false, deployment: false } };
const file = path.join(root, "work", `pilot-market-live-source-${expectedCommit.slice(0,7)}-${Date.now()}.json`);
fs.writeFileSync(file, JSON.stringify(evidence, null, 2), { flag: "wx" });
console.log(JSON.stringify({ file, ...evidence }, null, 2));
