# System architecture

This document shows how identity, external tools, policy, wallets and durable evidence fit together. See [product status](product-status.md) before treating any path as production-ready.

## 1. System context

~~~mermaid
flowchart TB
    USER["End user"] --> WEB["Web app and agent chat"]
    EXT["External AI agent"] --> IMCP["Inbound MCP sandbox"]
    DEV["Partner developer"] --> API["Commerce API"]
    WEB --> PRIVY["Privy identity and user-owned wallet"]
    WEB --> ROUTER["Agent tool router"]
    IMCP --> CONTROL["Commerce control layer"]
    API --> CONTROL
    ROUTER --> CONTROL
    ROUTER --> NOTION["Notion remote MCP"]
    ROUTER --> TRAVALA["Travala remote MCP"]
    ROUTER --> CMC["Market data (CoinGecko)"]
    CONTROL --> POLICY["Intent, policy and authorization"]
    POLICY --> RECEIPT["Receipt and audit service"]
    PRIVY --> STELLAR["Stellar Testnet"]
    ROUTER <--> NEON["Neon Postgres"]
    CONTROL <--> NEON
    PARTNERS["DeFindex / UNBLCK / ArcusX"] -. planned pilots .-> ROUTER
~~~

Solid arrows represent implemented paths. The dotted partner path is planned.

## 2. Trust boundaries

~~~mermaid
flowchart LR
    subgraph BROWSER["User browser"]
        SESSION["Privy session"]
        CONSENT["Visible confirmation"]
    end
    subgraph SERVER["Carmelita server"]
        VERIFY["Verify identity"]
        TOOLS["Route tools"]
        RULES["Evaluate policy"]
        TOKENS["Encrypted OAuth tokens"]
        AUDIT["Audit and receipts"]
    end
    subgraph PROVIDERS["External providers"]
        MCP["MCP / API"]
        WALLET["Privy wallet service"]
        NETWORK["Stellar network"]
    end
    SESSION --> VERIFY
    CONSENT --> RULES
    VERIFY --> TOOLS
    TOOLS --> MCP
    TOOLS --> TOKENS
    RULES --> WALLET
    WALLET --> NETWORK
    RULES --> AUDIT
~~~

Security invariants:

- Authentication identifies the user; it does not authorize payment.
- Provider consent grants only the scopes shown by that provider.
- OAuth tokens are encrypted at rest and never returned to the browser.
- The control layer never requires a wallet private key.
- Settlement and fulfillment are separate states.
- A retry returns prior evidence instead of repeating the side effect.

## 3. Login and wallet bootstrap

~~~mermaid
sequenceDiagram
    actor User
    participant App as Agent UI
    participant Privy
    participant API as Bootstrap API
    participant Horizon
    participant Neon
    User->>App: Continue with Google or email
    App->>Privy: Authenticate
    Privy-->>App: Access token
    App->>API: POST /api/agent/bootstrap
    API->>Privy: Verify token
    API->>Privy: Get or create Stellar wallet
    API->>Privy: Get or create user-owned EVM wallet
    API->>Horizon: Read Testnet account
    API->>Neon: Upsert user plus Stellar Testnet and Avalanche Fuji metadata
    API-->>App: User, both wallets, activation and balances
~~~

Wallet creation is idempotent and metadata-only: it never funds, signs or moves
assets. The same service runs after an external AI chat receives explicit OAuth
consent, before the Stytch subject is linked to the Privy DID. Denied consent
creates neither wallets nor an identity link. Testnet faucet tokens have no
monetary value.

## 4. External OAuth connection

~~~mermaid
sequenceDiagram
    actor User
    participant App as Agent UI
    participant API as Connection API
    participant Provider as Notion authorization server
    participant MCP as Notion MCP
    participant Neon
    User->>App: Connect Notion
    App->>API: Start connection with Privy token
    API->>Provider: Discover OAuth metadata and register client
    API-->>App: Authorization URL with PKCE state
    App->>Provider: Redirect and approve scopes
    Provider->>API: Callback with authorization code
    API->>Provider: Exchange code using PKCE verifier
    API->>Neon: Encrypt and store tokens
    API-->>App: Redirect to agent
    User->>App: Search my Notion
    App->>API: Send authenticated chat message
    API->>MCP: Call notion-search
    MCP-->>API: Search result
    API-->>App: Normalized response
~~~

This path is implemented but still requires a complete real-user acceptance test.

## 5. Read-only tool execution

~~~mermaid
sequenceDiagram
    actor User
    participant Chat
    participant Router
    participant Provider as CoinGecko / Travala / Notion
    participant Neon
    User->>Chat: Natural-language request
    Chat->>Router: Authenticated message
    Router->>Router: Select supported operation
    Router->>Provider: API or MCP request
    Provider-->>Router: Timestamped result
    Router->>Neon: Persist message and user state
    Router-->>Chat: Result plus safe next actions
~~~

The current router recognizes supported commands deterministically. A generalized model-backed planner with evaluations remains planned.

## 6. Sensitive commerce action

~~~mermaid
sequenceDiagram
    actor User
    participant Agent
    participant Control as Commerce control layer
    participant Wallet as Privy Stellar wallet
    participant Horizon
    participant Neon
    User->>Agent: Request an action
    Agent->>Control: Create intent with idempotency key
    Control->>Neon: Persist frozen intent
    Control->>Control: Evaluate policy
    Control-->>User: Show destination, amount, asset and expiry
    User->>Control: Explicit scoped approval
    rect rgb(255, 244, 220)
        Note over Control,Horizon: Current demo uses simulated settlement
        Control->>Neon: Create deterministic sandbox receipt
    end
    rect rgb(225, 247, 238)
        Note over Control,Horizon: Next Testnet milestone
        Control->>Wallet: Request transaction signature
        Wallet->>Horizon: Submit signed XDR once
        Horizon-->>Control: Transaction hash and ledger result
        Control->>Neon: Persist on-chain receipt
    end
    Control-->>Agent: Receipt
~~~

## 7. Replay protection

~~~mermaid
flowchart TD
    REQUEST["Execution request"] --> LOOKUP{"Receipt already exists?"}
    LOOKUP -- Yes --> RETURN["Return original receipt with replayed = true"]
    LOOKUP -- No --> AUTH{"Authorization valid and unexpired?"}
    AUTH -- No --> REJECT["Reject without side effect"]
    AUTH -- Yes --> EXECUTE["Execute once"]
    EXECUTE --> STORE["Persist unique receipt"]
    STORE --> RETURNNEW["Return new receipt"]
~~~

The database enforces one receipt per intent. Real Horizon submission must preserve this invariant.

## 8. Persistence model

~~~mermaid
erDiagram
    USER ||--o{ MESSAGE : owns
    USER ||--o{ CONNECTION : grants
    USER ||--o{ WATCHLIST_ITEM : tracks
    USER ||--o{ COMMERCE_INTENT : requests
    COMMERCE_INTENT ||--o| POLICY_DECISION : receives
    COMMERCE_INTENT ||--o| AUTHORIZATION : receives
    COMMERCE_INTENT ||--o| RECEIPT : produces
    COMMERCE_INTENT ||--o{ AUDIT_EVENT : emits
~~~

This is conceptual. Consult the Drizzle schema and migrations for exact names.

## 9. Deployment view

~~~mermaid
flowchart LR
    GH["GitHub main"] --> VERCEL["Vercel / Next.js"]
    VERCEL --> NEON["Neon Postgres"]
    VERCEL --> PRIVY["Privy"]
    VERCEL --> HORIZON["Stellar Horizon"]
    VERCEL --> EXTERNAL["External MCP and APIs"]
    USER["Browser"] --> VERCEL
~~~

Production health is exposed at /api/health and reports custody and payment mode.
