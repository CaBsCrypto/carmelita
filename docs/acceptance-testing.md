# Acceptance testing

## Current workflow — September 8, 2026

This delivery validates an isolated Carmelita Preview: application contracts, dedicated test identities, registered wallets and the read/planning Gateway. Production remains at `https://carmelita-agent.vercel.app/`. No funding, trustline preparation, signature, payment, reservation or Bazaar mutation belongs to this workflow.

The commands below describe the current runner interfaces. They are not evidence that a deployment or human acceptance has passed. Save the actual dated output together with the reviewed commit and deployment.

For the current PR #28 Preview, administrator access uses the server-verified
Privy allowlist (`CARMELITA_ADMIN_EMAILS`). The password-based wallet-registry
runner below is a legacy interface and cannot authenticate this configuration.
Keep the allowlist enabled. Use the visible `/admin/login` flow and
`/admin/wallets` for the registry check; `/preview-acceptance` supports the
real-session ownership checks without exporting tokens. Close both Privy and
administrator sessions when switching accounts. The completed two-user evidence
and its limits are in [the dated report](real-user-preview-acceptance-2026-09-08.md).

| Command | Effects and coverage |
| --- | --- |
| `npm run qa:local` | Local lint, tests and build; no deployment or migration |
| `npm run acceptance:doctor -- --url URL --json` | Public HTTP contracts, official x402 challenge and distributor balances; external reads only |
| `npm run acceptance:travala -- --url URL --json` | Doctor checks plus a live future hotel search; no reservation |
| `npm run acceptance:authenticated -- --url URL --deployment DEPLOYMENT --commit SHA40 --json` | Protected Preview contracts and authenticated persisted wallet status; no bootstrap by default |
| Same authenticated command with `--allow-bootstrap` | Explicitly provisions the dedicated test user's records and wallets, repeats bootstrap, then compares all three addresses |
| `npm run gateway:preview:acceptance -- --url URL --deployment DEPLOYMENT --commit SHA40` | Creates synthetic test PATs and planning fixtures in the isolated database; verifies REST/MCP authorization, idempotency and revocation; cleans up exact fixture IDs |
| `npm run wallets:preview:acceptance -- --url URL --deployment DEPLOYMENT --commit SHA40 --email USER_A --second-email USER_B` | Legacy password-admin runner; unavailable with the current Privy allowlist. Use the visible administration flow above. |
| `npm run acceptance:execute` | Disabled: exits before requests with `automatic_payment_execution_disabled_use_visible_application_approval` |

`acceptance:doctor` and `acceptance:travala` have no default production URL. `qa:production` delegates to doctor, so it also needs an explicit URL through its arguments or `AGENT_ACCEPTANCE_BASE_URL`. `npm run qa` is not a self-contained release gate without that configuration. Keep external checks separate from local CI.

## Select and verify the isolated Preview

Before any authenticated run, provision a dedicated empty test database, apply its migrations separately from the build, and verify that the branch-scoped Vercel variables point to that resource. Do not copy production users or credentials into it.

All three authenticated runners require a target URL, deployment and full 40-character commit. Supply the command-line flags above or the documented environment equivalents:

| Variable | Requirement |
| --- | --- |
| `CARMELITA_PREVIEW_ISOLATED` | Must be exactly `true` |
| `CARMELITA_PREVIEW_DATABASE_HOST` | Exact isolated database endpoint hostname; the guard normalizes Neon's `-pooler` suffix |
| `CARMELITA_PREVIEW_DATABASE_URL` | Required dedicated runtime connection for the isolated resource, with TLS |
| `CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED` | Required dedicated direct migration connection to the same database with the same identity; a pooled migration URL is rejected |
| `CARMELITA_PRODUCTION_DATABASE_HOST` | Optional explicit production-host comparison; if supplied, it must differ from the isolated host |
| `CARMELITA_PREVIEW_ORIGIN` | Exact HTTPS application origin; no path, credentials, query or fragment |
| `CARMELITA_PREVIEW_DEPLOYMENT` | Explicit selected Vercel deployment; `--deployment` must agree with it |
| `CARMELITA_PREVIEW_COMMIT` | Full reviewed commit, used when `--commit` is omitted |
| `AGENT_ACCEPTANCE_BASE_URL` | URL fallback for `acceptance.ts`; `--url` must still match the isolated origin in authenticated mode |
| `CARMELITA_PREVIEW_URL` | URL fallback for the Gateway and wallet-registry runners |
| `AGENT_ACCEPTANCE_PRIVY_TOKEN` | Temporary token for one exclusive Privy test identity; authenticated runner only |
| `CARMELITA_ADMIN_USERNAME`, `CARMELITA_ADMIN_PASSWORD` | Legacy password-admin credentials; not used or supported by the current Privy-only Preview |

Provide secrets through the session's approved secret mechanism. These runners do not read `.env.migrate` or automatically load another environment file. A local variable declaration alone does not prove the remote deployment uses that database.

Preview runtime, isolated migrations and authenticated acceptance use the two dedicated `CARMELITA_PREVIEW_DATABASE_URL*` connections. They ignore the legacy `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DATABASE_URL_DATABASE_URL` and `DATABASE_URL_DATABASE_URL_UNPOOLED` variables in this workflow. Marketplace integrations can supply those legacy names with other values, so they are never a Preview fallback. If either dedicated connection is missing or invalid, the operation fails before authenticated work; it must not use an inherited production connection. Production retains its existing database configuration.

Before issuing PATs, logging in as administrator or invoking bootstrap, the runners read the selected deployment's `/api/health` and require all of the following:

- `previewIsolation.verified` is `true`.
- Its database fingerprint matches the local acceptance database. The fingerprint is SHA-256 of the normalized hostname plus `/` plus the database path without its leading slash; it contains no credentials.
- `deployment.environment` is `preview`.
- `deployment.gitCommitSha` matches the exact requested commit.

Missing metadata, a production deployment, a changed commit, a different database or a URL/deployment mismatch blocks authenticated work. Failed remote verification is reported with the remaining authenticated work pending.

Authenticated HTTP requests use `vercel curl` through the authorized local Vercel CLI session. The folder must already be linked to the correct Vercel project and that session must have access to the selected deployment. Keep Preview protection enabled. The runners do not follow HTTP redirects or silently switch to production. Bootstrap and administrator requests include the selected origin. Tokens, administrator cookies and database connection strings must never be copied into evidence, screenshots or Git.

## Execute checks without funding or payments

### Public diagnostics

For an explicitly selected public URL:

```powershell
npm run acceptance:doctor -- --url https://carmelita-agent.vercel.app/ --json
```

Doctor checks Testnet safety constants, health semantics, `/agent`, MCP discovery, the official HTTP 402 challenge and distributor balances. It does not prove login, wallet ownership, isolation, delivery or a completed payment. Preview environment variables do not silently replace this public target. For a protected Preview, pass its URL and `--deployment` explicitly.

Travala remains a separate external check:

```powershell
npm run acceptance:travala -- --url https://carmelita-agent.vercel.app/ --json
```

It searches a two-night stay beginning 45 days after execution in Santiago, Chile. `TRAVALA_ACCEPTANCE_LOCATION` changes the location. A successful search proves returned inventory only. The September 7 audit observed HTTP 401; resolution needs new evidence and does not block isolated Stellar onboarding acceptance.

### Dedicated Privy identity

Complete visible Privy login with an exclusive test identity, then provide its temporary access token through the configured secret mechanism. With `$previewUrl`, `$deployment` and `$commit` set to the reviewed target:

```powershell
npm run acceptance:authenticated -- --url "$previewUrl" --deployment "$deployment" --commit "$commit" --json
```

Bootstrap is skipped and reported `PENDING` by default. To explicitly authorize this runner to provision that test identity's records and wallets:

```powershell
npm run acceptance:authenticated -- --url "$previewUrl" --deployment "$deployment" --commit "$commit" --allow-bootstrap --json
```

The runner invokes bootstrap twice and checks that Stellar Testnet, Avalanche Fuji and Solana Devnet addresses remain unchanged. It then reads authenticated x402 wallet status. It never prepares a trustline, calls Friendbot or a USDC faucet, supplies confirmation, signs or executes a payment. The status endpoint is GET-based but may initialize its database schema; isolated database configuration is therefore required even without bootstrap.

Repeat with the second dedicated test identity and keep the reports distinct. These token-based checks do not prove the visible login experience, recovery after logout, concurrent onboarding or isolation between both users. Remove temporary credentials from the process environment when finished.

### Gateway and registered wallets

The wallet command shown here describes the legacy password-admin interface.
Do not run it against the current Privy-only Preview or disable the allowlist to
make it pass. Its registry assertions remain covered by local tests; live
registry acceptance uses the visible administrator session.

```powershell
npm run gateway:preview:acceptance -- --url "$previewUrl" --deployment "$deployment" --commit "$commit"
npm run wallets:preview:acceptance -- --url "$previewUrl" --deployment "$deployment" --commit "$commit" --email "test-a@example.com" --second-email "test-b@example.com"
```

Replace the example emails with the two exclusive test identities. They must differ. The wallet runner checks one valid registered address for each current bootstrap network, no duplicate identity records, no shared wallet address between the selected users and consistent registry totals. An unfunded wallet can pass registration checks; on-chain activation is not required. The runner does not create those users or log them into Privy. Providing fewer than two identities leaves that requirement pending.

The Gateway uses synthetic actors, not actual Privy sessions. It checks read-only scope rejection, plan creation and exact replay, changed-input conflicts, cross-actor plan and receipt denial, MCP discovery and planning boundaries, and token revocation. It never exposes or invokes a signing or execution tool. Cleanup selects this run's token IDs, actor/idempotency-key plan pairs, exact request IDs for audit events and actor/token-specific rate-limit scopes and pseudonyms. The report includes the counts actually removed. Shared or historical rate buckets, unrelated audit events and the two Privy test users and wallets are not selected.

Both commands print JSON directly. `--json` is needed only for the general `acceptance:*` runner's JSON output.

## Interpret evidence and close the delivery

Each report includes `generatedAt`, `url`, `deployment`, `commit`, per-check outcomes and dynamically counted `passed`, `failed` and `pending` totals. Any failed check makes the report `FAIL` and sets a nonzero exit code. Configuration errors also terminate with a nonzero exit. A report containing only passes plus pending work remains `PENDING`; it may exit with code zero, which does not mean full acceptance is complete.

The authenticated, Gateway and registry runners deliberately retain a pending human-acceptance item. There is no flag to turn that item into a pass. Attach separate dated browser evidence for:

1. Two exclusive users completing Privy login and recovering their sessions.
2. Stable wallets after repeated onboarding and session recovery, without funding.
3. Each user's chat and memory surviving logout and reconnection.
4. Rejection of cross-user data, plan and receipt access through real user identities.
5. WebMCP registration, cleanup, session changes and use of the application in a browser without WebMCP support.

Publish the reviewed Preview only after installation, lint, tests and build pass on the consolidated commit, and after branch database configuration and independent migrations are verified. Record the immutable deployment URL/ID, commit, runner output and browser evidence. Keep production unchanged. A public endpoint returning HTTP 200 cannot close this delivery.

## Historical payment procedures — outside this Preview delivery

Earlier versions of this document described production-targeted replay and funded second-user workflows. Those scripts still exist, but they were not converted into the isolated, no-payment acceptance workflow above:

| Historical command | Historical purpose; not part of this delivery |
| --- | --- |
| `acceptance:second-user:start` | Creates a funded Testnet baseline through Friendbot |
| `acceptance:second-user:fund-usdc` | Sends 0.50 Testnet USDC after a separately signed trustline |
| `acceptance:second-user:verify` | Checks the funded baseline, one payment, receipt and final balance |
| `x402:replay:confirmed` | Replays an existing confirmed payment ID and compares receipt and balance |
| `x402:replay:execute` | Submits a prepared payment and its one-time signature, then checks exact replay |

Do not reuse the old sequence of pushing, running production diagnostics and immediately executing a payment to close this Preview milestone. Those legacy runners need their own reviewed targets, preconditions and payment-specific user approval in a later delivery. Disabling `acceptance:execute` does not disable these separate legacy scripts.

The underlying payment recovery policy is unchanged: only `prepared` may atomically enter `signing`; `confirmed` returns the existing receipt; `signing` or `reconciliation_required` must not retry automatically; `failed` requires a new review. A future payment acceptance needs a successful on-chain transaction, a delivered resource and replay evidence showing the same receipt without a second debit. None of those outcomes can be inferred from this milestone's local tests or public health checks.

For dated earlier evidence, see [September 7 stabilization](stabilization-2026-09-07.md). Historical results do not establish the status of a later commit or deployment.
