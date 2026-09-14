# Founder admin operations

The private workspace lives at `/admin`. It is server-protected and must never
be linked from the public navigation.

## What the dashboard covers

- Real waitlist demand, excluding records with `source = codex-smoke`.
- Recent signup velocity for YC reporting.
- Pipeline stages: waiting, contacted, interviewed, pilot, accepted and declined.
- Founder priority, owner, tags and internal notes.
- CSV export for analysis and accelerator applications.
- An activity record for every lead update.

## Access model

### Privy administrators: explicit environment configuration

The isolated Preview uses `CARMELITA_ADMIN_EMAILS`, a server-only comma-separated
allowlist stored as a sensitive Vercel variable scoped to its Git branch.
When present, it exclusively enables Privy administrator login: legacy password
cookies and workspace email headers cannot grant access in that environment.
`/admin/login` signs in through Privy without bootstrapping or funding wallets.
The server verifies the access token, fetches its subject's identity from Privy,
and checks the current email allowlist on every protected request. Expired tokens,
removed emails and verification errors deny access. The HTTP-only admin cookie
lasts at most one hour; token validity is still checked on every request.

`CARMELITA_TEST_EMAILS` is a private acceptance roster only. It grants no privilege,
does not restrict ordinary registration, and does not pre-create accounts or wallets.
The configured Preview has two administrators and two ordinary test identities;
their actual addresses are intentionally kept out of the repository.

Use `/admin/wallets` to inspect registered users and wallet provisioning status.
Users appear after they complete the application login/bootstrap flow, not merely
because their email was listed in configuration. This panel does not impersonate
users or authorize transactions. Both Preview administrators completed the visible
login and logout acceptance on September 9. Production acceptance remains pending.

Configuration applied on 2026-09-08 only to Preview branch
`fix/webmcp-type-contract` in the existing Vercel project. Production remains
unchanged. Graphify update remains blocked by its missing Python 3.12 interpreter.

The existing production deployment uses a password hash and a signed, HTTP-only 12-hour session cookie.
The prepared release switches to Privy only after `CARMELITA_ADMIN_EMAILS` is
explicitly configured there. Preview settings are not inherited. See the
[production activation record](PRODUCTION-ACTIVATION-2026-09-14.md).
The password itself is never stored. Required variables:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`

Sites/ChatGPT deployments may additionally use `ADMIN_EMAILS` as a
comma-separated allowlist for authenticated workspace users.

## Operating rhythm

1. Review new `waiting` records daily.
2. Mark the strongest problems as high priority.
3. Move a lead to `contacted` when outreach begins.
4. Record interview evidence in internal notes.
5. Move validated design partners to `pilot`.
6. Export CSV before each YC application update.

## Security rules

- Do not expose admin APIs in public navigation or client-side secrets.
- Never commit local environment files.
- Rotate the founder password if it is shared or lost.
- Use notes for business context, not payment credentials or sensitive identity
  documents.


## MCP service providers

- Open `/admin/providers` to create a provider identity and its first scoped MCP key.
- Copy the raw key immediately; the application stores only its SHA-256 hash.
- Deliver pilot keys through a secure channel, never email or chat history.
- Provider token rotation and revocation controls are the next operational milestone.
