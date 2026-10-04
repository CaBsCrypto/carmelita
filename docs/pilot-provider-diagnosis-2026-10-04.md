# Provider diagnosis — 2026-10-04

PAY resolves to three inactive CoinMarketCap records. A successful metadata lookup by `tenx` or CMC ID `1758` still describes TenX; it does not establish that the asset is active. The pilot must keep these identities out of active candidates and must not request a quote for them.

## Evidence and scope

These observations were collected with read-only GET requests, an `Accept: application/json` header, and no credentials. The fixture at `tests/fixtures/providers/pilot-metadata-2026-10-04.json` preserves provider status objects, response timestamps, HTTP status, and exact URLs. Successful metadata/search bodies are explicitly marked as projections; identity and activity fields were retained, while unrelated metadata and image URLs were omitted. Synthetic failure cases are labeled and are not claimed as live responses.

Three initial sandbox attempts at 21:12:26Z failed locally before reaching the provider (socket permission error, no HTTP status). An approved read-only network run made eight CMC calls at 21:12:42–21:13:06Z and three CoinGecko calls at 21:13:47–48Z. No retries, quote requests, account creation, paid access, transactions, or secret reads were performed. Three CMC requests repeated the coordinator's independent PAY/unknown probes once; the other calls were distinct controls. No 401, 429, or outage was induced. The run stopped after the bounded controls succeeded.

| Request | Observed result | Meaning |
| --- | --- | --- |
| CMC map `symbol=PAY&aux=platform,is_active` | 200, IDs 1758/17978/19749, all `is_active: 0` | TenX, PayBolt, PocketPay exist but are inactive |
| CMC info `slug=pay` | 400, exact invalid-slug echo | PAY is not a slug; lookup absence for this valid singleton slug |
| CMC info unknown valid slug | 400, exact invalid-slug echo | Same narrowly identifiable absence shape |
| CMC info `slug=tenx&aux=platform` | 200, ID 1758, symbol PAY, `is_hidden: 0`, no `is_active` | Known identity, activity still needs map validation |
| CMC info `id=1758&aux=platform` | 200, same identity | A numeric CMC ID does not bypass activity validation |
| CMC map `symbol=BTC&aux=platform,is_active` | 200, nine active and four inactive records | Partition by activity before ambiguity decisions |
| CMC info malformed slug `pay token` | 400, same invalid-slug echo format | Local syntax validation is essential |
| CMC info `slug=bitcoin&aux=not-a-valid-field` | 400, invalid `aux` message | Generic HTTP 400 is not absence |
| CoinGecko search PAY | 200, 25 fuzzy coins, zero exact PAY symbols | Do not substitute PayPal USD/PYUSD or another fuzzy result |
| CoinGecko search TenX / unknown slug | 200, empty `coins` | No matching searchable identity; this alone does not prove inactivity |

## Documented identifier and activity rules

[CMC cryptocurrency reference](https://coinmarketcap.com/api/documentation/pro-api-reference/cryptocurrency) documents numeric `id` and lowercase `slug` for metadata. Its v2 symbol lookup can return several coins. Map accepts `symbol` but has no documented name/slug/ID filter; a symbol filter overrides other options, and `aux` can request `is_active`. Resolve names/slugs/IDs through an appropriate identity lookup, then map the returned symbol and match the exact CMC ID. The map's default active listing is insufficient when a symbol filter is used. `is_hidden` is a metadata visibility field, not the map's activity flag.

[CMC keyless documentation](https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api) lists map, metadata, and latest quotes under `https://pro-api.coinmarketcap.com/public-api`. Removing `/public-api` selects the keyed API, so an earlier no-key 401 from that root is not evidence that the public route requires credentials. Keyless calls share an IP-based pool; no fixed numeric quota is published there. Cache identity results and use bounded exponential backoff for 429.

[CoinGecko search reference](https://docs.coingecko.com/reference/search-data) defines `query` and returns coin IDs/names/symbols, sorted by market cap. [CoinGecko coins list](https://docs.coingecko.com/reference/coins-list) explains that the ordinary list contains active coins and that the inactive list requires Analyst or above. The pilot therefore cannot infer inactivity from an empty public search or obtain the paid inactive catalog within this correction. Preserve a CoinGecko ID as a provider-specific identifier; do not equate it with a CMC ID.

[CMC error documentation](https://coinmarketcap.com/api/documentation/guides/errors-and-rate-limits) distinguishes invalid arguments, authentication, throttling, and server failures. [CoinGecko errors and limits](https://docs.coingecko.com/docs/errors-and-rate-limits) also distinguishes these outcomes and states that failed requests count toward the IP/plan rate pool. Do not repeatedly probe to manufacture failures.

## Deterministic handling for the correction

1. Normalize identifiers without changing identity. For a single CMC slug, require `^[a-z0-9][a-z0-9-]*$`; reject whitespace, commas, apostrophes, or a leading hyphen before making an absence decision. Numeric IDs must be positive integer identifiers. Preserve Solana mint case exactly.
2. Treat a failed CMC info lookup as provider absence only when HTTP status is 400, `status.error_code` is 400, the request is a valid singleton slug lookup with only known-valid auxiliary parameters, and the complete decoded message equals `Invalid value for 'slug': '<requested-slug>'`. A mismatched echo, malformed request, invalid aux, symbol/ID failure, or quote-endpoint failure remains unavailable/invalid request.
3. Partition map records into active (`is_active === 1`) and inactive (`is_active === 0`). Missing/malformed activity is unknown and cannot authorize a quote. Match the previously resolved exact CMC ID before accepting activity; another active coin sharing PAY/BTC cannot rescue an inactive selected identity.
4. If only inactive identities match, keep search `status: 'not_found'`, add optional `reason: 'inactive'`, and retain them in `inactiveCandidates`, separate from active `candidates`. Keep quote `status: 'unavailable'` with `reason: 'inactive'`, no price and no provider quote call. Preserve existing status vocabulary and endpoint contracts.
5. If active matches remain, apply existing explicit identity/ambiguity policy to those matches. Fuzzy CoinGecko results are candidate evidence, not permission to replace an exact requested symbol. Retry, outage, and partial identity failure must not become a durable absence cache entry or a guessed quote.
6. Preserve 401/403, 429, network failure, timeout, malformed 200 bodies, nonzero provider status errors, and 5xx as provider failures. A healthy other provider may supply independently verified evidence according to the existing fallback policy; it cannot erase an exact inactive identity or justify an invented match.

Fixture classifications describe provider evidence, not new public API status names. Snapshot timestamps represent this bounded October 4 observation, not a guarantee that a listing remains inactive later.
