# Mainnet market queries

Carmelita's wallet registry remains Testnet. Market prices and chain analytics are
public Mainnet data, independent of wallet preparation, balances and permissions.
They never value Testnet funds or authorize a transaction.

## Sources and identity

CoinGecko is primary: resolve an active catalog asset by name, symbol, provider ID
or exact platform/address before querying market data. Existing canonical aliases
remain valid for BTC, ETH, XLM, SOL, AVAX, BNB, USDC, USDT, XRP, ADA and DOGE.
Other repeated symbols return candidates. A network name is a filter, not the
token requested: USDC on Solana is not SOL.

CoinMarketCap uses its official `https://pro-api.coinmarketcap.com/public-api`
root, `/v1/cryptocurrency/map` for symbol candidates and
`/v3/cryptocurrency/quotes/latest` for ID-based quotes. Its documented public
`/v2/cryptocurrency/info` resolves explicit IDs, names and platform contracts:
live checks found that `/map` ignores ID and slug parameters on the public root.
It must verify the same asset before replacing CoinGecko; choosing the first
symbol match is unsafe.

DefiLlama supplies chain TVL from `https://api.llama.fi/v2/chains`, and a final
price-only fallback from `https://coins.llama.fi/prices/current`. Price fallback
does not manufacture market cap, volume or percentage changes. Missing values
remain null. TVL responses have a fetch time; they do not supply an update time
per chain.

The chain comparison separates chain TVL, associated token and gas token. Token
market cap is global for that token, not total capitalization of the network.
Base has no associated token cap; ETH gas does not assign ETH's cap to Base.

## Interfaces

The authenticated chat accepts an optional `locale` (`en`, `es`, `pt`), preserving
existing requests. Market requests accept up to ten assets and produce per-asset
results, candidates, source URLs, data/fetch timestamps and availability.

The personal MCP endpoint adds three tools, all requiring the existing
`agent:read` scope and user principal:

| Tool | Input | Behavior |
| --- | --- | --- |
| `search_market_assets` | `asset`, optional `limit` (1–20; default 10) | Find identities; candidates do not imply a quote |
| `get_market_quotes` | `assets` (1–10), optional `locale` | Resolve and query; ambiguous/unavailable/stale results remain explicit |
| `compare_chains` | optional `chains`, `sortBy`, `limit`, `locale` | TVL default sorting; token cap optional sorting; default 10, maximum 20 rows |

Asset inputs accept `query`, `coingeckoId`, `cmcId`, or `network` plus `address`.
Stellar issued assets also use `issuer` with a code and network, only when the
provider's catalog can verify the identity. There is no owner selector or token
parameter in any market tool. Authentication credentials never enter an adapter.

All three tools are read only. Actual ChatGPT acceptance requires fresh calls
from an authorized connection to the tested deployment; discovering a capability
or reading an old conversation does not prove a new quote.

## Availability and operation

Public quote cache: 60 seconds; chain TVL: 5 minutes; catalogs: 24 hours. Public
catalog lookup results and quotes use Vercel's shared Data Cache. The full
CoinGecko catalog uses a manifest and content-addressed shards below the cache
item limit; a bounded process copy is the fallback when a shard is evicted.
Time buckets and stored cache timestamps prevent expired stale-while-revalidate
values from being accepted. Responses report cache use, original fetch/data
timestamps and the current query timestamp separately. A quote older than five
minutes is stale, never presented as current. Requests share a 20-second budget;
rate limits, timeouts and missing data return partial or unavailable results.

Capitalization rankings include coverage and failures before truncating the
ranked output. Missing quotes outside the displayed rows still mark a partial
result; a partial capitalization ranking is not presented as a complete ranking.
TVL rankings quote the selected rows, since token prices do not affect TVL order.

The optional server-only `COINGECKO_API_KEY` is a Demo key. No paid subscription
is required by this sprint. CoinMarketCap public and DefiLlama endpoints are
keyless. Never add a provider key to a `NEXT_PUBLIC_*` variable.

The existing symbol-based watchlist continues for canonical assets. New
contracts and ambiguous IDs cannot be saved to that legacy table. No migration
is introduced.

## Release gate

This sprint builds on PR35, commit `55075e9`. Keep the new PR separate and preserve
the published deployment until isolated Preview acceptance and the remaining UI
gates pass. Retain a production wallet/identity/permission baseline and compare
it after read-only tests. Real ChatGPT, independent onboarding, mobile keyboard,
zoom and bootstrap recovery gates must be recorded separately when incomplete.

Official references:

- [CoinGecko catalog](https://docs.coingecko.com/demo/reference/coins-list)
- [CoinMarketCap public API](https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api)
- [DefiLlama free API](https://raw.githubusercontent.com/DefiLlama/api-docs/main/llms-free.txt)
