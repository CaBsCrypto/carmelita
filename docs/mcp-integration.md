# MCP integration

> For the personal-agent and provider-admin surfaces, read the [bidirectional MCP gateway](mcp-gateway.md).

Carmelita participates in MCP in two directions:

- **Inbound MCP:** other agents call Carmelita commerce tools.
- **Outbound connectors:** Carmelita calls external MCP servers or APIs such as Notion, Travala, CoinGecko and CoinMarketCap.

An external product does not automatically need MCP. OAuth plus an API can be sufficient; MCP is preferred when the provider offers a stable, scoped tool contract.

## Inbound remote MCP

Production Streamable HTTP endpoint:

~~~text
https://agente-asistente.vercel.app/api/mcp
~~~

Local endpoint:

~~~text
http://localhost:3000/api/mcp
~~~

Client configuration:

~~~json
{
  "mcpServers": {
    "agent-assistant": {
      "url": "https://agente-asistente.vercel.app/api/mcp"
    }
  }
}
~~~

Use MCP Inspector locally:

~~~bash
npx @modelcontextprotocol/inspector@latest
~~~

### Tools

| Tool | Behavior | Safety |
| --- | --- | --- |
| search_offers | Search public offers | Read-only, idempotent |
| get_offer | Read one offer | Read-only, idempotent |

### Recommended flow

1. Search public offers with `search_offers`.
2. Read one offer with `get_offer` and inspect its availability.
3. Treat publication as catalog metadata, not proof that a service can execute.

Legacy intent, authorization, execution and private receipt tools are unregistered. Direct calls are rejected. `POST /api/commerce` is disabled (HTTP 405, `commerce_demo_disabled`), including replay and receipt lookup. Authenticated commerce requires a separate accepted integration, owner binding and scoped approval; `agent:read` never grants spending authority.

## Outbound connector model

| Provider | Transport | Authentication | Current scope |
| --- | --- | --- | --- |
| Notion | Official remote MCP | OAuth 2.1 with PKCE and dynamic registration | Read-only search; acceptance pending |
| Travala | Public remote MCP | Public access for current tool | Read-only hotel discovery |
| CoinGecko (primary) + CoinMarketCap (fallback) | Public REST API | Keyless (optional demo key) | Read-only quotes and watchlist |

Outbound OAuth tokens are encrypted with CONNECTOR_ENCRYPTION_KEY. Login to Carmelita does not grant access to an external provider; the user must complete that provider consent flow.

## WebMCP

When Chrome exposes document.modelContext, app/webmcp-registry.tsx registers:

- search_agent_offers

WebMCP acts in an open browser tab. Remote MCP works headlessly. The public registry offers only catalog reads; browser-scoped wallet authorization and execution are excluded.

## Persistence and replay safety

With DATABASE_URL, Neon stores intents, policy decisions, hashed authorization capabilities, receipts and audit events. Database uniqueness constraints enforce one intent per idempotency key and one receipt per intent.

Legacy storage and backend code remain for historical tests, but public clients cannot access their mutation or receipt lifecycle. Without DATABASE_URL, public discovery returns labelled built-in demos; it does not promise durable service availability.

## Discovery and health

- GET /.well-known/mcp
- GET /api/health
- GET /api/commerce
- POST /api/mcp

## Path to production mutation

1. Add OAuth 2.1 and scopes to inbound MCP.
2. Bind every mutating tool call to the authenticated user.
3. Replace demo authorization with transaction-scoped wallet approval.
4. Submit one Stellar Testnet transaction and persist its hash.
5. Prove retries return the existing transaction without resubmission.
6. Add connector-specific settlement and fulfillment verification.
