# Multichain onboarding — 2026-09-27

Base: main f775111. Branch: codex/multichain-onboarding.

## Implemented

Normal Carmelita sign-in prepares Stellar, EVM and Solana independently. Existing identities are reused. Family failures return a bounded status and retry policy; conflicts do not select a replacement. Solana now validates the canonical database identity against Privy instead of selecting the first candidate.

Stellar registration precedes its bounded (8 second) network read. Unknown activation preserves an existing database status; the response reports unknown activation and unavailable balance explicitly. EVM networks share the existing identity and use the server allowlist. OAuth, administration and MCP do not invoke onboarding.

Bootstrap retains its existing fields. Unavailable family objects are null, preparation has stellar/evm/solana results (ready, failed, conflict), and reads.stellar distinguishes unavailable network reads. General database errors return HTTP 503. No migrations or new endpoints.

## Local evidence

- Node 24.14.0; clean installation with npm 11.6.1 and normal lifecycle scripts passed.
- Lint: passed, zero warnings.
- Suite: 631 passed, zero failed, two existing external skips.
- Build: passed. No migration invoked.
- Guarded QA SQL: 14 passed, zero failed; temporary fixtures cleaned by the existing guarded runner. Includes real concurrent transactions and preservation of active Stellar registration when activation is unknown.
- Graphify updated: 3104 nodes, 7302 edges. SQL AST parsing unavailable because tree_sitter_sql is missing.
- Existing TypeScript fixture defects in production-firewall and production-release-evidence were corrected without weakening assertions.

## External acceptance pending

Preview must use dedicated branch-scoped QA connections and expansion enabled. Validate two explicit Privy sessions, five networks, original identities, partial retry UI and admin rejection. Public production connections and wallet identities must remain untouched until Preview acceptance. ChatGPT comparisons follow normal Carmelita onboarding, never create wallets through OAuth/MCP.

Production promotion, real account provisioning and subsequent ChatGPT comparison have not been performed for this branch.

## Preview provisioning blocker — 22:54 UTC

Code candidate: 2fefe5368050d7d829961a19d82a0aaafd25ed8d. PR: https://github.com/CaBsCrypto/carmelita/pull/32.

Final local qa:local passed after the wallet-status label adjustment. Vercel deployment dpl_B6XcEHxJdC67YiG1qWPmmRQHd8Mz failed before build: the neon-copper-ridge integration reports "Branch limit reached" while creating a database branch. This is separate from the existing QA database, whose guarded SQL acceptance passed.

Dedicated QA variables were configured exclusively for codex/multichain-onboarding and checked against the production hostname. EVM expansion is enabled for that isolated branch; Bazaar discovery is disabled. Branch alias: https://agente-asistente-git-c-574e92-cabscryptocontacto-6028s-projects.vercel.app (not a working accepted Preview yet).

Requested approval to remove Preview scope from the production Neon connection while preserving Production and the separate QA integration. This project-wide connection change has NOT been applied. No database branches have been deleted, no plan upgraded and no production deployment changed.
