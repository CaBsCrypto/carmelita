# Carmelita brand transition

Last updated: July 22, 2026

## Working public brand

**Carmelita is a personal AI agent with memory, permissions and a user-owned wallet that safely executes real-world actions.**

**Knows you. Acts for you.**

Carmelita is the user-facing product name. It should feel like a trusted personal agent rather than a generic infrastructure layer: the user asks in natural language, Carmelita prepares the action, applies the user's rules, requests the required approval and preserves evidence of the result.

## Naming layers

| Layer | Name | Meaning |
| --- | --- | --- |
| Brand and personal agent | **Carmelita** | The experience users speak to and trust with scoped actions |
| Memory | **Carmelita Memory** | Preferences, context and knowledge; never financial authority by itself |
| Permissions | **Carmelita Rules** | Limits, allowlists, risk levels and approval requirements |
| Wallet | **Carmelita Wallet** | The user's Privy-managed, user-owned Stellar wallet |
| Integrations | **Carmelita Connect** | MCP, API and OAuth connections to external services |
| Execution | **Carmelita Actions** | Frozen intents, approval, execute-once behavior and evidence |
| Provider surface | **Carmelita for Business** | Structured offers and controlled tools for services and merchants |

These are communication layers, not separate deployed products. Do not imply that a layer is commercially available unless its underlying capability is marked Live in `product-status.md`.

## Validated proof

Use only these concrete proofs in the brand narrative:

- **UNBLCK:** a real hub day-pass was booked and cancelled through the agent, confirmed in UNBLCK's system.
- **Stellar x402 Testnet:** a Privy user paid **0.01 USDC** and a retry returned the existing durable receipt instead of causing a duplicate debit.
- **DeFindex Testnet:** a Privy user deposited **1 XLM** into the public Testnet vault and the transaction was confirmed on-chain.
- **Travala:** Carmelita can search live hotel inventory; booking and payment are not enabled.

These are technical proofs. They are not revenue, Mainnet settlement or signed commercial partnerships.

## Backward compatibility

The rename is intentionally presentation-first. Existing technical identifiers remain stable until a separately tested migration is ready.

Keep these legacy values unchanged for now:

- Production URL: `https://agente-asistente.vercel.app`
- GitHub repository: `https://github.com/CaBsCrypto/carmelita`
- Local repository directory: `agente-asistente`
- Existing MCP server identifiers such as `agent-assistant`, `agent-assistant-personal` and `agent-assistant-provider`
- Existing API routes, webhook URLs, environment variables, database values, provider keys and protocol identifiers
- Existing asset filenames when renaming them would break references
- The UNBLCK channel identifier `agent-assistant`

Documentation may introduce these once as legacy names. Code examples must retain the exact identifiers that clients need today.

## Migration sequence

1. Use **Carmelita** in the landing page, agent UI, README, YC materials and partner-facing prose.
2. Keep existing URLs, API routes and identifiers operational.
3. Acquire and verify the final domain and trademark position before changing infrastructure.
4. Add a new domain as an alias before redirecting the legacy URL.
5. Introduce new MCP identifiers only as aliases; do not remove legacy identifiers without a deprecation window.
6. Test OAuth callbacks, Privy allowed origins, Telegram webhooks, MCP discovery and partner integrations after any domain change.
7. Rename the repository or package only after updating CI, Vercel, documentation and external clients.

## Voice

Carmelita should sound calm, precise and protective.

- Prefer: “I prepared the exact action for your review.”
- Prefer: “This requires your approval because it moves funds.”
- Prefer: “The retry returned the original receipt; no second payment occurred.”
- Avoid: “I invested your money automatically.”
- Avoid claims of custody, guaranteed returns, confirmed fulfillment without evidence or production readiness beyond the documented proof.

## Core message

> Carmelita knows the user's context, acts within explicit permissions and leaves verifiable evidence.