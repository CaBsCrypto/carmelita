# Product status

Reviewed September 14, 2026. The [Stellar acceptance](STELLAR-PAYMENT-ACCEPTANCE-2026-09-09.md) closes the dated Preview session, administration and fixed-demo payment flow. [Production activation](PRODUCTION-ACTIVATION-2026-09-14.md) is being prepared; Preview evidence does not certify production.

## Evidence categories

- **Verified:** observed successfully on the stated date and environment; does not imply every related flow works.
- **Implemented, acceptance pending:** code exists, but its authenticated end-to-end behavior still needs evidence.
- **Experimental:** test or limited capability that must retain its restrictions.
- **Planned:** not available as an operational user capability.

## Current capabilities

| Capability | Category | Evidence and remaining work |
| --- | --- | --- |
| Public agent page, health and MCP discovery | Verified | September 7 public diagnostic passed; health is not a database or signing acceptance test |
| CoinGecko quote | Verified | September 7 XLM connector request succeeded; real CoinMarketCap fallback still needs configured acceptance |
| Local application build and safety logic | Verified locally | See the stabilization evidence; local tests do not certify production or payments |
| Privy login and multichain wallet recovery | Verified in isolated Preview | Two-user session cycles and stable identities accepted September 9; production acceptance pending |
| Chat and memory | Verified within historical Preview acceptance | Preserve the September 8 two-user evidence and its original version; production acceptance pending |
| Watchlist and user policies | Implemented, acceptance pending | Independent end-to-end acceptance required |
| Fixed Stellar x402 demo | Verified in isolated Preview | One approved 0.01 USDC Testnet payment, delivery, recovery, zero-debit replay and cross-owner rejection accepted September 9 |
| DeFindex XLM | Implemented, acceptance pending | Historical receipts do not establish current production acceptance |
| Notion and Stytch OAuth | Implemented, acceptance pending | Validate consent, scoped reads, renewal and revocation with real accounts |
| UNBLCK | Implemented, acceptance pending | Historical booking/cancellation documented; current availability and account linking need revalidation |
| Travala | Implemented, acceptance pending | September 7 public search returned HTTP 401; resolve upstream access before claiming live search |
| Personal MCP/REST Gateway | Implemented, acceptance pending | Discovery and planning only; no signing or submission; validate authenticated access |
| Telegram | Implemented, acceptance pending | Bot configuration and account acceptance needed; Mini App signing is unavailable |
| Privy administration and wallet registry | Verified in isolated Preview | Both administrators and normal-user rejection accepted September 9; production configuration and acceptance pending |
| Waitlist and connections | Implemented, acceptance pending | Validate persistence and export independently |
| Model-backed planner | Implemented, acceptance pending | Opt-in, plan-only; evaluate configured model and free-language behavior |
| Avalanche Fuji, Solana Devnet and CCTP | Experimental | Local contracts tested; each flow requires independent on-chain acceptance |
| WebMCP | Experimental | Shared registration, lifecycle and error handling; browser compatibility acceptance remains pending; no direct faucet tool |
| Commerce demo | Experimental | Simulated settlement is explicitly distinct from real fulfillment |
| Autopilot | Experimental | Policy-only baseline; no ready delegated signer |
| Soroswap and DeFindex USDC | Experimental | Revalidate upstream liquidity and exact-asset funding |
| MPP Router / Stellar 8004 | Experimental | Discovery / registration draft respectively; not automatic spending or on-chain registration |
| Stellar Bazaar discovery | Implemented, acceptance pending | Read-only search implemented September 10; explicit server activation and approved origin required. Real authenticated catalog acceptance remains pending |
| Stellar Bazaar consumption | Planned | Preparation, payment and recovery for Bazaar are not enabled |
| Base Sepolia and BNB Testnet wallet registration and balances | Verified in isolated Preview | Same EVM ID/address as Fuji; production activation pending. New transfers are outside acceptance |
| Gmail, Drive, Calendar, Trello, ArcusX | Planned | Do not advertise as available integrations |
| Mainnet, delegated autonomous payments, escrow and refunds | Planned | Separate future acceptance and product decisions |

## Next gates

1. Complete the production inventory, backup verification, guarded migrations and controlled rollout. Preview sessions and the single fixed-demo Stellar payment passed on September 9; preserve those exact evidence versions.
2. Complete authenticated WebMCP wallet queries and Bazaar discovery acceptance. No additional payment is required for this release.
3. Implement and validate preparation and consumption from Stellar Bazaar exclusively inside Carmelita in a separate delivery.
4. Expand financial operations and additional channels with independent evidence.

See [the audit](auditoria-y-hoja-de-ruta-2026-09-07.md), [stabilization](stabilization-2026-09-07.md) and [Bazaar consumer plan](stellar-bazaar-consumer-plan.md). The July historical evidence remains in the audit and capability documents; it must not be presented as a new validation.
