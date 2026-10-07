# Independent pilot QA matrix — 2026-10-04

Candidate evaluated: `be150773d9f1138b4c865b0820aafafd6176dae1`, integration checkout `work/pilot-readiness`. This is an intermediate source evaluation before the final UI changes and final full QA.

| Gate | Status | Evidence and scope |
| --- | --- | --- |
| Production BEFORE registry | Passed | `work/pilot-production-reference-oct4-source7ed-before-1791148417917.json`: 17 checks; 18 wallets, 30 associations, six global owners, four original profiles exact. |
| Independent provider regression fixtures | Passed | 19 tests/subtests, including all four previously failing leaf cases. Exact valid echoed-slug CMC 400, PAY/TenX inactivity, retry, cache, identity and null/zero behavior. |
| Real shared market factory parity | Passed | Six tests: source injection, web/MCP DTO parity in es/en/pt, inactive/ambiguous/absent/outage states, request cancellation, partial provider errors and Base without token capitalization. |
| Market access fixtures | Passed | Two tests: anonymous/provider/insufficient scope and owner selectors rejected before provider I/O; asset/ranking bounds retained. |
| Broad shared query contracts | Passed | 22 tests: retained executable query inventories, scopes, owner derivation, fixed errors, source identity and reads without schema/onboarding/financial preparation. |
| Personal query fixtures | Passed | 23 tests: owner/scopes, conversation coverage, pending registrations, five Testnet/Devnet wallets, connected-app metadata, exact Stellar issuers/Fuji Circle token, partial RPC failures and chain identity. |
| Intermediate selected suite total | Passed | 72 tests, zero failures, cancellations, skips or TODOs. All provider/owner fixture calls are controlled. |
| Live public providers through integrated source | Observed | `work/pilot-market-live-source-be15077-1791149784015.json`, UTC `2026-10-04T21:36:24.015Z`: seven HTTPS GETs, no authentication, database or financial operations. |
| Full `npm run qa:local` on UI candidate 3608e7c | Failed | Graphify guards 5/5 and lint passed. Full unit suite: 903 total, 898 passed, three failed, two skipped. The chained build did not run. Source stayed pinned and tracked files remained clean throughout the run. Corrections and a new final run remain pending. |
| Isolated deployed candidate and authenticated web acceptance | Pending | The direct shared-source probe is not deployed-route or authenticated-session evidence. |
| Native ChatGPT authenticated candidate queries | Pending | Current native connector remains on production source 7ed; candidate publication and connected-app flow need separate evidence. |
| Live insufficient/revoked OAuth session and effective grants | Pending | Fixture scope/owner rejection passes; a live revoked session and external OAuth grants require their actual flow. |
| Independent tester and phone acceptance | Pending | Requires the human's actual visible acceptance; scripts establish neither availability nor completion. |
| Production AFTER and full-window financial counter comparison | Pending | Preserve the original BEFORE receipt; collect AFTER at the actual end, then compare the entire window offline. |

Selected run command from the integration checkout:

```text
node node_modules/tsx/dist/cli.mjs --test tests/pilot-market-regressions.test.ts tests/market-channel-parity.test.ts tests/market-data-access.test.ts tests/channel-parity-contract.test.ts tests/personal-query-parity.test.ts
```

Public provider observations preserve identities and source distinctions:

| Input | Observed result |
| --- | --- |
| PAY ticker | Quote unavailable with reason `inactive`; CMC 1758 TenX/PAY, 17978 PayBolt/PAY and 19749 PocketPay/PAY appear only in inactive candidates. Search is not_found with the same inactive evidence. |
| TenX name | Inactive CMC 27504 with symbol TENX. This live name/ticker lookup must not be reported as CMC 1758. |
| Exact CMC 1758 | Inactive historical TenX/PAY; no price. |
| AI | Ambiguous with 15 CoinGecko candidates; no automatic identity selection or quote. |
| Unknown valid slug and unknown valid CoinGecko ID | not_found. |
| XLM, SOL, AVAX, BNB | Four independent successful CoinGecko quotes with their exact canonical identities and timestamps. |
| USDC on Solana with exact public mint | Successful CoinGecko USDC quote. The controlled regression separately rejects a mint with changed letter case. |
| XLM plus unknown slug | Partial batch `[ok, not_found]`; cached XLM retains its original source update timestamp. |
| Invalid CoinGecko ID input | Rejected by the strict input schema before any provider I/O. |

The live script uses a programmatic `createMarketQueries({ fetcher, now })` factory and a candidate-specific tsconfig; it does not expose source selectors as a user or tool input. It rejects a mismatched source commit or dirty product source before reading providers and rechecks the commit/source afterward. Existing query IDs, tool aliases, strict input fields and `agent:read` scope remain intact. The MCP auth module, generic query authorization module and MCP route are unchanged from source 7ed.

Example invocation (use the root-confirmed full current commit):

```text
node node_modules/tsx/dist/cli.mjs --tsconfig C:/Users/MGC/Documents/ChatGPT/Carmelita/work/pilot-readiness/tsconfig.json scripts/pilot-market-live-readonly.mts C:/Users/MGC/Documents/ChatGPT/Carmelita/work/pilot-readiness be150773d9f1138b4c865b0820aafafd6176dae1
```

The script creates a unique ignored receipt with exclusive creation. Its projection contains public market IDs/names and public source evidence, excludes token addresses, and never loads a connection file, session or environment file. Public catalogs and availability may change. An unavailable upstream result remains explicit and cannot be converted to absence, zero holdings or human acceptance.

## Full QA failure record

`npm run qa:local` evaluated source `3608e7c26abad5b8382b59cc560422de3d8313e2` from `2026-10-04T21:40:20.8917158Z` to `2026-10-04T21:43:42.2353903Z`. Its sanitized log is `work/pilot-qa-local-3608e7c.log`; the receipt is `work/pilot-qa-local-3608e7c-receipt.json`. Log SHA-256: `f5d5bf8d3c1390567203d95baf8faee3faa4edf5f6018e506f5efd47d356de57`. No environment file or broader production acceptance command was loaded.

The three failures are recorded separately:

- `bootstrap-avalanche-contract.test.ts` expected the old exact source projection and prohibited the word `balance` anywhere in the context module. The newly explicit registration semantics include `balance: "not_inferred"`; this requires a meaningful behavior guard rather than the old source mirror.
- `chat-wallet-resilience.test.ts` exhausted its unchanged 30-second child-process deadline under the full parallel suite. Running that file alone on the identical source passed 4/4, with the actual send fixture completing in 12,609 ms. Limiting full-suite concurrency is justified; the service assertions and deadline need not be weakened.
- `query-acceptance.test.ts` rejected stale committed runtime hashes. All six groups include shared execution dependencies and package configuration. Current source hashes must be recomputed after final package/UI changes; old human evidence must retain its original fingerprints and remain pending for this changed source.

The strict product acceptance validator must continue rejecting stale or synthetic evidence. Updating `acceptance-runtime.json` is a source-hash refresh, not current human acceptance. A test may distinguish valid immutable historical records from current certification and verify that stale records are not advertised as accepted. Historical `acceptance-manifest.json` and `acceptance-evidence.json` bytes, reference hashes, timestamps, commits, kinds and checks must not be rewritten to make them appear current.

`scripts/pilot-acceptance-runtime-proposal.mts` computes the existing pure build/test helper's `{ schemaVersion, groups }` and writes only a unique ignored proposal receipt. It refuses an uncommitted or mismatched source, checks that historical artifacts remain byte-identical, and explicitly certifies no acceptance. Root must review and apply the runtime artifact after committing final package/source changes; the helper never writes app files.

## Final local QA receipt

The independent rerun of `npm run qa:local` evaluated `2026df2941e7eb26b33ac73d4121e4368b74edd5` from `2026-10-04T21:53:34.8103811Z` to `2026-10-04T21:56:04.2616635Z`, exit code zero. The log is `work/pilot-qa-local-2026df2.log`; the receipt is `work/pilot-qa-local-2026df2-receipt.json`. Log SHA-256: `e9dcd65c376debdb332c7996bb31acbe7195b706074d9bd76a0c162e1cd48d9c`.

Six tooling tests and lint passed. The full suite had 906 tests, 904 passes, zero failures, zero cancellations, two skips and zero TODOs. The explicit skips were the live official MCP smoke and live Dexalot Testnet smoke. Compilation, TypeScript and generation of all 23 static pages succeeded. Test concurrency is four; the chat child-process deadline remains 30 seconds.

Before and after source commit were identical, as was Git tree `e8100fa2793e1f1388b8feac518a54d8fca7420c`; tracked files remained clean. The historical manifest SHA-256 remained `e5eee534c083e6881b129b7bf58a16616b608ddb646cc18da6cbcd04a70d9af8`, and historical evidence SHA-256 remained `924024612e3318608fa41aecd3449f537b45daa4db85838737894acc3cb2ae25`. No environment file or broader production acceptance command was loaded. The refreshed runtime hashes do not migrate or certify the historical human observations.

This documentation update lives only in the independent QA checkout while root keeps the integration candidate pinned. Local QA does not complete authenticated deployed web, native ChatGPT, revoked session, phone or independent tester acceptance. Root's subsequent natural-language routing finding requires another candidate and another full QA run.

## Production and QA references remain separate

Production AFTER is `work/pilot-production-reference-oct4-source7ed-after-1791151407859.json`, UTC `2026-10-04T22:03:27.859Z`. All 17 checks pass: served source/deployment remain 7ed, 18 wallets, 30 associations and six global owners; the four original profile rows and all original wallet, association and database permission hashes remain exact. The original four OAuth links remain preserved within the same five current links as BEFORE. Supported resource scopes remain unchanged. Effective external Stytch grants are not certified by these database checks.

The offline comparison is `work/pilot-production-window-oct4-source7ed-1791151413528.json`. It passes all five checks from `2026-10-04T21:13:37.236Z` to `2026-10-04T22:03:27.850Z`. Both endpoints have plans 1, Stellar actions 18, x402 payments 8, faucet claims 4, conversations 6 and messages 342. Every delta is zero. This establishes no net financial table count growth within that bounded window, not every row value or external chain activity.

The separate QA reference is `work/pilot-qa-registry-before-1791151530938.json`, UTC `2026-10-04T22:05:30.938Z`. It has five owners, 15 wallets and 25 associations, with zero OAuth-link and database external-permission records. Ethereum and Solana each have five internally active registrations; Stellar has four active and one pending. Fuji, Base Sepolia, BNB Testnet and Solana Devnet each have five active associations; Stellar Testnet has four active and one pending. These are registry states, not on-chain activation or balance evidence.

The QA lifecycle reference has plans 0, Stellar actions 0, x402 payments 1, faucet claims 0, conversations 5 and messages 329. These are current existing counts; no retrospective claim is made before this first QA fingerprint reference. Its probe deltas were zero.

`scripts/pilot-qa-registry-readonly.mjs --read-only-qa-before` uses only SELECT/read-only transactions, verifies the fixed isolated QA fingerprint, keeps private rows/connections in memory and writes a unique ignored receipt. For acceptance, take a new BEFORE immediately after final page initialization and before executing queries. Then run `--read-only-qa-after <absolute-before-receipt>` at the end. The optional comparison checks all registry fingerprints and the full-window financial counters; message/conversation growth is reported separately.

Fingerprints include owner IDs/email/status; wallet IDs/owner/address/family/network/status; association wallet/owner/network/status; OAuth issuer/subject/Privy mappings; and database provider/status/scopes permissions. They exclude `updated_at`, `last_seen_at`, `last_used_at` and `created_at`, so normal page initialization timestamps cannot masquerade as identity or permission changes. The 22:05 snapshot is not a substitute for the immediate post-initialization BEFORE of a later acceptance run.

## Routing candidate local QA receipt

Candidate `40eefbdc86aafba153f3acf652031217725e999d` contains the natural PAY routing, locale and shorthand correction. Its independent `npm run qa:local` run passed with exit zero from `2026-10-04T22:10:49.0100926Z` to `2026-10-04T22:13:04.4943785Z`. The sanitized log is `work/pilot-qa-local-40eefbd.log`; the receipt is `work/pilot-qa-local-40eefbd-receipt.json`. Log SHA-256 is `6ca91415cffc56fef0dd660f0ec3cf61394df5449944237e789919cc26ae1de5`.

Six graph tooling tests and lint passed. The full unit suite had 909 tests, 907 passes, zero failures, zero cancellations, two skips and zero TODOs. The skips remain the live official MCP and live Dexalot Testnet smoke tests. Build compilation passed in 20.7 seconds, TypeScript in 19.5 seconds, and all 23 static pages generated. The test concurrency remains four and the chat child-process deadline remains 30 seconds. Next.js reported the known multiple-worktree-lockfile warning; it did not prevent compilation or build completion.

The commit remained pinned and tracked source stayed clean. Before and after Git tree were both `0d4afd8c9ab031798ecc825ec58dc8094669c208`. Historical manifest and evidence bytes retained the exact SHA-256 hashes recorded above. The command loaded no environment file and invoked no broader production QA. This result independently evaluates the corrected candidate and does not inherit UI acceptance from `2026df2`, which had passed local QA before the natural-language routing defect was found.

Authenticated deployed UI verification, its immediate post-initialization QA BEFORE/AFTER window, native ChatGPT, revoked-session behavior, phone and independent tester acceptance remain separate pending gates. The production comparison remains bounded through `22:03:27.850Z`; this local QA result extends no database or human acceptance window.

## Normal wallet chat rejects 40eefbd

Root reported that the deployed natural request `Mis billeteras` on `40eefbd` returned only Stellar context, balance information and financial CTAs. This rejects chat acceptance for that candidate despite its local QA and CI pass. Root separately observed the wallet panel's five registered network rows, five explorer links, three EVM associations sharing one address, Solana Devnet and Stellar Testnet. Panel focus/draft/history and viewport observations do not resolve the chat routing failure. A later partial XLM/PAY query also passed independently of this defect.

The SELECT-only QA AFTER receipt `work/pilot-qa-registry-after-1791152473093.json`, UTC `2026-10-04T22:21:13.093Z`, compares the immediate post-initialization BEFORE `work/pilot-qa-registry-before-1791152076391.json`. All seven registry fingerprints are exact; counts remain five owners, 15 wallets and 25 associations. The bounded window from `22:14:35.839Z` to `22:21:13.092Z` has zero net growth in plans, Stellar actions, x402 payments and faucet claims, zero conversation growth and 14 additional messages. This proves the recorded registry and counter boundaries while leaving the rejected reply rejected.

The independent script `scripts/pilot-wallet-chat-acceptance-controlled.mts` exercises actual `sendAgentMessage` against a pinned clean checkout with module mocks. Its synthetic registry contains five enabled network associations of three owned wallet identities, a foreign owner's row and a disabled Mainnet row. It requires exactly five network rows, localized registration state, pending registration rather than activation, exact Testnet/Devnet explorer URLs, three occurrences of the shared EVM identity, no foreign rows, no balance context, no action buttons and no financial/planning intents. Ancillary Stellar, balance, memory/schema, wallet registration and funding operations are guarded; fetch is blocked. Mock database persistence permits only conversation/message tables. Real database writes and network requests are never permitted.

The baseline receipt `work/pilot-wallet-chat-controlled-40eefbd-1791152672433.json` records 14 checks: four pass and ten fail. The three possessive requests (`Mis billeteras`, `My wallets`, `Minhas carteiras`) fail routing. The three verb forms route correctly but do not yet meet the required pending-registration presentation. The overall ancillary-read guard also fails on the unsupported possessive requests. Its source/tree remain pinned. This is controlled regression evidence, not another deployed UI acceptance observation.

Run the script with Node's module-mock flag and the target checkout's tsconfig; do not load environment files:

```text
TSX_TSCONFIG_PATH=<target>/tsconfig.json
node --experimental-test-module-mocks --import tsx <own-checkout>/scripts/pilot-wallet-chat-acceptance-controlled.mts <target-checkout> <full-commit>
```

The revised wallet-chat candidate requires its own clean-source regression, full local QA, deployed natural-query verification and immediate QA registry window. Phone, native ChatGPT, revoked session and independent tester observations remain pending.

The independent script now has 26 checks. In addition to the six original phrases, actual controlled sends cover `¿Cuáles son mis billeteras?`, `¿Qué billeteras tengo?`, `What wallets do I have?` and `Which are my wallets?`, with the same five-row, owner, explorer, registration-state and side-effect assertions. Parser-only controls route `Muestra el saldo de mis billeteras`, `Show my wallet balances` and `Mostre o saldo das minhas carteiras` to `personal.wallets.balances` without executing its reader. `Qué es una billetera` must not resolve to a personal read. The original 14-check baseline receipt remains immutable; the expanded script requires a new receipt against the next integrated candidate.
