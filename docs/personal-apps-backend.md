# Personal app enrollment backend

The reviewed definition, the personal installation and the external identity are separate records. A developer proposal never approves an adapter or installs it for any user. Only the registered `bazaar-v1` code profile can be approved; an arbitrary URL, instruction or skill cannot become a code adapter.

## Interfaces and states

`app/apps/service.ts` exports `listAvailableApps`, `listOwnApps`, `prepareAppChange`, `confirmAppChange`, `cancelAppChange`, `retryAppConnection`, `assertOwnAppActive` and the server-only `readOwnBazaarCredential`. Each personal operation requires a verified Privy DID supplied by the calling authentication path. The caller supplies the trusted `web` or `chatgpt` channel; it must never accept a channel or owner selector from the model/body. An explicit retry resumes the saved intention without a new generation or new consent; retrying a removed app only completes its pending revocation and cannot reactivate it. GET/list never perform this work.

Preparation freezes adapter version, definition hash, permissions, action, owner, channel and installation generation for ten minutes. A random confirmation token is encrypted in storage and its hash binds the change. Confirm consumes the prepared change once; retries recover the same transition. Cancellation, expiration, another owner, another channel, modified hash or stale installation generation cannot authorize it. MCP must keep the token outside model-visible text and supply a native human confirmation before calling confirm.

Definitions default to `awaiting_review`. `approveRegisteredApp` and `suspendRegisteredApp` are server functions for authenticated administrative routes, independent of the proposal queue. Their evidence and reviewer remain private. Approval is not evidence that a hosted provider is operational.

An add first creates a `preparing` installation. Recovery, web and restricted ChatGPT credentials are generated locally, encrypted with the existing `CONNECTOR_ENCRYPTION_KEY`, and persisted with a stable creation UUID before a network enrollment. The fixed Bazaar consumer profile sends only SHA-256 hashes in bodies and the individual recovery credential in Authorization. Its runtime is disabled unless `CARMELITA_BAZAAR_APPS_ENABLED=true`; enabling it requires the separately accepted Bazaar consumer contract and an authorized publication.

The HTTP contract uses `/api/consumer/enroll`, `/api/consumer/enrollment`, `/api/consumer/identity`, `/api/consumer/grants/status`, `/api/consumer/grants/revoke` and `/api/consumer/grants/rotate`. No arbitrary target URL, general marketplace workspace key or user credential is exposed. Web and ChatGPT use distinct tokens and fixed grants. ChatGPT cannot create an order, request a payment challenge or submit a payment. Web payment grants still require the separate exact-operation approval policy; installing an app never signs or pays.

An installation becomes `active` only after the remote owner/identity and both exact grants are verified. Failed or lost responses keep the intention recoverable. Remove blocks access locally before any network work, then revokes both grants. If an original enrollment can still finish, removal reports `revocation_pending` instead of falsely certifying absence. A late receipt is fenced from activation and triggers compensation against the current removal. Partial enrollment receipts preserve the owner and original creation hashes. Re-add rotates grants while retaining the same owner and workspace. Reads recheck the local generation after awaiting identity verification.

## Database and tests

Migration `0022_personal_apps` adds reviewed definitions, personal installations, changes, enrollment intentions, private operations and proposal review fields. `personal_apps_mutate` executes each mutation in one PostgreSQL transaction and locks the persisted owner row, so Neon HTTP does not need an interactive transaction. There is no runtime schema creation. A partial unique index permits only one unresolved purchase per owner/app, including `uncertain`; a completed operation releases the slot. Do not apply this migration to production during local preparation.

Run the reproducible isolated SQL suite with PostgreSQL WASM (PGlite **0.3.14**, no Neon/database URL):

```powershell
node scripts/test-personal-apps.mjs --prepare-runtime
npm install --prefix work/personal-apps-qa/runtime --ignore-scripts --no-audit --no-fund
node scripts/test-personal-apps.mjs
```

The runtime manifest, lockfile and module live in ignored `work/personal-apps-qa/runtime`; application dependencies stay unchanged. The runner requires the pinned package and sets `CARMELITA_SQL_TESTS_REQUIRED=true`, so the focused SQL acceptance cannot silently skip. The ordinary test suite discloses skipped SQL cases if that optional local runtime is absent. Tests use synthetic owners and injected provider/secret adapters; they execute the real SQL function and constraints, not a production migration or hosted provider acceptance.

## Cross-repository local conformance

`node scripts/test-personal-apps-contract.mjs [Bazaar checkout]` requires the native Bazaar fixture and pinned PGlite runtime. The default checkout is the sibling `../bazaar-consumer-pilot`; a missing checkout is a failure of this command. The ordinary suite explicitly skips this extra case unless `CARMELITA_BAZAAR_CHECKOUT` is supplied. No repository is cloned and no environment file is loaded by the runner.

The test calls Carmelita's actual consumer provisioner against Bazaar's actual `consumerHandlers` and workspace store with an isolated memory CAS driver. It executes Carmelita's real PostgreSQL mutation function. It verifies separate accounts and web/ChatGPT grants, response-loss recovery, revocation, grant rotation with the same owner, partial-enrollment receipts, approval-hash changes and competing prepared confirmations. Global fetch is blocked; only the six fixture consumer routes are reachable. This is local protocol conformance, not hosted acceptance, a real payment, Redis acceptance or a native ChatGPT/mobile test.

## Local visual fixture

`node scripts/serve-personal-apps-ui-fixture.mjs` bundles the current `AppsClient`, `BazaarPanel`, their actual CSS Modules and the shared locale store into ignored `work/personal-apps-qa/ui`, using the installed esbuild **0.28.0**. It serves only loopback `http://127.0.0.1:8152/apps` with `/health` and finite synthetic API receipts. Isolated build aliases replace Privy, raw-hash signing, Next Link and Image; production authentication files are untouched. The server reads public Inter/font and brand files inside the checkout. No environment file, database or provider is used.

The visible notice says “Local UI fixture — synthetic accounts, no payments”. Controls switch two synthetic identities, signed-out/loading states, connected/pending/empty states, catalog partial/unavailable states and delayed replies. EN/ES/PT use the real locale store. Twenty illustrative cards include Guionista first. The installation and operation dialogs are actual components, but their HTTP receipts are UI fixtures; signing throws and the execute route returns 403. This preview can validate layout and interaction only. Restart the script after source edits to rebuild the bundle; there is no production or hosted acceptance from its apparent connected state.

`/apps/native-confirmation` hosts the actual `appConfirmationHtml` resource in a sandboxed iframe with `connect-src 'none'`. Its local host handles initialization, sizing and only three app-management names: confirm, cancel and retry. Explicit controls send synthetic previews and choose locale/pending outcomes; the visible calls count starts at zero and redacts the synthetic nonce in its log. This can demonstrate that the renderer waits for a human click, but cannot establish native ChatGPT support or authenticated host provenance.
