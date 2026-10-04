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
