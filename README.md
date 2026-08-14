# Carmelita

<p align="center">
  <img src="public/brand/carmelita-readme-cover.svg" alt="Carmelita connects people, agents, applications and payments through explicit permissions" width="100%" />
</p>

<p align="center">
  <a href="https://agente-asistente.vercel.app"><img alt="Live" src="https://img.shields.io/badge/product-live-3fb950?style=for-the-badge&labelColor=0d1117"></a>
  <img alt="Avalanche Fuji" src="https://img.shields.io/badge/Avalanche-Fuji-E84142?style=for-the-badge&labelColor=0d1117&logo=avalanche&logoColor=white">
  <img alt="Stellar Testnet" src="https://img.shields.io/badge/Stellar-Testnet-7D00FF?style=for-the-badge&labelColor=0d1117&logo=stellar&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-126%2F126-2f81f7?style=for-the-badge&labelColor=0d1117">
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js%2016-000000?style=flat-square&logo=nextdotjs&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React%2019-61DAFB?style=flat-square&logo=react&logoColor=black">
  <img alt="LangGraph" src="https://img.shields.io/badge/LangGraph-1C3C3C?style=flat-square&logo=langchain&logoColor=white">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-D97757?style=flat-square&logo=anthropic&logoColor=white">
  <img alt="Privy" src="https://img.shields.io/badge/Privy-FF8271?style=flat-square&logoColor=white">
  <img alt="Postgres" src="https://img.shields.io/badge/Neon%20Postgres-4169E1?style=flat-square&logo=postgresql&logoColor=white">
</p>

**Carmelita is a personal AI agent with memory, permissions and a user-owned wallet that safely executes real-world actions.**

> **Knows you. Acts for you.**

```
freeze intent (SHA-256) → evaluate policy → exact approval → execute once → evidence
```

The public URL, GitHub repository and some protocol identifiers still use the legacy `agente-asistente` / `agent-assistant` name. They remain unchanged during the brand transition so existing integrations keep working; see [the brand transition guide](docs/brand-transition.md).

The product combines a simple chat for end users with MCP, WebMCP and API surfaces for developers. Sensitive actions are constrained by identity, policy, explicit approval, idempotency and durable evidence.

> **Honest MVP boundary:** authentication, Stellar wallet creation, live market data, persistent user state, the commerce safety demo, a real UNBLCK hub booking and a Privy-signed DeFindex Testnet deposit are real. Notion is implemented and awaiting complete user acceptance. Merchant fulfillment and mainnet settlement are not live.

### Validated proof

|  | What was proven | Where it was verified |
| :--: | :-- | :-- |
| 🏢 | Real hub day-pass **booked and cancelled** from a chat message | UNBLCK's own member portal, scannable QR pass; the cancellation refunded the credit |
| 💸 | **0.01 USDC x402 payment**, duplicate-resistant | Stellar Testnet — a retry returns the original receipt, zero second debit |
| ⛓️ | **1 XLM DeFindex deposit**, Privy-signed | On-chain, verifiable by transaction hash |
| 🏨 | Live read-only **Travala hotel search** | External API, no funds moved |

[Live product](https://agente-asistente.vercel.app) · [New user guide](https://agente-asistente.vercel.app/guide) · [Developer portal](https://agente-asistente.vercel.app/developers) · [Open the agent](https://agente-asistente.vercel.app/agent) · [Safety demo](https://agente-asistente.vercel.app/demo) · [Integration Lab](https://agente-asistente.vercel.app/connections) · [Waitlist](https://agente-asistente.vercel.app/waitlist)

> **Start with the story:** read the [canonical product narrative](docs/product-narrative.md) to understand what Carmelita does, the [business onboarding guide](docs/business-onboarding.md) to make a service agent-ready, or the [developer guide](docs/developer-guide.md) to integrate it.

> **Visual overview:** a single-page product &amp; architecture showcase — 16:9 cover, layered architecture, the safe-action lifecycle, end-to-end sequence flows and the bidirectional MCP gateway — lives at [`docs/overview.html`](docs/overview.html). Open it in a browser for the full illustrated tour; the sections below are the canonical text.

## What works now

Status meanings are shared across all project documentation:

- **Live:** deployed and verified against a real external system.
- **Ready to validate:** implemented, but missing a complete user acceptance test.
- **Sandbox:** working product proof with simulated execution or settlement.
- **Planned:** researched or designed, not implemented.

| Capability | Status | Current proof |
| --- | --- | --- |
| Google/email login | Live | Privy authentication on /agent |
| EN/ES/PT experience | Live | Persistent locale and multilingual core agent commands |
| Automatic Stellar + Avalanche wallets | Preview validated | Privy creates one user-owned Stellar Testnet wallet and one user-owned EVM wallet registered for Avalanche Fuji after web login or approved chat OAuth; no funds move |
| Chat-requested Testnet XLM | Ready to validate | Friendbot only runs after a text request for an absent account |
| Wallet balance and explorer link | Live | Horizon account lookup |
| Persistent chat and user state | Live | Neon Postgres |
| Market prices | Live, read-only | CoinGecko primary (keyless), CoinMarketCap automatic fallback |
| Market watchlist | Live, read-only | Per-user persistent watchlist over CoinGecko/CoinMarketCap |
| Notion OAuth and search | LangGraph-routed, ready to validate | OAuth PKCE, encrypted tokens, official Notion MCP and durable workflow trail |
| Travala hotel discovery | Live, read-only | Public Travala Travel MCP |
| Intent, policy and replay protection | Sandbox | Durable intent and one receipt per execution |
| Public inbound MCP | Sandbox | Seven tools at /api/mcp |
| Personal Agent Gateway | Validated Testnet discovery + planning | Scoped PATs, granular context/conversation opt-ins, Neon replay safety; no signing or submission |
| Service provider MCP | Development foundation | Scoped catalog administration at /api/mcp/provider |
| Chrome WebMCP | Experimental sandbox | Offer discovery and intent preparation |
| Wallet-signed Stellar transaction | Live Testnet proof | A Privy-signed DeFindex Testnet deposit was confirmed on-chain (transaction hash), server-verified, with a durable receipt |
| Stellar x402 payment | Live Testnet proof | A second Privy user completed the official 0.01 USDC flow; settlement, delivery evidence and the replay-safe receipt are durable |
| Acceptance runner | Live, read-only | Production doctor validates health, MCP discovery, official x402 challenge and distributor balances |
| Testnet Autopilot | Policy layer live; delegated signer pending | Time-bound activation, risk colors, allowlist, hard XLM/USDC limits, daily cap and immediate pause |
| OpenZeppelin Stellar Channels | Configured; acceptance pending | Testnet-only fee sponsorship and submission after Privy user signature |
| MPP Router | Discovery live; spending disabled | Free catalog with live prices for mixed free/paid Mainnet APIs; no automatic payment |
| Stellar 8004 | Registration draft ready | MCP and payment profile prepared without claiming on-chain registration |
| DeFindex XLM | Live Testnet proof | A user completed a Privy-signed 1 XLM deposit into the public DeFindex Testnet vault, confirmed on-chain (transaction hash); intent freeze, exact review and replay-safe receipt |
| DeFindex USDC | Trustline ready; deposit funding blocked | Exact trustline flow, but no controlled compatible-USDC distributor |
| Soroswap XLM/USDC | Integration ready; external Testnet unavailable | Quote/build/send client, Privy review and durable receipts are implemented; live validation on Jul 18 found the Soroswap API reachable but reporting zero Testnet protocols |
| UNBLCK / ArcusX | UNBLCK Live; ArcusX planned | UNBLCK link/state/book/cancel verified end-to-end against the real Agent Hub API: WhatsApp identity linked, real bookings and a cancellation confirmed on UNBLCK's own member portal, LangGraph approval and replay protection, replies localized EN/ES |
| Telegram bot | Built; ready to switch on | Chat, full UNBLCK flow, read-only tools and web↔Telegram account linking are merged and hardened; needs a bot token + migration to go live. The wallet-signing Mini App is scaffolded (initData validation, `web_app` button, session route) with Privy signing pending |
| Gmail, Drive, Calendar and Trello | Planned | Catalog entries only |

The dated source of truth is [docs/product-status.md](docs/product-status.md).

## Try the real product

### 1. Create the agent and wallet

1. Open [the agent](https://agente-asistente.vercel.app/agent).
2. Sign in with Google or email through Privy.
3. The server verifies the Privy access token and idempotently creates one user-owned Stellar wallet plus one user-owned EVM wallet registered for Avalanche Fuji when needed.
4. Both public addresses are persisted in Neon under the same Privy DID. Creation never signs, funds or submits a transaction.
5. The chat reads the wallets' current state and guides each Testnet step.

Try the onboarding entirely through text:

~~~text
Dame mi wallet
Recarga mi wallet con XLM de Testnet
Activa XLM
Activa USDC
¿Cuál es el siguiente paso de configuración Testnet?
~~~

Wallet creation is automatic; Testnet funding is requested from the chat. XLM is Stellar's native asset, so Friendbot creates the Testnet account and funds it in one step. USDC activation prepares the exact DeFindex-compatible trustline, but the user must still approve that on-chain transaction with Privy.

The application does not generate a password or expose a seed phrase. Login establishes identity; it does not authorize a transaction.

### 2. Query market prices

Try these prompts:

~~~text
What is the current XLM price?
Add XLM to my watchlist
Show my crypto watchlist
~~~

Quotes come from CoinGecko (with CoinMarketCap as an automatic fallback) and include a timestamp. This connection cannot trade or move funds.

### 3. Connect Notion

Use **Connect Notion** in the agent, approve access in Notion, then try:

~~~text
Search my Notion for agent payments
Find my YC notes in Notion
~~~

OAuth tokens are encrypted before storage in Neon. Until production consent and a search succeed for a real user, this integration remains **Ready to validate**.

### 4. Test duplicate-resistant execution

Open the [Safety demo](https://agente-asistente.vercel.app/demo), create an intent, evaluate policy, approve it and execute twice. The second request returns the original receipt.

Settlement is simulated. Persistence, authorization hashes, audit records and receipt uniqueness are real.

### 5. Review a DeFindex Testnet action

After the wallet has Testnet XLM, say **"Deposita 1 XLM en DeFindex Testnet"**. The agent extracts the amount and asset, builds the exact XDR, simulates it and opens a transaction review. It can also prepare:

- A deposit into the public XLM Testnet vault.
- The exact trustline required by the public USDC Testnet vault.
- A USDC deposit after the wallet has the exact issuer-compatible Testnet asset.

Every on-chain action is shown before Privy receives a signing request. Natural language prepares the action; it never authorizes settlement. The transaction-specific **Confirm and sign with Privy** button is required.

The XLM path is available for the acceptance proof now. The exact USDC trustline can also be prepared now, but automatic USDC funding is not claimed: this project does not yet control a distributor for the issuer required by the public vault and will not substitute a different asset. See [the DeFindex Testnet guide](docs/defindex-testnet.md).

### 6. Quote and review a Soroswap Testnet swap

After OpenRouter and Soroswap are configured server-side, try:

~~~text
Cotiza 1 XLM a USDC en Soroswap Testnet
Intercambia 1 XLM por USDC en Soroswap Testnet
~~~

The agent uses structured planning to extract the exact pair and amount, obtains
a live read-only quote, then creates an unsigned XDR only when a swap is
requested. The exact minimum output is shown before Privy asks for a
transaction-specific signature. See the [Soroswap Testnet guide](docs/soroswap-testnet.md).


## Product model

~~~mermaid
flowchart LR
    U["User in chat"] --> ID["Privy identity"]
    ID --> A["Agent and tool router"]
    A --> P["Policy and explicit approval"]
    A --> N["Notion MCP"]
    A --> C["Market data (CoinGecko)"]
    A --> T["Travala MCP"]
    P --> W["User-owned Stellar wallet"]
    W --> S["Stellar Testnet"]
    A <--> DB["Neon state and audit trail"]
~~~

| Audience | Experience |
| --- | --- |
| End user | Login, automatic wallet, chat, connections, permissions and history |
| Developer or merchant | MCP/API tools, structured offers, intents, policy, receipts and integration guides |

### Safe action lifecycle

Every write or payment runs through one reusable LangGraph `StateGraph` of seven bounded nodes. A connector plugs in `prepare`, `execute` and `verify`, and inherits approval, idempotency and evidence for free.

~~~mermaid
flowchart LR
    A["validate_request"] --> B["check_connection"]
    B -->|missing| B1(["awaiting_connection"])
    B --> C["prepare_action<br/>+ sha256 digest"]
    C --> D{"evaluate_policy"}
    D -->|deny| D1(["blocked"])
    D --> E["approval_gate"]
    E -->|approval required| E1(["awaiting_approval"])
    E1 -.->|"confirm: userId + digest match"| E
    E --> F["execute_once<br/>idempotency = workflowId"]
    F --> G["verify_evidence"]
    G -->|not verified| G1(["failed"])
    G --> H(["completed"])
~~~

The prepared action is canonicalized and SHA-256 hashed into a frozen digest; changing any parameter invalidates a prior approval. The `workflowId` is the idempotency key, so a duplicate confirmation returns the same result instead of executing twice. Production routing covers Notion search and the three UNBLCK hub capabilities today; DeFindex, Soroswap and x402 run equivalent guards through their own routes (`app/orchestration/`).

Payment and fulfillment are separate. A transaction hash proves network settlement; it does not prove that a hotel, task or physical product was delivered.

## Bidirectional MCP gateway

The Model Context Protocol runs in **both directions**. Other agents and apps can use Carmelita's inbound Testnet discovery-and-planning Gateway, while Carmelita uses outbound MCP/API connectors. The personal Gateway does not expose chat mutation, approval, transaction preparation, signing or submission. Discovery is public at [`/.well-known/mcp`](https://agente-asistente.vercel.app/.well-known/mcp).

~~~mermaid
flowchart LR
    subgraph IN["Inbound · others use us"]
        EA["External AI agent"]
        PRO["Service provider"]
        WEB["Chrome WebMCP"]
    end
    subgraph CORE["Carmelita"]
        P1["/api/mcp<br/>public sandbox"]
        P2["/api/mcp/agent<br/>scoped PAT or Privy"]
        P3["/api/mcp/provider<br/>scoped key"]
        ENG["Router + policy + evidence"]
    end
    subgraph OUT["Outbound · we use apps"]
        NO["Notion · MCP + OAuth"]
        TV["Travala · public MCP"]
        CM["CoinGecko · API"]
    end
    EA --> P1
    WEB --> P1
    PRO --> P3
    EA --> P2
    P1 --> ENG
    P2 --> ENG
    P3 --> ENG
    ENG --> NO
    ENG --> TV
    ENG --> CM
~~~

### Inbound — how other agents use us

| Surface | Auth | For | Highlights |
| --- | --- | --- | --- |
| `POST /api/mcp` | None (public sandbox) | Any external agent | Seven commerce tools (see below) |
| `POST /api/mcp/agent` | Scoped PAT or first-party Privy bearer | A user's external agent | `agent:read` discovery/owned state; optional `agent:plan`, `agent:context` and `agent:conversation`; no chat mutation, approval, signing or submission |
| `POST /api/mcp/provider` | Scoped provider key (`aap_provider_…`) | Merchants / providers | `get_service_provider`, `list_service_offers`, `upsert_service_offer`, `set_service_offer_status`; keys issued at `/admin/providers`, stored only as SHA-256 hashes |

Chrome **WebMCP** registers `search_agent_offers` and `prepare_commerce_intent`; wallet authorization and execution are intentionally excluded from the page context.

The personal Gateway at commit `50c8402` passed Neon durability smoke **6/6** and protected Preview REST/MCP acceptance **20/20** on deployment `dpl_AbqxiUd7w9m7uW1cXRka6zWCTYNU`. The result validates Testnet discovery, planning, isolation, replay and revocation—not transaction execution or public OAuth linking.

### Outbound — how we use other apps

| App | Protocol | Auth | Capability |
| --- | --- | --- | --- |
| Notion | Hosted remote MCP (`mcp.notion.com/mcp`) | OAuth 2.1 PKCE, AES-256-GCM tokens | Workspace search (read-only), routed through the engine |
| Travala | Public Travel MCP (JSON-RPC) | None | Hotel discovery (read-only) |
| CoinGecko (primary) + CoinMarketCap (fallback) | REST API | Keyless (optional demo key) | Live quotes + watchlist (read-only) |
| UNBLCK | Agent Hub Check-in API | Partner key + channel identity | Read state, book &amp; cancel — approval-gated |

## MCP tools and clients

### ChatGPT, Privy and multichain wallet visibility

Carmelita's personal MCP lets an authorized ChatGPT client discover the user's
public wallet state and plan Testnet actions. ChatGPT authenticates through the
configured OAuth flow; Privy remains the identity and wallet provider. Connecting
the MCP or signing in does **not** authorize a transaction.

Carmelita exposes two first-class Testnet choices for each Privy user. Choose the
network that matches the capability and flow:

- **Avalanche Fuji:** a Privy-owned EVM address registered for Fuji, available to
  verified Avalanche discovery and planning flows.
- **Stellar Testnet:** a Privy-owned Stellar address, available to verified Stellar
  wallet visibility and Testnet flows.

Neither network is a fallback for the other. Both addresses belong to the same Privy
identity and appear together when the user has completed multichain onboarding.

An **active** wallet has a complete public address and is the wallet Carmelita will
show for that network. A **pending** entry records an incomplete provisioning attempt.
On reconnect, Carmelita reuses an existing valid wallet of the same Privy user and
network instead of creating another one. When an active wallet and an older pending
entry coexist for one network, the MCP response shows the active wallet. Admin keeps
the underlying evidence unchanged for operator audit; no wallet record is deleted or
rewritten.

To verify a connection, an authorized operator can open `/admin`, locate the user by
their Privy identity, and compare the complete public Stellar and Avalanche addresses
with the addresses returned by the personal MCP. Treat addresses as exact strings:
never compare shortened UI labels. A healthy dual-wallet connection has one active
address for `stellar:testnet` and one for `avalanche:fuji`. Admin access is protected;
never paste credentials, tokens, cookies or wallet material into an issue or chat.

This connection and reconnect flow never:

- pays, transfers or swaps assets;
- requests Testnet funding or calls Friendbot;
- prepares, signs or submits a transaction;
- exports a private key or seed phrase; or
- deletes, merges or modifies real wallet records.

The regression suite covers reconnect reuse, zero wallet-creation calls when an
existing wallet is available, active-over-pending MCP visibility, and dual-network
readiness. Run `npm test`, `npm run lint` and `npm run build` before deployment.

Operational troubleshooting, acceptance-session requirements and unresolved provider
conditions belong in internal runbooks rather than this user-facing capability guide.

Public sandbox endpoint:

~~~text
https://agente-asistente.vercel.app/api/mcp
~~~

Example client configuration:

~~~json
{
  "mcpServers": {
    "agent-assistant": {
      "url": "https://agente-asistente.vercel.app/api/mcp"
    }
  }
}
~~~

| Tool | Purpose | Mutates state |
| --- | --- | --- |
| search_offers | Discover structured offers | No |
| get_offer | Read an offer | No |
| create_intent | Freeze an action under an idempotency key | Yes |
| evaluate_policy | Apply expiry, network and demo spending rules | Yes |
| demo_authorize_intent | Record sandbox confirmation | Yes |
| execute_authorized_intent | Create or replay one sandbox receipt | Yes |
| get_receipt | Retrieve execution evidence | No |
The delegated-autonomy boundary is documented in [Testnet Autopilot security model](docs/testnet-autopilot.md).

Inbound MCP lets other agents use Carmelita. Outbound connectors let Carmelita use Notion, CoinGecko/CoinMarketCap and Travala. These directions may use MCP, OAuth or a conventional API.

Chrome WebMCP registers search_agent_offers and prepare_commerce_intent. Wallet authorization and execution are intentionally excluded.

See [docs/mcp-integration.md](docs/mcp-integration.md) for the complete contract.

## Local development

### Requirements

- Node.js 22.13.0 or newer
- npm
- Neon Postgres for persistent state
- Privy credentials for authentication and Stellar wallets

### Install

~~~bash
git clone https://github.com/CaBsCrypto/carmelita.git
cd carmelita
npm ci
cp .env.example .env.local # macOS/Linux
# PowerShell: Copy-Item .env.example .env.local
npm run db:migrate
npm run runtime:doctor
npm run dev
~~~

Open http://localhost:3000. Commerce orchestration can use process memory without DATABASE_URL, but waitlist, user history and connections require Neon.

### New device checklist

The repository contains the application, migrations, tests and safe configuration
templates. It deliberately does not contain production secrets, user data or wallet
keys. On every new device or deployment:

1. Install the Node.js and npm versions listed above, then clone the repository and run
   `npm ci`.
2. Create `.env.local` from `.env.example`. If the device is authorized for the Vercel
   project, `vercel env pull .env.local` can restore the configured development values;
   otherwise enter them through the provider dashboards. Never send secrets through Git.
3. Point `DATABASE_URL` to the intended Neon branch and run `npm run db:migrate`.
4. Add the new localhost or deployment origin to Privy's allowed origins. For external
   AI chats, also configure the matching public origin and authorization URL in Stytch.
5. Run `npm run runtime:doctor`, `npm test`, `npm run lint` and `npm run build` before
   treating that device as ready.

Cloning alone is enough to inspect and build Carmelita. Authentication, persistent
history, automatic wallets and external chat OAuth become operational only after their
server-side credentials and provider origins are configured.

### Environment variables

| Variable | Required for | Exposure |
| --- | --- | --- |
| DATABASE_URL | Neon persistence | Server only |
| NEXT_PUBLIC_PRIVY_APP_ID | Privy browser client | Public identifier |
| NEXT_PUBLIC_PRIVY_CLIENT_ID | Optional domain-specific Privy client | Public identifier |
| PRIVY_APP_ID | Server-side Privy operations | Server only |
| PRIVY_APP_SECRET | Token verification and wallet API | Secret, server only |
| CONNECTOR_ENCRYPTION_KEY | OAuth token encryption | Secret, server only |
| ADMIN_USERNAME | Founder admin login | Server only |
| ADMIN_PASSWORD_HASH | Founder admin login | Secret, server only |
| ADMIN_SESSION_SECRET | Signed admin session | Secret, server only |
| ADMIN_EMAILS | Optional founder allowlist | Server only |

Never commit .env.local, credentials, OAuth tokens, admin secrets or wallet keys.

### Validate

~~~bash
npm test
npm run lint
npm run build
~~~

Database commands:

~~~bash
npm run db:generate
npm run db:migrate
~~~

## Main routes

| Route | Purpose |
| --- | --- |
| / | Product landing |
| /login | Privy login entry point |
| /agent | Authenticated chat, wallet and connections |
| /demo | Intent, authorization and replay-safety proof |
| /connections | Integration research and priority tracker |
| /developers | Public developer entry point |
| /waitlist | Early-access capture |
| /admin | Protected founder dashboard |
| /admin/stellar | Founder Stellar test lab |
| /admin/providers | Provision scoped service-provider MCP keys |
| /api/mcp | Public sandbox MCP server |
| /api/mcp/agent | Scoped Testnet discovery-and-planning MCP; no signing or submission |
| /api/mcp/provider | Scoped provider catalog MCP |
| /api/commerce | Commerce orchestration API |
| /api/health | Runtime and persistence status |
| /.well-known/mcp | MCP discovery metadata |

## Immediate roadmap

1. Complete the real-user Notion OAuth and search acceptance test.
2. Build one explicitly approved, Privy-signed Stellar Testnet payment.
3. Persist its transaction hash and make retries return the same receipt.
4. Connect that proof to one controlled partner or DeFindex test flow.
5. Collect three design-partner commitments.
6. Move CoinMarketCap toward an official API, MCP or x402 pilot.

For YC, the strongest claim is: **a user can sign in, receive a Stellar wallet through Privy, authorize one 0.01 USDC x402 payment, receive the protected resource and replay the same payment without a second debit; the same agent can also search live services and execute a separate DeFindex Testnet deposit.**

## Security principles

- **Non-custodial:** the orchestration layer never needs the private key.
- **Least privilege:** each connection receives only the required scopes.
- **Explicit authority:** identity, connection consent and payment approval are separate.
- **Frozen intent:** merchant, amount, network and expiry are fixed before approval.
- **Replay safety:** duplicate execution returns the previous result.
- **Encrypted credentials:** external OAuth tokens are encrypted at rest.
- **Independent evidence:** settlement and fulfillment are verified separately.
- **Honest status:** research, sandbox behavior and production integrations are not conflated.

## Documentation

Start at the [documentation index](docs/README.md).

- [Canonical product narrative](docs/product-narrative.md)
- [Mission, vision and principles](docs/mission-vision.md)
- [Carmelita for Business onboarding](docs/business-onboarding.md)
- [Visual product &amp; architecture overview](docs/overview.html) — illustrated single-page tour (open in a browser)
- [New user guide](docs/user-guide.md)
- [Architecture and flows](docs/architecture.md)
- [Developer guide](docs/developer-guide.md)
- [API & integration reference](docs/api-reference.md) — every route, MCP tool, connector, auth model and env var
- [Avalanche x402 Merchant SDK](docs/developer/avalanche-x402-merchant-sdk.md) — public paid resources, durable idempotency and receipt verification
- [Product status](docs/product-status.md)
- [Personal Execution Vault](docs/personal-execution-vault.md)
- [Graph memory and visual project map](docs/graph-memory.md)
- [LangChain orchestration and security boundary](docs/langchain-orchestration.md)
- [Lang ecosystem product map](docs/lang-ecosystem.md)
- [Reusable LangGraph workflow engine](docs/reusable-workflow-engine.md)
- [Gemini notebook integration options](docs/gemini-notebook-integration.md)
- [90-second demo](docs/live-demo.md)
- [Soroswap Testnet quote and swap flow](docs/soroswap-testnet.md)
- [YC application answer bank](docs/yc-application.md)
- [YC closeout roadmap](docs/yc-closeout-roadmap.md)
- [YC seven-day closeout plan](docs/yc-seven-day-plan.md)
- [YC evidence ledger](docs/yc-evidence-ledger.md)
- [Bidirectional MCP gateway](docs/mcp-gateway.md)
- [MCP integration](docs/mcp-integration.md)
- [Telegram bot](docs/telegram-bot.md) — chat-first bridge + signing Mini App, with the go-live checklist
- [SOS and trusted contacts](docs/sos-trusted-contacts.md) - planned post-YC assistance experiment with consent, escalation and delivery evidence
- [Privy and Stellar Testnet](docs/privy-stellar-testnet.md)
- [Acceptance testing](docs/acceptance-testing.md)
- [CoinMarketCap partner pilot](docs/coinmarketcap-partner-pilot.md)
- [Admin operations](docs/admin-operations.md)
- [Waitlist operations](docs/waitlist-operations.md)
- [New integration agent prompt](docs/NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md)

## Project

Carmelita is an early-stage, solo-founder project built in Latin America for a global agent economy. The first wedge is a trusted personal agent with real connections and a user-owned Stellar wallet. The long-term infrastructure helps businesses become discoverable, actionable and payable by agents.

Join the [waitlist](https://agente-asistente.vercel.app/waitlist) or propose a pilot through the [Integration Lab](https://agente-asistente.vercel.app/connections).

## Privy + x402 Testnet

The agent now has a Testnet-only x402 payment path for the official Stellar demo. Privy's Stellar client hook signs a pinned authorization hash inside the authenticated browser; the API verifies that signature, freezes the live HTTP 402 requirements before approval, and stores settlement and delivery evidence without exporting a secret key or requiring Freighter. See [docs/x402-privy-testnet.md](docs/x402-privy-testnet.md).

Run `npm run qa:local` before deployment, `npm run x402:signing:doctor` to validate the live signing payload without moving funds, and `npm run acceptance:doctor` after Vercel is ready. Every new `0.01 USDC` acceptance payment must be confirmed by the logged-in user through Privy in the browser; validated receipts are reused for repeatable demos. See [acceptance testing](docs/acceptance-testing.md).
