import { compareChains } from "@/app/market-data/defillama";
import { getMarketQuotes, searchMarketAssets } from "@/app/market-data/service";
import { chainComparisonInputSchema, marketQuotesInputSchema, marketSearchInputSchema } from "@/app/market-data/types";
import { defineQuery } from "./types";

export const marketQueries = [
  defineQuery({
    id: "offchain.market.search", toolName: "search_market_assets",
    title: "Search market assets",
    description: "Resolve a name, ticker, provider ID or Mainnet network and token address. Return identified candidates when ambiguous; never select automatically. No Testnet wallet is valued or created.",
    inputSchema: marketSearchInputSchema, scope: "agent:read", dataScope: "mainnet_market_data",
    execute: (input, context) => searchMarketAssets(input.asset, input.limit, { signal: context.signal }),
  }),
  defineQuery({
    id: "offchain.market.quote", toolName: "get_market_quotes",
    title: "Get fresh market quotes",
    description: "Read USD market data for 1 to 10 assets. Preserve identities, sources, timestamps, cache and per-asset status. Ask for a candidate ID when ambiguous; null is unavailable, never zero. Mainnet data do not value Testnet funds.",
    inputSchema: marketQuotesInputSchema, scope: "agent:read", dataScope: "mainnet_market_data",
    execute: (input, context) => getMarketQuotes(input.assets, { signal: context.signal }),
  }),
  defineQuery({
    id: "offchain.defillama.chains", toolName: "compare_chains",
    title: "Compare chain TVL and associated token market cap",
    description: "Compare DefiLlama Mainnet TVL separately from associated token global capitalization. Default TVL ordering, 10 rows, maximum 20. Base has no own token cap. Respect partial, stale and unavailable results; do not invent a TVL update timestamp.",
    inputSchema: chainComparisonInputSchema, scope: "agent:read", dataScope: "mainnet_market_data",
    execute: (input, context) => compareChains(input, { signal: context.signal }),
  }),
];
