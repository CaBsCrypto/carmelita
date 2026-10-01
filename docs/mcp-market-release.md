# Read-only market queries from ChatGPT

This release starts from production `1a412285` and extracts the shared public-data services from PR36. It exposes three authenticated MCP tools without changing the chat UI, voice input, wallet bootstrap, database schema, OAuth issuer, scopes or subject links. PR35 and PR37 remain separate releases.

| Tool | Input | Result |
| --- | --- | --- |
| `search_market_assets` | `asset`: name/ticker, provider ID, or Mainnet network/address | Identified candidates; repeated symbols require selection |
| `get_market_quotes` | `assets`: 1–10 identities | USD prices, available metrics, provider, source URL, data/lookup timestamps, cache and per-asset status |
| `compare_chains` | Optional `chains`, `sortBy` (`tvl` default or `marketCap`), `limit` (10 default, 20 maximum) | DefiLlama TVL separately from associated-token market capitalization |

All tools require the existing `agent:read` scope and a personal authenticated principal. There is no owner selector and providers receive neither user identity nor authorization tokens. Tools do not create wallets, value Testnet funds or execute transactions.

CoinGecko is primary. CoinMarketCap's documented keyless public API provides identity-preserving fallback. DefiLlama supplies chain TVL and last-resort prices, never fabricated capitalization. Public cache TTLs are 60 seconds for prices, 5 minutes for TVL and 24 hours for catalogs. Queries have a 20-second deadline. Prices older than 5 minutes are stale; null metrics are unavailable, not zero. TVL reports only its fetch time when the provider supplies no update timestamp. Base has no own token capitalization; gas tokens are distinct from associated tokens.

Example prompts: “Precios de XLM, SOL, AVAX, BNB y ETH”; “USDC en Solana”; “Busca tokens PEPE”; “Compara Solana, Avalanche, Base y BNB por TVL y capitalización”. Contract and mint queries refer to Mainnet assets; Stellar code/issuer queries require catalog recognition.

Release gates: lint, tests and build; exact-commit CI; protected Preview with verified separate QA database; unauthenticated and insufficient-scope rejection; production candidate with unchanged configuration and wallet reference; rollback retained. After publication, ChatGPT must refresh tool discovery and execute new price, candidate-selection and chain-comparison calls using the existing cabscrypto connection. Provider availability is reported per asset and coverage is not universal.

Backend acceptance does not close the independent UI, mobile keyboard, tester onboarding, other ChatGPT account or real elapsed-token-expiry acceptance gates. Record new OAuth consent only through the visible flow and do not broaden permissions.
