# API & integration reference

A single, accurate map of every surface Carmelita exposes and every external
system it calls. Sourced directly from the code (`app/`), not from marketing copy.

Last reviewed: **July 21, 2026**.

## Principles that apply everywhere

- **Runtime.** All API routes and MCP servers run on the Node.js runtime (`export const runtime = "nodejs"`); most agent/connection routes are `dynamic = "force-dynamic"`. The three MCP routes set `maxDuration = 60`.
- **Non-custodial.** The server never holds a private key. Every on-chain write is prepared server-side as an **unsigned XDR** and signed **client-side** through the user's Privy wallet; execute endpoints additionally require an explicit confirmation flag and a signature.
- **Identity.** A user is the Privy `user_id` (`did:privy:…`). `verifyPrivyAccessToken()` (`app/privy-stellar.ts`) validates the bearer and yields `claims.user_id`, the canonical identity every user route keys on.
- **Same-origin + bearer.** Mutating user routes reject cross-origin requests (`Origin` host ≠ `Host` → 403) and then require a valid Privy bearer (401). Read-only GETs generally skip the same-origin check.

## 1. HTTP API routes

| Route | Methods | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/health` | GET | Liveness / health probe | Public |
| `/api/waitlist` | POST | Public waitlist signup (honeypot + size cap) | Public (soft same-origin) |
| `/api/commerce` | GET, POST | Demo commerce backend: search / intent / policy / authorize / execute / receipt | Public (sandbox, no funds) |
| `/api/agent/bootstrap` | POST | Create/fetch the user's Privy Stellar wallet and agent account | Same-origin + Privy bearer |
| `/api/agent/chat` | GET, POST | Read the durable conversation / send a message to the agent | Same-origin + Privy bearer |
| `/api/agent/memory` | GET, POST, PATCH, DELETE | Personal Execution Vault memory CRUD | Same-origin + Privy bearer |
| `/api/agent/autopilot` | GET, POST | Read / update Testnet Autopilot state | Same-origin + Privy bearer |
| `/api/agent/infrastructure` | GET | Readiness snapshot (Soroswap, LangGraph, UNBLCK, OpenZeppelin, MPP, 8004) | Public (status) |
| `/api/agent/travel/search` | POST | Travala hotel search (hotels only) | Same-origin + Privy bearer |
| `/api/agent/soroswap` | GET, POST | `quote` (read) / `prepare` (XDR) / `execute` (submit signed XDR) | Same-origin + Privy bearer; execute needs confirmation + signature |
| `/api/agent/defindex` | GET, POST | Vault positions; `prepare` (deposit/trustline XDR) / `execute` | Same-origin + Privy bearer; execute needs confirmation + signature |
| `/api/agent/x402` | GET, POST | Status; `prepare` / `prepare_trustline` / `execute_trustline` / `execute` / `claim_testnet_usdc` | Same-origin + Privy bearer; execute needs confirmation + 128-hex signature |
| `/api/connections` | GET | List the user's external connections | Privy bearer |
| `/api/connections/notion/start` | POST | Begin Notion OAuth (returns authorization URL) | Same-origin + Privy bearer |
| `/api/connections/notion/callback` | GET | OAuth redirect handler; completes token exchange | Public (state + PKCE validated) |
| `/api/connections/unblck/link` | POST, DELETE, GET | Link / unlink / status of an UNBLCK channel identity (Connect code) | Same-origin (writes) + Privy bearer |
| `/api/connections/telegram/link` | POST, GET, DELETE | Mint a Telegram link code / status / unlink | Same-origin (writes) + Privy bearer |
| `/api/telegram/webhook` | POST | Telegram bot webhook → routes messages into the agent | Shared secret header `x-telegram-bot-api-secret-token` |
| `/api/telegram/mini/session` | POST | Verify a Mini App `initData` HMAC, report link status | Telegram `initData` HMAC (bot-token signed) |
| `/api/mcp` | GET, POST, DELETE | Public sandbox MCP server (§2) | Public sandbox |
| `/api/mcp/agent` | GET, POST, DELETE | Testnet discovery-and-planning MCP server (section 2) | Scoped PAT or first-party Privy bearer → MCP `AuthInfo` |
| `/api/mcp/provider` | GET, POST, DELETE | Service-provider MCP server (§2) | Scoped provider bearer |
| `/.well-known/mcp` | GET | Self-describes the three MCP surfaces | Public |
| `/api/admin/*` | varies | Admin session, provider key issuance, Stellar lab, waitlist ops | Admin identity (cookie or SSO allowlist) |

## 2. Inbound MCP servers

All three use `createMcpHandler` (`disableSse: true`). Agent and provider auth is enforced by `authenticateMcp()` (`app/mcp/auth.ts`), then `requireMcpSubject()` checks the subject type and scope per tool.

### `/api/mcp` — public sandbox (`agente-asistente`)
Demo only: no wallet signatures, no funds moved, 100 USDC demo cap.

| Tool | Purpose | Mutates |
| --- | --- | --- |
| `search_offers` | Search public agent-ready offers | No |
| `get_offer` | Read an offer | No |
| `create_intent` | Prepare an intent (idempotent by `idempotencyKey`) | Prepare-only |
| `evaluate_policy` | Apply expiry / network / demo spend limit | No |
| `demo_authorize_intent` | Demo confirmation (`explicitUserConfirmation: true`) | Demo token |
| `execute_authorized_intent` | Execute the authorized demo intent (idempotent receipt) | Yes (demo) |
| `get_receipt` | Fetch execution evidence | No |

### `/api/mcp/agent` — personal agent (`agent-assistant-personal`)
A scoped PAT defaults to `agent:read`; `agent:plan`, `agent:context` and `agent:conversation` are explicit opt-ins. A first-party Privy bearer receives all four scopes. Subject type is `user`. Chat mutation, transaction preparation, approval, signing and submission are not exposed.

| Tool | Purpose | Scope |
| --- | --- | --- |
| `get_agent_context` | Read profile, wallet metadata, connections and authority boundary | `agent:context` |
| `get_agent_conversation` | Read recent durable conversation history | `agent:conversation` |
| `list_capabilities` / `get_capability` | Discover the versioned Testnet capability catalog | `agent:read` |
| `list_avalanche_capabilities` / `plan_avalanche_capability` | Inspect Avalanche readiness without preparing a transaction | `agent:read` |
| `plan_action` | Persist or replay an idempotent Testnet plan; never execute it | `agent:plan` |

The deployed Gateway contract at commit `50c8402` passed Neon persistence smoke **6/6** and protected Preview REST/MCP acceptance **20/20** on deployment `dpl_AbqxiUd7w9m7uW1cXRka6zWCTYNU`. This evidence covers Testnet discovery, planning, isolation, replay and revocation; it does not cover signing, submission, mainnet or OAuth account linking.

### `/api/mcp/provider` — service provider (`agent-assistant-provider`)
Scoped provider token (DB-verified); subject `provider`.

| Tool | Purpose | Scope |
| --- | --- | --- |
| `get_service_provider` | Read provider identity / status | `provider:read` |
| `list_service_offers` | List the provider's offers | `provider:read` |
| `upsert_service_offer` | Create / update a draft offer (upsert by `externalId`) | `provider:offers:write` |
| `set_service_offer_status` | Publish / pause / archive / draft an offer | `provider:offers:write` |

## 3. Outbound connectors

| Connector | Module | Endpoint | Auth | Operations |
| --- | --- | --- | --- | --- |
| **Notion** | `app/connectors/notion-oauth.ts`, `notion-mcp.ts` | `mcp.notion.com/mcp` | OAuth 2.1 (dynamic registration + PKCE); per-user tokens AES-256-GCM encrypted, auto-refresh | Read-only workspace search |
| **CoinGecko** (primary) | `app/connectors/coingecko.ts` | `api.coingecko.com/api/v3/coins/markets` | Keyless (optional demo key `x-cg-demo-api-key`) | Read-only quotes |
| **CoinMarketCap** (fallback) | `app/connectors/coinmarketcap.ts` | `pro-api.coinmarketcap.com/trial-pro-api` | Keyless trial | Read-only quotes; `getMarketQuote()` tries CoinGecko first, falls back here. Owns the watchlist table |
| **Travala** (hotels only) | `app/travala.ts` | `travel-mcp.travala.com/mcp` | Keyless | Read-only `travala_search_hotel` (the MCP exposes no flights) |
| **UNBLCK** | `app/connectors/unblck.ts`, `unblck-connection.ts` | `UNBLCK_API_BASE_URL` (default `www.unblck.cl/api/agent/v1`) | Partner key `Authorization: Bearer` + `X-Channel` / `X-Channel-User-Id`; gated by `UNBLCK_API_ENABLED` | Read + write: link/unlink channel, hub state, **book**, **cancel** |
| **DeFindex** | `app/connectors/defindex.ts` | Soroban + Horizon Testnet; pinned vault/asset contract IDs | Keyless on-chain; signed client-side via Privy | Read (simulated) vault state; prepare unsigned deposit/trustline XDR; submit client-signed XDR |
| **Soroswap** | `app/connectors/soroswap.ts` | `api.soroswap.finance` (`?network=testnet`) | `Authorization: Bearer <SOROSWAP_API_KEY>` | Read quote; build unsigned swap XDR; submit client-signed XDR |
| **x402** | `app/x402/protocol.ts` (+ helpers) | Arbitrary x402 resource URLs; official Stellar Testnet USDC | Payment signed via the Privy Stellar client signer; frozen requirements re-verified pre-settlement | Read the 402 challenge; sign & settle an exact, single-requirement payment |

## 4. Auth & identity model

- **Wallet.** `getOrCreateUserStellarWallet(userId)` creates/loads a per-user Privy native Stellar wallet on Testnet with a deterministic `external_id` and `owner:{user_id}` — idempotent, never key-exporting.
- **Client-side signing.** `signStellarTransactionHash()` calls Privy `wallets().rawSign()` with the user's own JWT in the authorization context, verifies wallet ownership (`wallet_not_owned_by_authenticated_user`) and checks the signature against the address before returning. Execute endpoints require `explicitConfirmation: true` plus a hex signature.
- **Provider / MCP keys** (`app/services/provider-store.ts`). Raw format `aap_provider_<base64url(32 bytes)>`, stored only as a **SHA-256 hash** plus an 18-char prefix in `mcpAccessTokens`; the raw token is shown once at issuance. Verification looks up by hash, checks status/expiry, and stamps `lastUsedAt`.
- **Connector secrets at rest.** `encryptConnectorSecret` / `decryptConnectorSecret` use **AES-256-GCM** with a 32-byte key from `CONNECTOR_ENCRYPTION_KEY` (format `v1.iv.tag.ciphertext`) — for Notion tokens, PKCE verifiers and the UNBLCK encrypted identity.
- **Admin.** Either a scrypt password (`ADMIN_PASSWORD_HASH`) → HMAC-signed 12-hour cookie (`ADMIN_SESSION_SECRET`), or a ChatGPT-SSO identity whose email is in `ADMIN_EMAILS`.
- **Telegram.** The webhook is gated by the shared secret header; the Mini App is gated by an `initData` HMAC signed with the bot token.

## 5. Environment variables (server-side)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` (or `DATABASE_URL_UNPOOLED` / `DATABASE_URL_DATABASE_URL`) | Neon/Postgres connection; DB features return 503 when absent |
| `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | Privy wallets + access-token verification |
| `CONNECTOR_ENCRYPTION_KEY` | Base64 32-byte AES-256-GCM key for connector secrets |
| `COINGECKO_API_KEY` | Optional CoinGecko demo key (keyless if unset) |
| `SOROSWAP_API_KEY` | Soroswap bearer key; drives its `configured` flag |
| `UNBLCK_API_ENABLED`, `UNBLCK_AGENT_API_KEY`, `UNBLCK_API_BASE_URL` | Enable + authenticate + target the UNBLCK Agent Hub API |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` | Bot API token (also Mini App HMAC key), webhook secret, deep-link username |
| `STELLAR_TESTNET_USDC_DISTRIBUTOR_SECRET` | Internal Testnet USDC faucet distributor |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, `ADMIN_EMAILS` | Founder admin auth |
| `AGENT_LANGCHAIN_ENABLED`, `AGENT_LANGCHAIN_PROVIDER`, `AGENT_LANGCHAIN_MODEL`, `OPENROUTER_API_KEY` / `OPENAI_API_KEY` | LangChain planner (plan-only) |
| `OPENZEPPELIN_CHANNELS_TESTNET_API_KEY` | OpenZeppelin Channels readiness |
| `NEXT_PUBLIC_APP_URL` | App URL for outbound referers |

## Key source files

- **Auth core:** `app/privy-stellar.ts`, `app/mcp/auth.ts`, `app/admin/auth.ts`, `app/services/provider-store.ts`
- **MCP servers:** `app/api/mcp/route.ts`, `app/api/mcp/agent/route.ts`, `app/api/mcp/provider/route.ts`, discovery `app/.well-known/mcp/route.ts`
- **Connectors:** `app/connectors/{coingecko,coinmarketcap,notion-oauth,notion-mcp,soroswap,defindex,unblck,unblck-connection}.ts`, `app/travala.ts`, `app/x402/protocol.ts`
- **Data:** `db/index.ts`, `db/schema.ts`

For the conceptual view of how a request flows through freeze → policy → approval → execute-once → evidence, see [architecture.md](architecture.md) and [reusable-workflow-engine.md](reusable-workflow-engine.md). For the inbound-MCP contract in prose, see [mcp-integration.md](mcp-integration.md).
