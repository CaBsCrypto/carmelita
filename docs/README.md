# Carmelita documentation

This directory is the source of truth for understanding, demonstrating,
operating and extending Carmelita.

## Start here

For the current engineering restart point, read the
[September 2026 engineering handoff](HANDOFF-2026-09-06.md).
The [PR #28 Preview delivery](preview-pr28-2026-09-08.md) records the consolidated
baseline, isolated database and current acceptance evidence.

Read the [product narrative](product-narrative.md) first. It explains what
Carmelita is, the problem it solves, how the user experience works and how to
describe it consistently.

Then choose your path:

| You are… | Start with | Then read |
| --- | --- | --- |
| A new user | [User guide](user-guide.md) | [Personal Execution Vault](personal-execution-vault.md) |
| A business or partner | [Business onboarding](business-onboarding.md) | [Connection Center](connection-center.md) |
| A developer | [Developer guide](developer-guide.md) | [API reference](api-reference.md) and [architecture](architecture.md) |
| Preparing the demo | [90-second demo](live-demo.md) | [Product status](product-status.md) |
| Preparing YC | [YC pitch](yc-pitch.md) | [Application answer bank](yc-application.md) and [evidence ledger](yc-evidence-ledger.md) |
| Operating the product | [Admin operations](admin-operations.md) | [Acceptance testing](acceptance-testing.md) |

The public entry points are:

- [Product](https://agente-asistente.vercel.app)
- [Agent](https://agente-asistente.vercel.app/agent)
- [New-user guide](https://agente-asistente.vercel.app/guide)
- [Integration Lab](https://agente-asistente.vercel.app/connections)
- [Developer portal](https://agente-asistente.vercel.app/developers)

## The documentation model

~~~mermaid
flowchart TD
    N["Product narrative"] --> U["User guide"]
    N --> B["Business onboarding"]
    N --> D["Developer guide"]
    N --> Y["Demo and YC"]
    D --> A["Architecture and API"]
    A --> I["Integration deep dives"]
    I --> T["Acceptance evidence"]
    T --> S["Product status"]
~~~

## Core product documents

- [Product narrative](product-narrative.md) — canonical story and terminology.
- [Mission, vision and principles](mission-vision.md) — purpose, north star and long-term constraints.
- [Product status](product-status.md) — dated truth about what is live.
- [Brand system](brand-system.md) — voice, visual language and naming.
- [Brand transition](brand-transition.md) — legacy identifiers that remain for compatibility.
- [User guide](user-guide.md) — text-first Testnet onboarding.
- [Business onboarding](business-onboarding.md) — paths for services and merchants.
- [Developer guide](developer-guide.md) — inbound MCP, HTTP sandbox and outbound connectors.
- [Architecture](architecture.md) — trust boundaries and sequence diagrams.
- [API reference](api-reference.md) — HTTP, MCP, auth and configuration surfaces.

## Integrations and orchestration

- [Bidirectional MCP gateway](mcp-gateway.md)
- [MCP integration guide](mcp-integration.md)
- [Reusable workflow engine](reusable-workflow-engine.md)
- [Lang ecosystem](lang-ecosystem.md)
- [LangChain orchestration boundary](langchain-orchestration.md)
- [Graph memory](graph-memory.md)
- [Connection Center](connection-center.md)
- [UNBLCK](unblck-agent-api.md)
- [Privy + Stellar](privy-stellar-testnet.md)
- [Stellar x402](x402-privy-testnet.md)
- [DeFindex](defindex-testnet.md)
- [Soroswap](soroswap-testnet.md)
- [Telegram](telegram-bot.md)
- [MPP Router](mpp-router.md)
- [Stellar 8004](stellar-8004.md)

## Fundraising and proof

- [YC pitch and narrative](yc-pitch.md)
- [YC application answer bank](yc-application.md)
- [YC evidence ledger](yc-evidence-ledger.md)
- [YC submission checklist](yc-submission-checklist.md)
- [90-second live demo](live-demo.md)
- [CoinMarketCap pilot brief](coinmarketcap-partner-pilot.md)
- [Acceptance testing](acceptance-testing.md)

Historical planning documents remain useful context but are not current status:

- [YC closeout roadmap](yc-closeout-roadmap.md)
- [Seven-day plan](yc-seven-day-plan.md)

Future experiments are documented separately and are never presented as current product capability:

- [SOS and trusted contacts](sos-trusted-contacts.md) - post-YC assisted messaging concept for older adults, families and caregivers.

## Shared status language

| Status | Meaning |
| --- | --- |
| **Live** | Deployed and verified against a real external system |
| **Live Testnet proof** | Real on-chain execution using assets with no real monetary value |
| **Ready to validate** | Implemented but missing a complete acceptance test |
| **Sandbox** | Working proof with simulated execution or settlement |
| **Planned** | Researched or designed, not implemented |

Every integration must separately report:

1. discovery;
2. authentication;
3. preparation;
4. execution;
5. settlement;
6. fulfillment.

Passing one stage never implies that a later stage works.

## Maintenance rules

- Update [Product status](product-status.md) whenever a capability changes.
- Use the [Product narrative](product-narrative.md) as the canonical explanation.
- Add dated evidence for every **Live** claim.
- Never call outreach an integration or Testnet money production revenue.
- Never call settlement proof fulfillment proof.
- Keep secrets, real tokens and private user data out of documentation.
- Run the repository validation commands before publishing code-related claims.

- [Avalanche x402 Merchant SDK](developer/avalanche-x402-merchant-sdk.md)
