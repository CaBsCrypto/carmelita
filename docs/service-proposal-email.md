# Service proposal email notices

Developer proposals stay in the private review inbox at `/admin/integrations`. An email notice links to that inbox; it does not accept, publish or activate a service. The developer's contact address remains in the inbox and is not the notification recipient.

## Configuration

Use the feature-specific [environment example](service-proposal-email.env.example). No changes to the shared root `.env.example`, database schema or wallet contracts are needed.

1. Create a Resend account and verify a sender domain you control using the DNS records supplied by the provider. Choose a bare sender address on that domain, such as `notifications@your-domain.example`.
2. Store the server-only `RESEND_API_KEY`, `CARMELITA_PROPOSAL_EMAIL_FROM` and a single `CARMELITA_PROPOSAL_EMAIL_TO` recipient in the environment's secret configuration. Real credentials and recipients must not be committed.
3. Set the explicit HTTPS `CARMELITA_PUBLIC_ORIGIN`. Production uses the canonical Carmelita domain; Preview must use its isolated QA origin. The inbox URL is derived from this trusted configuration, never the public form request's Host header.
4. Keep `CARMELITA_PROPOSAL_EMAIL_ENABLED=false` until setup is complete. Set it to the exact string `true` to queue notices for newly saved developer proposals. Missing or invalid mail configuration leaves those notices pending while proposals remain visible. Enabling later does not backfill historical proposals.
5. The existing PostgreSQL connection and proposal schema remain necessary. The feature lazily creates `carmelita_proposal_email_jobs` and its index when enabled; the application database role needs permission for that DDL. The proposal and queue record commit in a single SQL statement.
6. A new submission schedules a best-effort dispatch after the response. Administrators can process due notices using **Retry due email notices** in the inbox. This respects backoff; it cannot force an accepted notice to resend.

No secrets were fetched, sender domain configured, scheduler installed or real mail sent as part of local implementation. Activation and publication are separate actions subject to the existing Vercel build controls.

## Persistent retries

Each invocation processes at most five due notices. Claims use a 60-second lease and `FOR UPDATE SKIP LOCKED`; completion is fenced by the current lease token. The full mail payload and routing are frozen before the first provider request. Every retry uses the same `proposal/<UUID>` idempotency key and identical payload, including after a process restart or template change.

Transient errors use exponential backoff, starting at 30 seconds, respecting bounded provider `Retry-After`. Automatic sends stop after eight attempts or 23 hours from the first attempt. Uncertain or permanent failures become **Needs manual review**. Do not reset the key or blindly resend these jobs: inspect the provider record first to avoid duplicate mail outside the provider's 24-hour idempotency window. **Accepted by provider** means API acceptance, not confirmed mailbox delivery; delivery webhooks are outside this change.

For unattended recovery after a lost process and no further submissions, configure a later scheduler to call `GET /api/admin/integrations/notifications` with `Authorization: Bearer <CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN>`. Use a random 32–256 character server secret. Keep the token out of query strings. No scheduler or Vercel cron is added by this change. The admin POST requires an authenticated administrator and matching origin. Neither route accepts a recipient, message, credential or job override in its request.

### Prepared dispatcher; scheduling remains disabled

`scripts/proposal-email-dispatch.mjs` provides a single invocation for a future scheduler. It reads only explicitly supplied environment variables; it never loads application `.env` files.

```powershell
node scripts/proposal-email-dispatch.mjs --check
# Execution requires an approved environment and scheduling configuration:
node scripts/proposal-email-dispatch.mjs --execute
```

The default and `--check` validate configuration without a network request. `--execute` makes one authenticated GET, does not follow redirects or retry internally, and returns only safe status and counters. It accepts the canonical HTTPS production origin or a literal HTTP loopback IP for isolated local QA. Arbitrary Preview domains are deliberately excluded. A request has a 30-second client deadline and a 16 KiB response limit. A timeout does not prove that server execution stopped; the persisted lease and idempotency key still control recovery.

The scheduler is not installed and its server secret has not been provisioned. During publication preparation, choose a scheduler, provide the capability separately to Carmelita and that scheduler, verify `--check`, and agree its frequency and runtime cost before enabling it. Never pass the capability as a command argument or URL. Do not enable production email merely to check configuration.

## Data sent to the provider

The fixed English notice contains only an opaque proposal ID and the private inbox URL. It excludes developer email, service name, description, credentials and wallet information. Provider errors are reduced to safe codes; raw response bodies are not logged or returned publicly.

## Local verification

Focused tests cover the public proposal route, private inbox, transport, worker and dispatch authorization. No network email is permitted in the fixtures. The SQL fixture additionally runs the actual store against PGlite PostgreSQL with persistent files, including rollback, duplicate protection, lease recovery, stale-worker fencing and independent-process restoration.

To reproduce the optional local SQL engine without changing application dependencies:

```powershell
npm install --prefix work/proposal-email-qa --save-exact --ignore-scripts @electric-sql/pglite@0.5.9
node_modules/.bin/tsx --test tests/proposal-email-store.test.ts
```

PGlite serializes one connection; it verifies PostgreSQL statements and lease exclusion, not contention between independent PostgreSQL connections. A separate isolated hosted acceptance must verify the real sender, mailbox delivery, database role and multi-connection behavior before announcing availability.

### Disposable native PostgreSQL acceptance

`scripts/proposal-email-postgres-local.mjs` starts a temporary PostgreSQL server on `127.0.0.1`, creates a non-superuser QA role and database, runs the acceptance, stops its owned server and removes only its checked UUID cluster. It installs no Windows service and does not load application environment files. The fixture executes the actual outbox SQL through two independent PostgreSQL connections; the driver adapter is confined to the fixture.

Prerequisites remain outside application dependencies and Git:

- Official portable PostgreSQL binaries under `work/proposal-email-qa/runtime/pgsql`, including `bin`, `lib`, `share` and the server licence. [PostgreSQL's Windows download page](https://www.postgresql.org/download/windows/) links to the [EDB binary archives](https://www.enterprisedb.com/download-postgresql-binaries).
- The pinned local driver: `npm install --prefix work/proposal-email-postgres-runtime --save-exact --ignore-scripts pg@8.16.3`.

```powershell
node scripts/proposal-email-postgres-local.mjs
```

The opt-in fixture refuses external hosts, DNS names, inherited connection overrides, non-QA database names and unowned schemas. It does not use Neon, Privy or Resend. The native acceptance is separate from the ordinary test suite and from production acceptance.

### Verification on October 12, 2026

- Full application suite: 1,069 passed, two existing opt-in tests skipped; lint, TypeScript, seven Graphify tooling tests and local production build passed.
- SQL fixture: ten PostgreSQL cases, including restoration in an independent process. Worker and dispatch fixtures: 16 internal cases. All provider calls were mocked.
- Browser at `127.0.0.1:8152`: the real form, proposal route, SQL outbox, transport and inbox saved two synthetic proposals. A duplicate retained the original record and generated no second notice. A simulated 503 left the second proposal visible with its notice scheduled for retry; after restoring the fake provider, the actual admin button processed it successfully after the backoff. Three fake provider attempts produced two unique accepted notices, with zero external requests.
- The new panel fit a 320 px viewport without internal overflow; browser console had no errors or warnings. Screenshots and receipts remain under ignored `work/proposal-email-qa/`.
- Graphify was updated using AST extraction only. Existing missing SQL extractor and runtime skill-version warnings remain; no packages or skills were upgraded.

This is local evidence using a fictional administrative identity and synthetic email addresses. No real delivery, production database acceptance, Vercel build, push or deployment occurred.

### Next local acceptance block — October 12, 2026

- Native PostgreSQL 17.11 with driver `pg@8.16.3`: six scenarios passed using independent backends and a non-superuser role. They cover atomic rollback, concurrent duplicate submission, one winner for simultaneous claims, `SKIP LOCKED`, stale-worker fencing and persisted payload recovery in a fresh process.
- Browser integration used the real form, POST, outbox, worker, transport and review page with PostgreSQL on loopback, a fictional administrator and a simulated email provider. Two proposals remained pending manual review. A duplicate preserved the original record and created no second notice. A simulated 503 preserved the proposal and scheduled a retry.
- After stopping and restarting both the QA application and PostgreSQL, the prepared dispatcher recovered the saved notice without another form submission. A second dispatcher invocation processed zero jobs. The frozen message and idempotency key were unchanged; no external email or database request occurred.
- Private-inbox and dispatch fixtures now exercise the actual admin authorization with synthetic identities. Ordinary users, cancelled sessions and worker capabilities do not gain inbox access or administrative POST permission. The worker capability dispatches notices only.
- Regression suite: 1,083 passed and three opt-in cases skipped; the native PostgreSQL opt-in was executed separately with both outer tests passed and no skips. Lint and TypeScript passed. No application source or application dependency changed in this block; the previous local application build remains the build evidence for that unchanged source.
- Graphify's AST-only update completed: 4,048 nodes, 10,392 edges and 187 communities. Existing SQL-extractor and skill-version warnings remain. Its parser partially extracted `tests/proposal-email-postgres-fixture.mts`; that fixture passed TypeScript and executed successfully. Community names were regenerated from hubs without an LLM relabel. This limits graph coverage, not the executed acceptance results.
- Reproducible SQL receipts, browser snapshots and restart comparisons are saved under ignored `work/proposal-email-qa/`. A separate provider-setup test previously confirmed real mailbox delivery; that is distinct from this simulated application acceptance.

Production email remains disabled. Production schema permissions, the Neon HTTP adapter, a real administrator opening the notice link and an installed unattended scheduler still require acceptance in the agreed publication window. No production SQL, additional real email, push, deployment or hosted build was performed in this block.

## Gates for a single grouped publication

| Gate | Current evidence / next action |
| --- | --- |
| Saved proposal and safe duplicate | Passed locally through the real form and SQL outbox; preserve manual `new` status. |
| Private review access | Actual authorization passed with synthetic identities; verify a real reviewer and an ordinary user in the agreed environment. Receiving email does not itself grant admin access. |
| Database preparation | Non-superuser DDL and contention passed locally; verify the actual deployment role and Neon HTTP adapter before enabling notices. Preserve existing proposals and wallets. |
| Sender and recipient | Provider setup and one real inbox delivery were verified separately. Confirm environment names and trusted origin without copying credentials into the repository. |
| Unattended recovery | Dispatcher is prepared and recovered a local pending notice after restart; scheduler choice, capability, cadence and cost remain pending. |
| Publication control | Review the complete branch and current main/PR state, Billing, final SHA and rollback. Agree one publication before pushing or merging main. Keep the Vercel Preview filter intact. |

Only after those gates are accepted should the mail feature be enabled and a real application proposal be verified from submission through storage, notice and private review. This is separate from approval, catalogue publication or a user's installation of a service.

Rollback starts by disabling proposal notices and pausing the future scheduler, then restoring the previously accepted application version through the agreed procedure. Keep proposal and outbox rows, frozen payloads and keys; do not drop tables, reset accepted jobs or blindly resend uncertain deliveries.

Provider references: [sending email](https://resend.com/docs/api-reference/emails/send-email), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
