# Connect Carmelita to AI chats with Stytch Connected Apps

This integration keeps each responsibility separate:

- **Privy** authenticates the Carmelita user and owns wallet access.
- **Stytch Connected Apps** is the OAuth 2.1 authorization server for external AI chats.
- **Carmelita Agent Gateway** exposes the remote MCP resource at `/api/mcp/agent`.
- The database maps `(Stytch issuer, Stytch subject)` to exactly one Privy DID. Email is never the authorization key.

## End-to-end flow

1. ChatGPT, Codex, Claude, or another MCP client discovers Carmelita's protected-resource metadata.
2. The client uses Stytch authorization-server metadata and starts Authorization Code + PKCE (`S256`).
3. Stytch redirects the browser to `https://YOUR_DOMAIN/oauth/authorize`.
4. The user signs into the existing Carmelita account with Privy and reviews the requested scopes.
5. Carmelita verifies the Privy access token server-side, ensures a Stytch Consumer user with a hashed Privy external ID, and submits the consent decision to Stytch.
6. Stytch returns an authorization code to the registered chat callback. The chat exchanges it for access and refresh tokens.
7. The MCP gateway verifies the RS256 signature, issuer, expiration, non-empty client audience, scopes, and subject mapping before invoking any tool.

Connecting is not transaction consent. Wallet signing, transfers, swaps, deposits, and x402 payments remain behind Carmelita's separate policy and approval flow.

## Environment variables

Keep every variable except `CARMELITA_PUBLIC_ORIGIN` server-side.

```dotenv
CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED=false
STYTCH_PROJECT_ID=project-live-...
STYTCH_SECRET=secret-live-...
STYTCH_PROJECT_DOMAIN=https://YOUR_PROJECT.customers.stytch.com
CARMELITA_PUBLIC_ORIGIN=https://carmelita.example
STYTCH_CONNECTED_APPS_SCOPES=agent:read agent:plan agent:context agent:conversation
# Optional: only for a predefined client with a configured custom audience.
STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE=
```

The canonical OAuth resource is exactly:

```text
https://carmelita.example/api/mcp/agent
```

Do not use the Vercel deployment-protection bypass secret in connector URLs. The production MCP endpoint must be publicly reachable over stable HTTPS; authentication happens at OAuth/MCP level.

## Stytch dashboard setup

1. Create or select a **Consumer Authentication** project.
2. Enable **Connected Apps** and Dynamic Client Registration when the target client requires CIMD/DCR.
3. Configure the custom authorization/consent URL as `https://YOUR_DOMAIN/oauth/authorize`.
4. Define the `agent:*` scopes above. `offline_access` is an OAuth protocol scope requested by clients that need refresh tokens; it is not an MCP tool permission.
5. For a predefined client, you may set a custom access-token audience and pin it with `STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE`. Dynamic clients normally receive tokens whose `aud` is their `client_id`; leave the strict variable empty and Carmelita will still require a non-empty audience.
6. Register the exact ChatGPT callback shown by the ChatGPT connector setup (`https://chatgpt.com/connector/oauth/...`) if using a predefined client. Never guess this URL.
7. Verify that the project domain exposes OAuth authorization-server metadata and the register/token endpoints advertised there.

## Privy-to-Stytch identity bridge

The custom consent API does **not** pass a Privy JWT directly to Stytch and does not require Carmelita to publish a private signing-key JWKS:

- Carmelita verifies the Privy access token on its server.
- It retrieves the verified email only to satisfy Stytch Consumer user creation.
- It generates `external_id = privy|sha256(privy_did)`, so the raw DID is not sent as an external ID.
- It calls Stytch's Submit OAuth Authorization endpoint with the Stytch `user_id`.
- It persists issuer + Stytch user ID to Privy DID. A conflicting remap is rejected.

If a future UI replaces the custom API flow with Stytch's hosted `IdentityProvider` component, reassess Trusted Auth Tokens separately. Privy access tokens do not contain a top-level verified email suitable for that bridge; a short-lived signed bridge JWT plus public JWKS and explicit key rotation would then be required.

## Local and synthetic validation

The synthetic harness uses a fake Stytch transport and no real credentials:

```bash
npx tsx scripts/stytch-connected-apps-synthetic.ts
npx tsx --test tests/stytch-connected-apps.test.ts
```

For a live OAuth browser run, use a stable HTTPS preview or tunnel. The synthetic harness requires no public callback. Production and the protected-resource server reject HTTP origins.

## Self-service revocation

When the OAuth feature flag is enabled, an authenticated Carmelita user can view and revoke only the Connected Apps associated with their own Privy identity:

1. `GET /api/agent/connected-apps` verifies the Privy bearer and resolves the exact `(issuer, Privy DID) -> Stytch user` mapping.
2. The response exposes only the app ID, display name, description, client type, and granted scopes. It never returns access tokens, refresh tokens, client secrets, raw Privy DIDs, or Stytch user IDs.
3. `DELETE /api/agent/connected-apps` requires same-origin, an explicit `connectedAppId`, and confirms that the app is currently authorized for the mapped Stytch user before revoking it.
4. Stytch revokes all active access and refresh tokens for that user/app grant. Reconnection requires a new authorization and consent flow.

The UI is mounted in the authenticated Carmelita workspace. When `CARMELITA_OAUTH_RESOURCE_SERVER_ENABLED` is not `true`, the API returns `404` and the control stays hidden.
## Secret rotation and incident response

- Rotate `STYTCH_SECRET` and `PRIVY_APP_SECRET` independently; never expose either to the browser.
- Update Vercel environment variables and redeploy before retiring an old key.
- Revoke affected Stytch grants/refresh tokens after suspected leakage.
- Never log authorization headers, authorization codes, refresh tokens, email addresses, or raw Privy DIDs.
- Retain audit events with opaque user IDs, client ID, scopes, decision, request ID, and timestamp.

## Production acceptance checklist

- Protected-resource metadata points to the exact canonical MCP resource.
- Authorization-server issuer is pinned to `STYTCH_PROJECT_DOMAIN`; the token audience is non-empty and, when configured for a predefined client, matches `STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE`.
- PKCE is `S256`; redirect URIs are registered and matched exactly by Stytch.
- Consent shows the Stytch-validated client name and requested scopes, never values trusted directly from the query string.
- Deny returns through the OAuth redirect with a protocol error; it does not strand the user.
- Self-service revocation removes the app from the user list and its old access and refresh tokens fail; reconnect requires fresh consent.
- Refresh/reconnect paths work from a clean second Privy account.
- No OAuth connection can silently sign or submit a wallet transaction.
