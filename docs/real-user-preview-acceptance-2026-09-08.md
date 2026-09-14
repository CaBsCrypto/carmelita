# Real-user Preview acceptance — 2026-09-08

Status: the two-user login, persistence, data-isolation and final administrative
registry checks passed. This is not acceptance of payments, delivery, receipts
or bridges.

PR: [#28](https://github.com/CaBsCrypto/carmelita/pull/28), existing branch
`fix/webmcp-type-contract`; the original handoff and commit history are preserved.

Validated application commit: `162db806321d7cfd95b19696dad2e43b019b445e`.
Deployment: `dpl_8TBUE2URbrVo8YbnZFoR51zSJBda`,
[immutable Preview](https://agente-asistente-dyxwbihut-cabscryptocontacto-6028s-projects.vercel.app).
The [branch Preview](https://agente-asistente-git-f-22838e-cabscryptocontacto-6028s-projects.vercel.app)
can advance after documentation commits; the evidence below identifies the
application version actually checked.

## Results

All dates and times are UTC on September 8. Login, reload and recovery were
observed in the visible Privy/application flow on `9758bd8`; their individual
times were not recorded. API checks below were repeated on `162db80` after the
memory rejection fix. Codes stayed in Privy and access tokens were not exported.

| Check | Result | Evidence and boundary |
| --- | --- | --- |
| Separate Privy and administrator sessions | Approved | Both sessions closed before switching identities. |
| Login and automatic wallet provisioning, A and B | Approved | Two QA users, three separate wallet addresses each: Stellar Testnet, Avalanche Fuji and Solana Devnet. |
| Reload and logout/login recovery | Approved | Each recovered its own marked chat and memory and the same three addresses. |
| Ordinary users excluded from administration | Approved | Both visible attempts rejected; authenticated admin API returned 401 for each on the final code. |
| Both designated administrators allowed | Approved | Both entered the private panel through Privy; one repeated the final registry inspection on the corrected deployment. |
| A: chat, memory and wallet API ownership | Approved, 05:47:56 | Adding the other owner's selectors still returned only A's data. |
| B: same API ownership checks | Approved, 05:53:26 | Only B's data returned; A's markers absent. |
| Foreign memory modification, both directions | Approved | Known existing foreign memory IDs returned 404; full JSONB snapshots of both records were unchanged at 05:54:42. |
| Exact temporary-record cleanup | Approved, 05:55:08 | Four selected chat messages, including their associated replies, and two selected memories removed atomically. |
| Preservation after cleanup | Approved, 05:55:38 | Two users, six wallets and two conversations identical to pre-cleanup JSONB; all remaining message/memory rows identical. |
| Wallet ownership and duplicates | Approved, 05:55:45 | No duplicate user/network pairs or addresses shared across owners. |
| Financial activity | Approved within checked scope | Zero QA x402 payments, Stellar actions and faucet claims; no funding or financial execution requested by this run. |
| Deployed Solana registry display after correction | Approved, 06:01 | Visible administrator session: two complete users, six wallets, zero needing attention; Solana selector and both Devnet explorer links correct. |
| Gateway plans, receipts and tokens for these real identities | Pending | Earlier synthetic Gateway checks remain separate evidence. |

See [sanitized machine-readable evidence](audits/real-users-preview-2026-09-08/evidence.json).
Emails, personal IDs, addresses, exact cleanup IDs and snapshots stay in ignored
local evidence. Accounts, wallets, conversations and initial welcome messages are
retained for the next milestone; this was not a deletion of all account data.

## Corrections found during acceptance

The wallet registry previously marked valid Solana addresses invalid and omitted
Solana from completeness. It now includes Solana in required networks, validity,
missing-network counts and the selector, with the correct Devnet explorer URL.

Memory UPDATE/DELETE already filtered by both record ID and authenticated owner,
but returned success when no row matched. They now return 404 for both missing
and foreign records, without disclosing which case occurred. Store tests verify
ownership predicates; the live PATCH checks verify the 404 response.

A Preview-only `/preview-acceptance` page uses the existing authenticated APIs
after checking the isolated environment; its report records the deployment
identity for review. It compares
own data with attempted foreign selectors, rejects administrative access, and
attempts to pause only an explicitly identified foreign fictitious memory. The
database snapshot comparison independently verifies that neither memory changed.
No new API is added. GET routes can initialize storage or update conversation
metadata; they are not strictly free of database writes. These comparisons do
not establish arbitrary endpoint, receipt or mutation isolation.

## Validation and remaining scope

On `162db80`, local lint had no errors or warnings, TypeScript/build completed,
and the suite reported **458 total, 456 passed, zero failed, two skipped**.
[CI also passed clean installation, lint, tests and build](https://github.com/CaBsCrypto/carmelita/actions/runs/34191836259/job/101951311714).
The skips retain explicit external opt-in requirements: `AVALANCHE_MCP_LIVE=1`
for the official MCP smoke and `DEXALOT_LIVE=1` for Dexalot Testnet.

Both Stellar wallets were reused and had pre-existing Testnet balances. This
run does not prove creation of a new empty Stellar wallet. Avalanche and Solana
showed zero native balance. Three-network wallet persistence is accepted here;
Solana transfers and SPL capabilities require independent review and acceptance.
The user selected separate networks and deferred bridges.

The isolated QA database and branch-specific configuration remain as documented
in [the baseline delivery](preview-pr28-2026-09-08.md). Production was inspected
again after the API tests and cleanup and still resolves to
`dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG`; its alias was not reassigned. No Bazaar files,
funding, payments, trustlines, reservations or production settings were changed.

Graphify update remains blocked by its missing Python 3.12 interpreter; the graph
is not claimed current. Live Gateway acceptance for these identities, payment
approval/signing, delivery and receipt recovery remain separate pending work.
The next financial test requires a specific visible user approval in Carmelita.
