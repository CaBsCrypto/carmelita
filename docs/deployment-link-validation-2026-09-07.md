# GitHub / Vercel / local clone validation

Verified September 7, 2026 (America/Santiago). Read-only remote inspection; no linking, push, deployment or environment-variable changes.

| Surface | Verified state |
| --- | --- |
| Local origin | https://github.com/CaBsCrypto/carmelita.git |
| Local branch / remote main | main / c163e15ba52bdc9d7bd2250e2bd9d20834b7ee48 |
| Local edits | Stabilization changes remain uncommitted and unpublished |
| Vercel project | cabscryptocontacto-6028s-projects/agente-asistente; dashboard accessible in the current browser session |
| Public canonical URL supplied by user | https://carmelita-agent.vercel.app/ |
| Active production shown by Vercel | dcbb20ef520cb167b582f51263c0660793d94161, Ready; deployment tYAhcpzd9uxqAYPU6869jLzt7dbG |
| Latest main deployment | c163e15, failed; deployment 9tVovRPzXxmgBfGQWEVnGBM6mUiF |
| Existing open repair | PR #28, fix/webmcp-type-contract, head 1fb3533ade5a56feeb4a26bfd2353b2b3b276902; successful preview |
| CLI link | No local .vercel/project.json; Vercel CLI not found on PATH. GitHub-to-Vercel deployment integration already exists independently |

## Runtime checks

The read-only acceptance doctor against https://carmelita-agent.vercel.app passed all six checks: local Testnet constants, public health, agent page, MCP discovery, official Stellar x402 challenge and distributor readiness. Health declares Postgres; this is not a database or authenticated acceptance test. No signing/payment was performed.

The protected-resource metadata URL `/.well-known/oauth-protected-resource/api/mcp/agent` returned 404. Current source intentionally returns 404 when OAuth resource-server support is disabled; exact production environment settings were not inspected, so configuration is not proven. Public discovery advertises the Privy/scoped-PAT bridge. No secrets were read or copied.

## Alignment work before publication

1. Compare PR #28 with the local stabilization changes; both modify the WebMCP inspector and registry. Preserve its handoff documentation and avoid a competing blind merge.
2. Prepare one reviewed change set and repeat local quality checks on the reconciled tree.
3. Use the confirmed public URL for future read-only checks. The repository homepage and acceptance defaults still reference agente-asistente.vercel.app; both domains currently respond, but that does not make all OAuth callbacks interchangeable.
4. Before authenticated acceptance, verify Privy allowed origins, Stytch resource/issuer and callback configuration for the intended environment without exposing credentials.
5. Keep production unchanged until a reviewed deployment is requested. Existing vercel.json runs migrations before build; a push/merge can have deployment and database consequences.

Sources: [Vercel overview](https://vercel.com/cabscryptocontacto-6028s-projects/agente-asistente), [PR #28](https://github.com/CaBsCrypto/carmelita/pull/28), GitHub deployment/status API and live read-only HTTP checks.
