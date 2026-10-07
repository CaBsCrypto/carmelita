import { compareChains } from "@/app/market-data/defillama";
import { getMarketQuotes, searchMarketAssets } from "@/app/market-data/service";
import { chainComparisonInputSchema, marketQuotesInputSchema, marketSearchInputSchema, type MarketOptions } from "@/app/market-data/types";
import { defineQuery } from "./types";

/** Programmatic source injection for contract verification; never a user/tool input. */
export function createMarketQueries(options: MarketOptions = {}) {
  return [
    defineQuery({
      id: "offchain.market.search", toolName: "search_market_assets",
      title: "Search market assets",
      description: "Resolve a name, ticker, provider ID or Mainnet network and token address. Return identified candidates when ambiguous; never select automatically. Verified absence is not_found; provider failure alone is unavailable. Returned inactive catalog identities produce not_found with reason='inactive' and inactiveCandidates, never active candidates. Preserve an accompanying error as partial provider coverage; inactive evidence does not establish absence across every catalog. No Testnet wallet is valued or created.",
      inputSchema: marketSearchInputSchema, scope: "agent:read", dataScope: "mainnet_market_data",
      execute: (input, context) => searchMarketAssets(input.asset, input.limit, { ...options, signal: context.signal ?? options.signal }),
    }),
    defineQuery({
      id: "offchain.market.quote", toolName: "get_market_quotes",
      title: "Get fresh market quotes",
      description: "Read USD market data for 1 to 10 assets. Preserve identities, sources, timestamps, cache and per-asset status. Ask for a candidate ID when ambiguous; null is unavailable, never zero. Returned inactive catalog identities are unavailable with reason='inactive' and inactiveCandidates, without a quote or fallback price. Preserve an accompanying error as partial provider coverage; inactive evidence does not establish absence across every catalog. A verified absent identity is not_found; provider failures are unavailable. Mainnet data do not value Testnet funds.",
      inputSchema: marketQuotesInputSchema, scope: "agent:read", dataScope: "mainnet_market_data",
      execute: (input, context) => getMarketQuotes(input.assets, { ...options, signal: context.signal ?? options.signal }),
    }),
    defineQuery({
      id: "offchain.defillama.chains", toolName: "compare_chains",
      title: "Compare chain TVL and associated token market cap",
      description: "Compare DefiLlama Mainnet TVL separately from associated token global capitalization. Default TVL ordering, 10 rows, maximum 20. Base has no own token cap. Respect partial, stale and unavailable results; do not invent a TVL update timestamp.",
      inputSchema: chainComparisonInputSchema, scope: "agent:read", dataScope: "mainnet_market_data",
      execute: (input, context) => compareChains(input, { ...options, signal: context.signal ?? options.signal }),
    }),
  ];
}

export const marketQueries = createMarketQueries();
