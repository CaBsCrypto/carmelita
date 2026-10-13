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

### Verification on October 12, 2026

- Full application suite: 1,069 passed, two existing opt-in tests skipped; lint, TypeScript, seven Graphify tooling tests and local production build passed.
- SQL fixture: ten PostgreSQL cases, including restoration in an independent process. Worker and dispatch fixtures: 16 internal cases. All provider calls were mocked.
- Browser at `127.0.0.1:8152`: the real form, proposal route, SQL outbox, transport and inbox saved two synthetic proposals. A duplicate retained the original record and generated no second notice. A simulated 503 left the second proposal visible with its notice scheduled for retry; after restoring the fake provider, the actual admin button processed it successfully after the backoff. Three fake provider attempts produced two unique accepted notices, with zero external requests.
- The new panel fit a 320 px viewport without internal overflow; browser console had no errors or warnings. Screenshots and receipts remain under ignored `work/proposal-email-qa/`.
- Graphify was updated using AST extraction only. Existing missing SQL extractor and runtime skill-version warnings remain; no packages or skills were upgraded.

This is local evidence using a fictional administrative identity and synthetic email addresses. No real delivery, production database acceptance, Vercel build, push or deployment occurred.

Provider references: [sending email](https://resend.com/docs/api-reference/emails/send-email), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
