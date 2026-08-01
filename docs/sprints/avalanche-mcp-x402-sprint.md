# Avalanche MCP + x402 Fuji sprint

Status: active
Branch: `feat/multichain-wallet-foundation`
Scope: Avalanche Fuji C-Chain (`43113`) and the official hosted read-only MCP.

## Objective

Add two independent Avalanche capabilities to Carmelita:

1. Read-only knowledge and public network tools through the official hosted MCP
   at `https://build.avax.network/api/mcp`.
2. A Fuji x402 payment flow signed interactively by the user's Privy EVM
   wallet, without exporting or storing private keys.

No Mainnet, deployment, push, custody, funding or payment is authorized in this
sprint.

## Primary evidence

- Avalanche hosted MCP documentation:
  `https://build.avax.network/docs/tooling/ai-llm/mcp-server`
- Avalanche x402 facilitators:
  `https://build.avax.network/academy/blockchain/x402-payment-infrastructure/04-x402-on-avalanche/03-facilitators`
- Avalanche x402 payment flow:
  `https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/01-payment-flow`
- Avalanche first Fuji payment:
  `https://build.avax.network/academy/blockchain/x402-payment-infrastructure/05-hands-on-implementation/02-first-payment`
- Privy EIP-1193 provider:
  `https://docs.privy.io/wallets/using-wallets/ethereum/ethereum-provider`
- Privy typed-data signing:
  `https://docs.privy.io/api-reference/wallets/ethereum/eth-signtypeddata-v4`

## Architecture

```text
User chat
  |
  +--> Avalanche knowledge intent
  |      -> Carmelita authenticated route
  |      -> allowlisted MCP client
  |      -> official hosted Avalanche MCP
  |      -> schema-normalized read-only result
  |
  +--> Avalanche x402 intent
         -> fetch HTTP 402 challenge
         -> validate exact Fuji requirements
         -> freeze payment authorization + idempotency record
         -> explicit user approval in Privy
         -> eth_signTypedData_v4 (EIP-712 / EIP-3009)
         -> send signed payment header
         -> facilitator verifies and settles
         -> independently validate settlement/hash
```

## Dependency DAG

```text
DOC-01 official evidence
  +--> MCP-01 tools/list
  |      -> MCP-02 allowlist/schema/timeout
  |      -> MCP-03 one read-only call
  |      -> MCP-QA
  |
  +--> X402-01 network/token/facilitator discovery
         -> X402-02 Privy authorization compatibility
         -> X402-03 frozen challenge and replay binding
         -> X402-04 interactive signing adapter
         -> X402-05 settlement verification
         -> X402-QA

MCP-QA + X402-QA -> LOCAL-01 localhost acceptance
```

## Gates

### MCP gate

- `tools/list` succeeds against the exact hosted endpoint.
- Only allowlisted read-only tools may be called.
- Requests have a strict timeout and bounded response size.
- JSON-RPC errors, malformed schemas and unknown tools fail closed.
- At least one deterministic read-only call passes.

### x402 discovery gate

Before any signing implementation:

- Network is exactly Fuji (`43113` / supported protocol network identifier).
- Token contract, name/version/decimals and authorization scheme come from the
  live challenge or verified official configuration.
- Facilitator `/supported` evidence includes the chosen Fuji scheme/token.
- Privy can sign the required EIP-712 typed data through an interactive wallet
  method.
- Exact from/to/value/asset/chain/validity/nonce are bound to one payment ID.

If any item is missing or ambiguous, the flow remains discovery-only.

### Mutation gate

- No raw private key, mnemonic or server-side user signer.
- Explicit user approval is required immediately before signing.
- First authorization signature is durably bound before settlement retry.
- Retries reuse one payment ID/signature and never request a second signature.
- Settlement response and on-chain evidence match the frozen authorization.
- No funds move during automated tests.

## Backlog and expected results

| ID | Workstream | Expected result | Status |
| --- | --- | --- | --- |
| DOC-01 | Scrum Master | Primary-source compatibility record | Complete |
| MCP-01 | MCP | Hosted `tools/list` client | Complete |
| MCP-02 | MCP | Tool allowlist, timeout, schema and size limits | Complete |
| MCP-03 | MCP | One normalized public read-only call | Complete |
| MCP-QA | MCP | Pure/static tests and live read-only smoke | Complete |
| X402-01 | x402 | Fuji facilitator/token/scheme evidence | Complete |
| X402-02 | x402 | Privy EIP-712 adapter without key export | Complete |
| X402-03 | x402 | Frozen intent, expiry, nonce and replay guard | Complete |
| X402-04 | x402 | Prepare/sign/settle state machine | Complete: settled 2026-07-31 |
| X402-05 | x402 | Settlement and independent on-chain evidence | Complete: verified against the Fuji RPC |
| X402-QA | x402 | Pure/static tests; no payment | Complete |
| LOCAL-01 | Scrum Master | Local doctor/build and browser acceptance | Pending |

## Evidence ledger

Rows marked "Passed discovery only" mean exactly that: the discovery, preparation
or read-only test passed, and no payment was made. Those rows are the state as of
`0158762` and are kept unchanged. The settlement row at the end of this table
records the first payment that actually moved funds.

| Area | Evidence | Result | Commit |
| --- | --- | --- | --- |
| MCP discovery | Live `tools/list` against exact `https://build.avax.network/api/mcp`; canonical `docs_search` present and locally allowlisted | Passed | `aee10c5` |
| MCP search/QA | First live `docs_search` exceeded the fixed 8-second limit and failed closed; one explicit read-only retry completed with the full suite at 7/7 | Passed with documented intermittent timeout | `aee10c5` |
| x402 facilitator | `GET https://facilitator.ultravioletadao.xyz/health` healthy; live `/supported` advertised v2 `exact` on `eip155:43113` | Passed discovery only | `0158762` |
| Fuji USDC | `/supported` asset `0x5425890298aed601595a70AB815c96711a31Bc65`, 6 decimals | Passed discovery only | `0158762` |
| RPC/token metadata | Fuji RPC chain `0xa869` (`43113`); read-only calls returned `name = USD Coin`, `version = 2`, `decimals = 6` | Passed read-only verification | `0158762` |
| Privy compatibility | Interactive EIP-1193 / `eth_signTypedData_v4` adapter prepared without private-key export | Passed preparation only | `0158762` |
| x402 QA | Pure fixtures for supported-scheme validation, frozen payment binding, expiry/nonce/replay and Privy adapter | 6/6 passed; no signature submitted or funds moved | `0158762` |
| **x402 settlement** | **First real payment. Fuji transaction `0x3c03d58756d93da7b8a1409cf621d859c853ed54d710974229e5183cfd9b70ad`, block `57475367`, 2026-07-31T08:27:50Z. Verified directly against `api.avax-test.network`, not against this application: status success, chain `43113`, exactly one `Transfer` log on USDC `0x5425890298aed601595a70AB815c96711a31Bc65` carrying `10000` atomic units from the payer to the frozen `payTo`, and one EIP-3009 `AuthorizationUsed` log burning nonce `0x503799fd…`. Payer balance moved 19.99 → 19.98 USDC.** | **Settled and independently verified** | this sprint |

Two facts about that settlement are worth separating from the happy path.

**Gas sponsorship is now measured, not assumed.** The transaction was submitted by
`0x4b9e841a…7202`, not by the payer. The payer wallet held zero AVAX and the
payment still went through, which is what EIP-3009 plus a sponsoring facilitator
is supposed to do and had never been observed here before.

**The first settlement was verified manually; the runtime gap is now closed.**
`settlement.ts` now waits for a confirmed Fuji receipt, verifies the exact USDC
Transfer log and persists bounded on-chain evidence before delivery. The first
transaction remains the historical acceptance proof; the new enforcement is
covered by focused and adversarial tests and still needs one fresh browser run.
The facilitator named in the discovery row above, `facilitator.ultravioletadao.xyz`,
is **not** the one this settlement used. The code points at
`https://x402.0xgasless.com` (`app/x402-avalanche/config.ts:6`), which is what the
doctor validated and what settled the payment. The discovery row is left as the
historical record of a different host.

## Current blockers

1. Run a fresh Privy browser acceptance with the new runtime receipt verifier.
2. Prove the second-user and zero-debit replay path at the application level.
3. Add an explicit read-only recovery path for merchant payments parked in
   `reconciliation_required`.
4. Complete one CCTP Fuji-to-Stellar Testnet bridge with its two scoped approvals.

Mainnet, automatic signing and custodial keys remain out of scope.
## Definition of done

- MCP client lists tools and performs one official read-only call.
- Unknown or mutating MCP tools are rejected locally.
- x402 compatibility claims are backed by exact official/live evidence.
- Privy is the only user signing surface and never exports key material.
- Test fixtures prove binding, expiry and duplicate/retry behavior.
- Focused tests and `git diff --check` pass.
- Localhost runs after dependency repair; any human signing/payment remains a
  clearly documented approval boundary.
- Workstreams are committed separately; the branch is pushed for backup only and nothing is deployed.
