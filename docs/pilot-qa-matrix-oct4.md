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
| Final full `npm run qa:local` | Pending | Awaiting final UI integration and root-confirmed final source hash. No full-QA claim is made for this intermediate candidate. |
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
