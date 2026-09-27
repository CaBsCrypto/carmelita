# Multichain onboarding — 2026-09-27

Base: main f775111. Branch: codex/multichain-onboarding.

## Implemented

Normal Carmelita sign-in prepares Stellar, EVM and Solana independently. Existing identities are reused. Family failures return a bounded status and retry policy; conflicts do not select a replacement. Solana now validates the canonical database identity against Privy instead of selecting the first candidate.

Stellar registration precedes its bounded (8 second) network read. Unknown activation preserves an existing database status; the response reports unknown activation and unavailable balance explicitly. EVM networks share the existing identity and use the server allowlist. OAuth, administration and MCP do not invoke onboarding.

Bootstrap retains its existing fields. Unavailable family objects are null, preparation has stellar/evm/solana results (ready, failed, conflict), and reads.stellar distinguishes unavailable network reads. General database errors return HTTP 503. No migrations or new endpoints.

## Local evidence

- Node 24.14.0; installation with npm 11.6.1 (local initial ci used --ignore-scripts; full lifecycle installation remains to be confirmed by CI).
- Lint: passed, zero warnings.
- Suite: 631 passed, zero failed, two existing external skips.
- Build: passed. No migration invoked.
- Guarded QA SQL: 14 passed, zero failed; temporary fixtures cleaned by the existing guarded runner. Includes real concurrent transactions and preservation of active Stellar registration when activation is unknown.
- Graphify updated: 3104 nodes, 7302 edges. SQL AST parsing unavailable because tree_sitter_sql is missing.
- Existing TypeScript fixture defects in production-firewall and production-release-evidence were corrected without weakening assertions.

## External acceptance pending

Preview must use dedicated branch-scoped QA connections and expansion enabled. Validate two explicit Privy sessions, five networks, original identities, partial retry UI and admin rejection. Public production connections and wallet identities must remain untouched until Preview acceptance. ChatGPT comparisons follow normal Carmelita onboarding, never create wallets through OAuth/MCP.

Production promotion, real account provisioning and subsequent ChatGPT comparison have not been performed for this branch.
