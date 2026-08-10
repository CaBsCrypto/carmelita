# Carmelita Agent Gateway v1

Status: implemented and validated Testnet discovery-and-planning gateway. Commit `bbc66b0` passed the protected Preview acceptance gate.

Implemented now: public capability discovery, authenticated idempotent action planning, owned action/receipt reads, granular personal scopes, a non-custodial safety envelope, Neon-backed persistence and scoped PAT access for Remote MCP and REST. Not implemented through the Gateway: chat mutation, transaction preparation, approval, signing, submission or mainnet execution. Planned next: approval continuation, wallet metadata and OAuth 2.1.

The Agent Gateway lets a user reuse Carmelita from Codex, another remote MCP
client, or a custom backend without exposing a wallet secret. Version 1 is a
read-and-plan product: it can inspect the authenticated user's context and
prepare an action, but it cannot sign or submit a transaction through MCP or
REST.

The existing bidirectional MCP architecture is documented in
[mcp-gateway.md](./mcp-gateway.md).

## Safety invariant

> A Gateway credential authorizes Carmelita data and planning, never possession
> of the user's wallet.

Every v1 response and capability MUST identify its network and runtime status.
Production networks MUST NOT be returned as executable. A financial action MUST remain `blocked` while any preflight requirement is unresolved and may reach `awaiting_approval` only after every blocker is cleared. A separate first-party Carmelita + Privy experience will eventually perform the user-approved signature.

## Supported clients

| Client | Transport | v1 authentication |
| --- | --- | --- |
| Codex CLI, app or IDE | Remote MCP over Streamable HTTP | Personal access token (temporary bridge) |
| Other MCP-compatible agents | Remote MCP over Streamable HTTP | Personal access token (temporary bridge) |
| User-owned cloud services | JSON REST API | Scoped personal token or first-party Privy bearer |
| Carmelita web application | Existing first-party APIs | Privy access token |

OAuth 2.1 with PKCE is the public-launch target. Personal access tokens (PATs)
are only the Testnet bridge and MUST be hashed at rest, shown once, scoped,
revocable and attributable to one Privy user.

## Surfaces

### Remote MCP

~~~text
https://agente-asistente.vercel.app/api/mcp/agent
~~~

The MCP server remains the preferred integration for interactive AI agents. It
SHOULD expose a small stable tool set and use a capability registry instead of
adding one tool per protocol.

Codex and other Streamable HTTP MCP clients can use a PAT during the Testnet phase. Keep the raw PAT in a local secret environment variable; never paste it into source control, a prompt, a shared configuration file or logs:

~~~toml
[mcp_servers.carmelita]
url = "https://agente-asistente.vercel.app/api/mcp/agent"
bearer_token_env_var = "CARMELITA_MCP_TOKEN"
default_tools_approval_mode = "writes"
~~~

The PAT must contain only the scopes the user selected. OAuth 2.1 with PKCE will replace manual bearer-token setup for public self-service connections. Codex's current MCP configuration is described in the official
[Model Context Protocol guide](https://learn.chatgpt.com/docs/extend/mcp).

### REST API

All REST responses use JSON and `Cache-Control: no-store`. All protected calls
use `Authorization: Bearer <token>`.

| Method | Endpoint | v1 status | Contract |
| --- | --- | --- | --- |
| `GET` | `/api/v1/capabilities` | Implemented, public | List the honest Testnet capability catalog |
| `POST` | `/api/v1/actions/plan` | Implemented, `agent:plan` | Validate an intent and return blockers or an approval requirement |
| `GET` | `/api/v1/actions/:id` | Implemented, `agent:read` | Read one action owned by the authenticated user |
| `GET` | `/api/v1/receipts/:id` | Implemented, `agent:read` | Read receipt availability for an owned plan |
| `GET` | `/api/v1/wallets` | Planned | Read public wallet metadata; never keys or signing material |

`POST /api/v1/actions/plan` currently receives `idempotencyKey` in its JSON body. Reusing the key with different input MUST fail; reusing it with identical input MUST return the original action. An HTTP `Idempotency-Key` alias can be added later without changing these semantics.

### Durable planning state

When a database URL is configured, plans and verified receipts use Neon Postgres. The unique database constraint on `(actor_id, idempotency_key)` is the final concurrency boundary: two Vercel instances cannot claim the same user request twice. A replay with the same fingerprint returns the original plan; a different fingerprint fails closed with `gateway_idempotency_conflict`.

Local test runs without a database use an injected in-memory store. Production and Preview MUST apply migration `0016_moaning_mastermind.sql` before enabling this Gateway version. The public Gateway still has no execution route; receipt writes are reserved for independently verified execution adapters.

After migration, run `npm run gateway:neon:smoke`. It inserts one temporary plan and receipt, verifies replay, conflict and ownership behavior against Neon, and deletes the temporary record.

### Distributed limits and minimal audit

- Personal PAT usage is limited to 60 requests per fixed minute per token across REST v1 and personal MCP. PAT creation is limited to 5 attempts per fixed hour per Privy user.
- Limits use one atomic Neon/Postgres upsert per request, never process memory. Rejected calls return `429` with a stable `Retry-After`; an unavailable limiter fails closed with `503`.
- REST v1, personal MCP and PAT issuance write best-effort audit events containing only request ID, pseudonymized actor/token identifiers when known, static route, outcome, HTTP status, latency and timestamp.
- MCP audit is endpoint-level because `mcp-handler` events contain parameters/results without the authenticated subject. The audit therefore leaves `tool` null instead of inspecting or persisting the MCP body.
- Authorization headers, bearer tokens, request/response bodies, conversations, wallet data and raw errors are never audit fields. Audit failure never replaces the primary API response.
- Expired rate buckets and old audit rows need a retention/cleanup job before public scale; this is intentionally outside the P0 request path.



## Capability contract

Every capability returned by MCP or REST MUST include these fields:

~~~json
{
  "id": "avalanche.pangolin.swap",
  "title": "Plan a Pangolin swap",
  "network": "avalanche:fuji",
  "status": "ready_to_test",
  "requiresApproval": true,
  "operation": "financial",
  "approval": "privy_single",
  "execution": { "exposedByGateway": false, "mode": "prepare_then_approve" }
}
~~~

Required semantics:

- `network` is explicit; v1 permits only Testnet or read-only offchain values.
- `status` is one of `live`, `ready_to_test` or `planned`.
- `requiresApproval` is always `true` for financial and irreversible actions.
- `operation` is `read`, `prepare`, `financial` or `cross_chain`.
- `execution.mode` is `read_only` or `prepare_then_approve`, and `execution.exposedByGateway` remains `false` in v1.
- A capability that has not passed acceptance MUST NOT report `live`.

## Action planning contract

Request:

~~~json
{
  "capabilityId": "avalanche.pangolin.swap",
  "idempotencyKey": "example-swap-0001",
  "parameters": {
    "sellAsset": "USDC",
    "buyAsset": "WAVAX",
    "amount": "1"
  }
}
~~~

Current safety-first plan while runtime preflight is still unresolved:

~~~json
{
  "id": "gwp_...",
  "environment": "testnet",
  "status": "blocked",
  "capabilityId": "avalanche.pangolin.swap",
  "blockers": ["runtime_preflight_required"],
  "approval": {
    "required": true,
    "method": "privy_single",
    "continuationUrl": null
  },
  "safety": {
    "fundsMoved": false,
    "serverSideSigning": false,
    "executionEnabled": false
  }
}
~~~

If requirements are missing, the plan returns `status: "blocked"`, a stable machine-readable `blockers` array and no approval continuation. This fail-closed ordering is required. An approval URL is a continuation into Carmelita, not an authorization to sign.

## Receipts

A receipt is evidence, not success by assertion. It MUST contain:

- `id`, `planId`, `actorId`, `capabilityId` and exact capability network.
- `status: verified`; this means an internal adapter supplied evidence, not that every receipt is an onchain payment.
- Transaction hash only when independent network verification actually produced one.
- Typed evidence describing the verifier and its result.
- Immutable one-receipt-per-plan binding; replacements must conflict.
- No access token, wallet key, raw authorization signature or private user data.

Version 1 does not expose a public receipt writer. Internal adapters may persist a `verified` receipt only after matching actor, capability and network to the plan. Evidence must state whether the proof is provider, sandbox or onchain; `verified` alone MUST NOT be presented as an onchain confirmation.

## Scope model

Minimum personal scopes:

| Scope | Allows | Does not allow |
| --- | --- | --- |
| `agent:read` | Capability discovery plus owned plan and receipt reads | Profile, wallets, connections, conversation, planning or execution |
| `agent:plan` | Creating or replaying immutable Testnet plans | Personal context, conversation, approving, signing or submitting |
| `agent:context` | Profile, public wallet metadata, connections and authority boundary | Conversation, planning, signing or submitting |
| `agent:conversation` | Recent durable conversation history | Context, planning, signing or submitting |

Scopes MUST be checked at the tool or route boundary. User identity MUST always
come from the verified token; a caller-supplied `userId` is never authoritative.

## Testnet credential lifecycle

The temporary self-service credential has the `carmelita_user_` prefix. Only its SHA-256 hash is stored; the raw value is returned once. The only default scope is `agent:read`. `agent:plan`, `agent:context` and `agent:conversation` are separate opt-ins and are disabled by default in the UI. External chat mutation is intentionally absent because the first-party chat can reach approval workflows. Tokens expire after 30 days by default (365 maximum), and a user may keep at most ten active tokens.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/agent/mcp-tokens` | List the signed-in user's credential metadata |
| `POST` | `/api/agent/mcp-tokens` | Create a scoped credential, valid for 1 to 365 days |
| `DELETE` | `/api/agent/mcp-tokens/:tokenId` | Revoke an owned credential |

These lifecycle routes require a Privy browser session, same-origin requests and `Cache-Control: no-store`. Listing never returns the raw token or its hash. Revocation must invalidate the next MCP or REST request.

## OAuth public-launch target

The PAT bridge does not provide self-service account linking. Before public
launch Carmelita needs:

1. OAuth protected-resource metadata for the MCP resource.
2. Authorization-server discovery metadata.
3. Authorization code flow with PKCE (`S256`).
4. Audience/resource, issuer, expiry and scope verification on every request.
5. Consent, refresh, revocation and incremental-scope flows.
6. Per-tool MCP `securitySchemes` and an MCP authentication challenge.

Do not build a bespoke OAuth server unless necessary; use an established
provider that can satisfy the MCP OAuth 2.1 contract. The applicable OpenAI
requirements are documented in the official
[MCP authentication guide](https://developers.openai.com/plugins/build/auth).

## Threat model

| Threat | Required control |
| --- | --- |
| Token database leak | Store only token hashes; show PAT once |
| Cross-user object access | Resolve user from token and enforce ownership on every query |
| Prompt injection requests payment | Planning only; no signing or submission in MCP/REST |
| Duplicate/replayed request | Idempotency key, immutable input digest and stable replay response |
| Mainnet confusion | Reject unsupported networks and label Testnet in every action |
| Capability overclaim | Runtime status registry; acceptance evidence before `live` |
| Malicious approval URL | Generate only same-origin HTTPS URLs from server-side action IDs |
| Token shown to model or logs | Redact authorization headers, query strings and error context |
| Excessive access | Least-privilege scopes, expiry, rotation, revocation and rate limits |
| Forged receipt | Server-side ownership check and independent chain verification |

## Acceptance checklist

### Authentication and isolation

- [x] Create a PAT for test user A and display it only once.
- [x] Persist only its hash, prefix, scopes, owner, expiry and lifecycle data.
- [x] Reject missing, malformed, expired and revoked tokens with `401`.
- [x] Return `403` for a valid token missing the required scope.
- [x] Prove user A cannot read user B's actions or receipts. Wallet-data isolation remains covered by the authenticated context boundary rather than this planning acceptance script.

### Discovery and planning

- [ ] Complete a real external Codex pilot against the Remote MCP endpoint with `CARMELITA_MCP_TOKEN`.
- [x] List capabilities and verify every item has network, status and approval metadata.
- [x] Plan one Testnet action without signing or moving funds.
- [x] Reuse its idempotency key and receive the same action ID.
- [x] Reuse the key with different input and receive a conflict.
- [x] Verify Mainnet input is rejected.

### Approval and receipts

- [x] Verify current v1 plans return no approval continuation URL. Future continuation URLs must be same-origin, expiring and derived from server-side action IDs.
- [x] Verify a blocked plan never returns an approval URL.
- [x] Verify MCP/REST cannot approve, sign or submit the action.
- [ ] Verify a simulated receipt says `simulated` and contains no transaction hash.
- [ ] Verify any future `confirmed` receipt is backed by independent chain lookup.

### Operations

- [x] Revoke the PAT and prove the next REST and MCP requests fail.
- [x] Confirm the minimal audit schema excludes authorization headers, token bodies and request/response bodies.
- [x] Rate-limit PAT creation and PAT-authenticated API calls with distributed fixed-window buckets.
- [x] Record endpoint-level subject, outcome and latency without sensitive input; tool-level MCP audit remains intentionally unavailable.

## Definition of done for v1 Testnet

The validated v1 slice lets a user create a scoped Testnet credential, connect a compatible MCP client, list capabilities, create or replay an Avalanche Fuji plan, and read owned plan/receipt state. Approval continuation remains future work. No call made exclusively through MCP or REST can prepare a transaction, approve, sign, submit or move funds.


## Preview acceptance evidence

Validated source commit: `bbc66b0`.

Validated protected Preview deployment: `dpl_SCypub4r7Rz7SYNTufYci1sJGWPq`.

Validated Preview URL: `https://agente-asistente-r5qd1rqsl-cabscryptocontacto-6028s-projects.vercel.app`.

The promotion evidence is:

- `npm run gateway:neon:smoke`: **8/8 PASS** for durable insert, identical replay, changed-input conflict, cross-user isolation, verified receipt persistence, immutable receipt protection, distributed rate limiting and minimal pseudonymized audit persistence.
- `npm run gateway:preview:acceptance -- https://<preview-url>`: **20/20 PASS** across REST and MCP initialization, discovery, tool safety, scope denial, idempotency, ownership isolation and PAT revocation.
- Full automated suite: **350 pass, 2 skip, 0 fail**.
- The Preview catalog exposed the Testnet capability registry and every Gateway plan remained non-executable.
- Deployment Protection was traversed with authenticated `vercel curl`; it proves the deployed protocol and persistence contract, not public OAuth account linking.

This evidence approves the discovery-and-planning Testnet Gateway represented by commit `bbc66b0`. It does not claim approval continuation, wallet signing, transaction submission or mainnet support. A real external Codex pilot and public OAuth 2.1 / ChatGPT web connection remain pending.
