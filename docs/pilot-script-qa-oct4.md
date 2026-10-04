# Pilot script QA — 2026-10-04

Source baseline: `7edcb1890a76a7dfcf9f3eb4da50615807a951be`.

## Production registry reference

`scripts/pilot-production-reference-readonly.mjs --read-only-pilot-before` performs public HTTP GETs, Vercel API GETs, and Neon transactions with `readOnly: true`. It reads the private connection file and original private reference in memory. Its output contains aggregate counts, public deployment identities and SHA-256 hashes only. It never prints private owners, wallet addresses, connection strings, credentials or row IDs.

The immutable pointer remains `work/explorer-release-baseline-latest.txt`. The referenced file SHA-256 is `42695fc364594d8c840419bc4ca8f0eec60b61a751470172ddf9f890bc09a9c8`; no new baseline replaces it.

The BEFORE receipt is `work/pilot-production-reference-oct4-source7ed-before-1791148417917.json`, UTC `2026-10-04T21:13:37.917Z`. All 17 checks passed. Production has 18 wallets, 30 associations and six global owners. The four original profile records, all wallet records and associations, original OAuth links and external permission records match the original reference. The current OAuth-link count is five; the four original links remain exact.

The probe's lifecycle counters are plans 1, Stellar actions 18, x402 payments 8, faucet claims 4, conversations 6 and messages 342. Every count remained unchanged during the probe interval. The original September reference has no lifecycle counts, so the probe establishes no historical financial delta before its own start.

Run the same script with `--read-only-pilot-after` after acceptance. It creates a new receipt using exclusive creation and does not overwrite any existing evidence. If production is released to a new verified deployment, set the public `PILOT_EXPECTED_COMMIT` and `PILOT_EXPECTED_DEPLOYMENT` values for that check. Database fingerprints and the immutable registry reference remain fixed.

`scripts/pilot-production-reference-window.mjs <absolute-before-receipt> <absolute-after-receipt>` performs an offline comparison of the full BEFORE-to-AFTER window. It rejects failed or wrong-phase receipts and reports financial table count deltas separately from normal conversation/message growth. Equal counts establish no net financial row-count growth; they do not prove every financial row value or external chain activity.

## Controlled regression tests

Run `node node_modules/tsx/dist/cli.mjs --test tests/pilot-market-regressions.test.ts`. All upstream calls are intercepted fixtures, constrained to GET requests and the existing provider host allowlist. No environment file, production connection, session or financial command is loaded.

The baseline run has 19 tests/subtests: 13 pass and six fail, including parent failure counts. Four leaf cases expose the intended corrections: exact validated echoed-slug CMC 400 absence, PAY inactivity, and TenX inactivity through either name or exact provider ID. The passing cases guard wrong echoed slug, wrong provider code, other 400, 401, 429, 503, timeout, AI ambiguity, unknown valid CoinGecko ID, ticker/name case, exact case-sensitive Solana USDC mint, partial identity failure, null versus zero, transient metadata retry, stale source time and cache expiry retry.

`is_hidden: 0` and a successful info lookup without `is_active` are deliberately insufficient to establish activity. Inactive search keeps `not_found` with `reason: "inactive"` and separate `inactiveCandidates`; an inactive quote keeps `unavailable` and supplies no quote. Existing status names, query identities, scopes and source contracts remain covered by the integration role.

These scripted checks do not establish independent tester completion, phone acceptance, effective external OAuth grants or a successfully revoked live session. Those require the corresponding visible authenticated flow.
