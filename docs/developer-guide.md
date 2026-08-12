# Developer guide

This guide is for engineers integrating an agent, application or merchant with Carmelita.

For the product model and vocabulary, start with the [canonical narrative](product-narrative.md). If you represent a service provider, read [Carmelita for Business](business-onboarding.md) before choosing a technical path.

## Choose the integration direction

| Goal | Start here |
| --- | --- |
| Let another AI agent discover offers and create safe intents | Inbound remote MCP |
| Build a custom frontend for the sandbox lifecycle | Commerce HTTP API |
| Let Carmelita use your product | Outbound connector |
| Make a page discoverable in supporting Chrome versions | WebMCP |
| Add login, user state or wallet features | Privy-authenticated application APIs |

Read the [architecture diagrams](architecture.md) and [current product status](product-status.md) first.

The live [developer portal](https://agente-asistente.vercel.app/developers) provides an English/Spanish self-service entry point with three paths: use Carmelita, publish a service, or connect an external product. The language preference is stored locally and does not affect API contracts.

## Quickstart

~~~bash
git clone https://github.com/CaBsCrypto/carmelita.git
cd agente-asistente
npm install
copy .env.example .env.local
npm run db:migrate
npm run dev
~~~

Requirements:

- Node.js 22.13.0 or newer.
- Neon Postgres for durable state.
- Privy credentials for login and Stellar wallet provisioning.
- A 32-byte base64 CONNECTOR_ENCRYPTION_KEY for OAuth connectors.

Validation:

~~~bash
npm test
npm run lint
npm run build
~~~

## Public versus authenticated surfaces

| Surface | Authentication today | Intended use |
| --- | --- | --- |
| GET /api/health | Public | Runtime readiness and honest payment mode |
| GET /api/commerce | Public sandbox | Offer discovery |
| POST /api/commerce | Public sandbox | Demo commerce lifecycle |
| POST /api/mcp | Public sandbox | Remote MCP tools |
| GET /.well-known/mcp | Public | MCP discovery |
| POST /api/agent/bootstrap | Privy bearer + same-origin | User and wallet bootstrap |
| GET/POST /api/agent/chat | Privy bearer + same-origin | User chat and history |
| GET/POST /api/agent/defindex | Privy bearer + same-origin | Review, sign and submit DeFindex Testnet actions |
| GET /api/connections | Privy bearer | User connector state |
| Notion start/callback | Privy session and OAuth state | Provider consent |
| /api/admin routes | Founder session | Private operations |

Do not build a third-party client against authenticated browser APIs yet. Their same-origin boundary is intentional.

## Option A: inbound MCP

Endpoint:

~~~text
https://agente-asistente.vercel.app/api/mcp
~~~

Configuration:

~~~json
{
  "mcpServers": {
    "agent-assistant": {
      "url": "https://agente-asistente.vercel.app/api/mcp"
    }
  }
}
~~~

The seven current tools are documented in [mcp-integration.md](mcp-integration.md).

Safe caller flow:

1. Generate one stable idempotency key for the logical action.
2. Call create_intent.
3. Call evaluate_policy.
4. Show the frozen action to the user.
5. Call demo_authorize_intent only after explicit confirmation.
6. Call execute_authorized_intent with the short-lived capability.
7. Store the receipt and treat replayed: true as success.

## Option B: commerce HTTP sandbox

### Discover offers

~~~bash
curl "http://localhost:3000/api/commerce?query=travel"
~~~

### Create an intent

~~~bash
curl -X POST "http://localhost:3000/api/commerce" \
  -H "content-type: application/json" \
  -d '{
    "action": "create_intent",
    "offerId": "travala-search",
    "actorId": "developer-demo",
    "idempotencyKey": "demo-travel-001"
  }'
~~~

Reusing the same idempotencyKey returns the original intent.

### Evaluate policy

~~~bash
curl -X POST "http://localhost:3000/api/commerce" \
  -H "content-type: application/json" \
  -d '{
    "action": "evaluate_policy",
    "intentId": "INTENT_ID"
  }'
~~~

The demo rejects expired intents, negative amounts and amounts above 100 USDC.

### Authorize the sandbox action

~~~bash
curl -X POST "http://localhost:3000/api/commerce" \
  -H "content-type: application/json" \
  -d '{
    "action": "authorize",
    "intentId": "INTENT_ID",
    "explicitUserConfirmation": true
  }'
~~~

The authorizationToken is a sandbox capability, not a wallet signature.

### Execute and replay

~~~bash
curl -X POST "http://localhost:3000/api/commerce" \
  -H "content-type: application/json" \
  -d '{
    "action": "execute",
    "intentId": "INTENT_ID",
    "authorizationToken": "AUTHORIZATION_TOKEN"
  }'
~~~

Send the same request again. The receipt stays the same and replayed becomes true.

## Option C: build an outbound connector

~~~mermaid
flowchart LR
    RESEARCH["Verify official API or MCP"] --> SCOPE["Choose minimum scopes"]
    SCOPE --> AUTH["Implement consent or credential"]
    AUTH --> STORE["Encrypt credentials"]
    STORE --> TOOL["Expose one read-only tool"]
    TOOL --> NORMALIZE["Normalize results and errors"]
    NORMALIZE --> EVAL["Add tests and eval prompts"]
    EVAL --> STATUS["Ready to validate"]
    STATUS --> UAT["Real-user acceptance"]
    UAT --> LIVE["Live"]
~~~

Checklist:

- Prefer official provider documentation and stable IDs.
- Begin with one read-only operation.
- Never request write scopes for a read-only feature.
- Keep secrets in server environment variables.
- Encrypt OAuth tokens with CONNECTOR_ENCRYPTION_KEY.
- Bind credentials to the verified Privy user ID.
- Add refresh and reauthorization states.
- Normalize provider errors into stable codes.
- Persist only required user state.
- Update docs/product-status.md after verification.
- Do not describe outreach or a catalog entry as a connection.

Use [NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md](NEW_PRODUCT_INTEGRATION_AGENT_PROMPT.md) for an integration analysis handoff.

## Idempotency contract

~~~mermaid
flowchart TD
    START["User requests action"] --> KEY["Generate stable logical key"]
    KEY --> RETRY["Send request"]
    RETRY --> RESULT{"Timeout or response?"}
    RESULT -- Timeout --> RETRY
    RESULT -- Response --> SAME["Accept original intent or receipt"]
~~~

Rules:

- Reuse the key after timeouts.
- Create a new key only when the user changes the action.
- Never use a new random key for each retry.
- Treat an existing receipt as completed execution.
- Real payment must check durable state before contacting Horizon.

## Error model

APIs return JSON with a stable error field.

| Code | Meaning | Caller action |
| --- | --- | --- |
| invalid_origin | Same-origin check failed | Use the product origin |
| privy_not_configured | Privy server credentials absent | Configure environment |
| invalid_message | Chat input failed validation | Correct input |
| database_not_configured | Durable feature requires Neon | Configure DATABASE_URL |
| offer_not_found | Unknown offer ID | Refresh offers |
| intent_not_found | Unknown intent ID | Stop or restart flow |
| demo_limit_exceeded | Amount exceeds sandbox policy | Reduce amount |
| explicit_confirmation_required | Confirmation absent | Show action and ask user |
| policy_approval_required | Policy rejected or not evaluated | Do not execute |
| invalid_authorization | Capability does not match | Restart authorization |
| authorization_expired | Capability expired | Reconfirm action |
| usdc_trustline_required | Exact DeFindex USDC trustline is absent | Prepare and approve the trustline first |
| defindex_approval_expired | Prepared XDR is no longer valid | Prepare and review a new action |
| wallet_not_owned_by_authenticated_user | Privy wallet does not belong to bearer user | Stop and re-bootstrap the correct user wallet |
| notion_not_connected | User has not granted Notion access | Start OAuth |
| notion_reauth_required | Provider token must be renewed | Reconnect provider |

Handle the stable code, not human-readable text.

## Adding a new MCP tool

1. Give it one narrow purpose.
2. Define a strict Zod input schema.
3. Set readOnlyHint, destructiveHint and idempotentHint accurately.
4. Require identity for user-specific data.
5. Require explicit approval for sensitive mutation.
6. Test success, rejection, timeout and retry.
7. Document discovery, execution, settlement and fulfillment separately.

Relevant source files:

- app/api/mcp/route.ts — inbound MCP registrations.
- app/webmcp-registry.tsx — browser WebMCP tools.
- app/connectors — external provider connectors.
- app/commerce-backend.ts — durable orchestration.
- app/domain.ts — sandbox types and offers.
- app/privy-stellar.ts — identity and wallet integration.
- app/agent-chat-store.ts — persistent chat tool routing.

## Definition of done

An integration is **Live** only when:

- Consent succeeds for a real user.
- The intended tool succeeds against the real provider.
- Errors and token expiry have a recovery path.
- Secrets remain server-side and encrypted where applicable.
- The result is visible in chat.
- Automated tests cover the local contract.
- The status document names evidence and limitations.

Payment and physical fulfillment require additional verification.
