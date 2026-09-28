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

## Aceptación visible de dos cuentas — 2026-09-27 23:02–23:12 UTC

Candidato e820e06430e1cf006110116f3b23c2d471a9dbf0, deployment dpl_5FYuz7x3BWoCESA15mA8PdVx4hM6. Ambas cuentas QA ingresaron por Privy en el acceso normal. Ambas mostraron tres familias registradas y cinco asociaciones; cada cuenta conserva su propia dirección EVM compartida en Fuji/BNB/Base. Las consultas de saldo EVM y Solana y los rechazos de parámetros ajenos, Mainnet y redes desconocidas aprobaron.

Comparación SQL contra la referencia capturada antes de los ingresos: unchanged=true, seis billeteras y diez asociaciones (23:06:14 y 23:09:06 UTC). Sin fondos, firmas ni pagos. La recarga de la segunda cuenta aprobó la comparación con su referencia de 23:09:22 UTC. La primera cuenta conservó identidades tras recarga según UI y SQL. El cierre entre cuentas confirmó terminación administrativa y Privy.

Pendiente: el control automatizado de rechazo administrativo falla con error genérico, no acredita un rechazo de rol. El ejecutor usa credentials=omit; queda por determinar si la protección de Preview impide esa solicitud. Una llamada sin token mediante Vercel CLI autorizado devuelve access_denied, pero no sustituye la aceptación autenticada. Además /admin/login presenta el formulario de contraseña: CARMELITA_ADMIN_EMAILS no está configurado efectivamente en este candidato. Debe ajustarse el ámbito de Preview y repetirse la aceptación administrativa antes de publicar. No se ha promovido producción.

## Acceptance update — 2026-09-28

This section supersedes the pending-status summaries above; earlier sections retain their original evidence dates.

Validated code: e3568a85a13c3877247ea761ada67d09ab5ae8c8. Preview: https://agente-asistente-1njvbkkd6-cabscryptocontacto-6028s-projects.vercel.app. Branch alias remains unchanged. CI and Vercel passed. Local lint and build passed; 636 tests passed, zero failures, two existing external omissions. Graphify update completed; SQL AST coverage remains unavailable because tree_sitter_sql is missing.

The production Neon connection was restricted to Production with explicit approval; QA remains separate. Both approved administrators accessed the Preview through Privy without normal onboarding. The registry remained at nine wallets/fifteen associations during those administrator checks. Closing both sessions returned the protected panel to login. The earlier administrator-check failure was resolved by retaining Preview cookies while using verifyOnly to avoid creating an administrator session.

The existing complete account, the incomplete account and the additional onboarding account each passed the fourteen wallet checks on 5ed2f11. Chat returned three wallet addresses and native balances across five networks. Pending Stellar activation was explicit and no funding or financial operation was performed. The additional account completed an explicit logout and Privy login; identities matched the reference captured at 2026-09-28T02:10:07.069Z. Do not infer a globally new Privy identity solely from a new QA registration.

On e3568a8, the Spanish multichain greeting and the new localized Stellar activation-pending balance response were verified in the chat. Historical balance messages remain unchanged. The fourteen checks passed at 2026-09-28T03:27:47.933Z, using the new-version reference captured at 03:27:29.893Z. This is a reload check, not another explicit login cycle. Rejection of an owner override is HTTP 400 parameter validation, not proof of arbitrary cross-owner resource access.

Read-only SQL comparison at 2026-09-28T03:34:47.138Z: all original six wallets and ten associations preserved (unchanged=true); current QA inventory twelve wallets and twenty associations. Counts include legitimate subsequent registrations. Private raw UI evidence remains in ignored local work files; no credentials or wallet addresses are included here.

Remaining release gates: final diff review, production configuration/identity snapshot and compatible rollback deployment, controlled promotion, and real production onboarding followed by ChatGPT comparison. No production publication or current-branch production acceptance is claimed. New registration-event wording is covered by code review; no extra wallet was created solely to test that text.

## Sprint 1 corrections — 2026-09-28

Review found three additional resilience defects after the earlier acceptance. Canonical database SELECT failures now become wallet_persistence_unavailable, so bootstrap returns HTTP503 rather than partial HTTP200. Identity conflicts remain distinct; the failed family never creates a replacement wallet.

Chat context Stellar reads now have a ten-second cancellation/deadline. Persisted wallet listing and per-network balance intents skip the ancillary Stellar context both before and after processing. Other intents retain their post-action refresh with a bounded read. Three UI paths now distinguish unavailable balance, activation pending and a real zero, including the DeFindex balance display.

Regression evidence uses actual bootstrap POST, admin POST and sendAgentMessage orchestration with simulated dependencies, without external transactions. Admin verifyOnly never sets a session cookie; normal authorized exchange does; rejected identities and invalid origins do not. Existing identity tests cover expiry and membership.

Integrated local result: lint passed with zero warnings; 643 tests passed, zero failed, two existing external omissions; build passed without migration. Graphify updated to 3129 nodes/7381 edges, with the existing SQL parser limitation. The earlier clean npm ci remains applicable because dependencies and lockfile are unchanged.

New-candidate CI and visible Preview acceptance remain pending at this cut. Prior accepted deployment evidence is historical and is not relabeled as acceptance of these corrections. Production promotion and chat-first redesign remain separate future gates.

### Production preparation — 2026-09-28

- Live production deployment metadata identifies `dpl_ERRNhWW8pVVvuJpsrckhLTf1n6Lc`, commit `f7751111fdb4f473025af34838644991a1d31e18`, READY, build `npm run build`. Project production branch is main; `autoAssignCustomDomains=false` was observed.
- Added `carmelita.browns.studio` to Preview isolation's production-origin rejection, including URL/hostname and case/trailing-dot regression coverage. Focused tests: 15 passed.
- Read-only database inspection at 2026-09-28T05:25:26.738Z using previously captured connections: 22 journal entries, zero pending statements, 8 wallets, 8 network associations, 8 historical payment records. Private evidence retains hashes only. No migration or data mutation occurred.
- Effective configuration gate remains pending: Vercel env run and its read endpoint return database variable names but empty values in both env/buildEnv. Stored connections alone do not prove the deployment destination.
- Exact rollback commit local simulation passed with synthetic existing identities and five network bindings; creation/network calls prohibited. This does not constitute a SQL or deployed rollback drill.
- Graph updated (3129 nodes, 7381 edges); SQL extraction remains unavailable because tree_sitter_sql is missing.
- Production promotion, SQL rollback acceptance and production login/ChatGPT acceptance remain pending. No production configuration changed.
