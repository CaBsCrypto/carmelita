# OAuth identity and revocation review — 2026-09-27

Reviewed the PR #28 implementation based on `fd1a807`. No external configuration or database records were changed by this review.

## Findings and correction

Consent now links the authenticated Privy identity without wallet provisioning. Mapping uses issuer and Stytch subject, never email as the authorization key. The context response explicitly distinguishes pending registered wallets from absent wallets.

The original resource verifier validated JWT signature, issuer, audience, expiry and scopes, then read the subject mapping. Revoking a Connected App at Stytch did not change these local checks, so an unexpired revoked JWT could still pass. Provider revocation alone was insufficient for immediate resource enforcement.

The correction calls the issuer's `/v1/oauth2/introspect` on every verified Stytch token request. It requires `active: true`, access-token type, matching client, subject, issuer, audience set, Carmelita scope set and expiration. There is no positive-result cache, no redirect following and a five-second timeout. Provider failures and malformed responses fail closed through the existing invalid-token response; submitted tokens and provider bodies are never surfaced.

The existing ChatGPT client is public. Its introspection request uses `client_id`, `token` and `token_type_hint=access_token`; it does not require a new secret or project. A default singular audience supplies the client ID. Additional audiences are accepted when exactly one `connected-app-` audience identifies the client; otherwise validation fails rather than choosing arbitrarily.

Official reference: [Stytch Introspect Token](https://stytch.com/docs/api-reference/consumer/api/connected-apps/methods/introspect-token). The client secret is required only for confidential clients. Live acceptance of this existing public client remains required before claiming production success.

## Required configuration

- `CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED=true`.
- `CARMELITA_PUBLIC_ORIGIN=https://carmelita.browns.studio`.
- Existing `STYTCH_PROJECT_ID`, `STYTCH_SECRET` and `STYTCH_PROJECT_DOMAIN`, preserving the current Test project and issuer.
- Acceptance requests `agent:context`; do not add financial permissions.
- Preserve actual ChatGPT callback and permit the public origin in Privy.
- Do not pin `STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE` to the resource URL unless actual issued token audiences prove it correct. Dynamic public clients default to their own client ID.

## Validation

Scoped OAuth suite: **22 passed, zero failed, zero skipped** on 2026-09-27. Four files cover resource validation, Connected App revocation, authorization requests and separation from onboarding. New cases cover a valid unexpired JWT becoming inactive, fresh authorization with an old token remaining rejected, provider failure, malformed data, mismatched subject/issuer/client/audience/scope/expiry and multiple audiences. All provider calls are mocked; this is not real ChatGPT acceptance.

Scoped ESLint completed without diagnostics for the two changed TypeScript files. Graphify query and update remain blocked by the missing configured Python 3.12 executable. No claim is made that the graph is current.

## Remaining acceptance

Run real consent, `get_agent_context`, reconnection and revocation against the deployed candidate with two existing production accounts. Compare application and connector identities. After revocation, explicitly check rejection before the former JWT expires; a fresh grant must not revive an old revoked token. No wallet creation, funds, signatures or transactions are required.
