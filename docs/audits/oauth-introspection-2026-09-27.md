# OAuth introspection compatibility — 2026-09-27

Production reference: `a98b35e495d9aa304d8984f4cd12e8cf97951a09`.

An authorized localhost PKCE diagnostic at 22:03:45–22:03:50 UTC and
22:05:01–22:05:04 UTC used the existing diagnostic client and an existing account.
Tokens remained in process memory and were revoked after each run. No wallet
creation, financial tools or database mutations were requested.

## Observed

- Code exchange, signature/issuer validation and UserInfo succeeded.
- The signed access token audience was the MCP resource URL.
- Live introspection returned active=true, the same client, subject and scopes,
  but its audience was the client ID. Expiration was valid in both responses;
  exact expiration equality was not consistent across runs.
- Production rejected initialize with HTTP 401 at introspection.
- Token revocation returned HTTP 200; subsequent introspection returned inactive.

## Correction

Validate the introspection audience as either the signed token audiences or the
single verified client ID. Keep signature, issuer, subject, client, scopes,
token type and live revocation checks. Both expirations must remain valid;
introspection cannot extend the signed JWT lifetime. A foreign audience fails.

Reference: [Stytch introspection contract](https://stytch.com/docs/api-reference/consumer/api/connected-apps/methods/introspect-token).

## Acceptance status

The focused regression suite passes. Deployment and real ChatGPT acceptance
remain pending for this correction. The independent diagnostic does not prove
that ChatGPT persists its OAuth connection. Two-account wallet comparison,
reconnection and revocation from ChatGPT remain required before closing the goal.
