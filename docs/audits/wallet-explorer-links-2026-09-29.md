# Wallet explorer links

Branch: `codex/wallet-explorer-links`, based on `bded469`. Separate from wallet-preparation worker changes. Local verification completed 2026-09-30 01:10 UTC (2026-09-29 in Chile).

## Behavior

The existing MCP wallet projection adds nullable `explorerUrl`, including pending registrations. Admin and chat use the same server-side catalog generator. Invalid addresses and unknown networks have no link. No wallet creation, balance request, migration or financial operation is introduced.

Carmelita renders wallet replies as Network / Address / State / Explorer tables in Spanish, English and Portuguese. Returned records determine the rows; incomplete accounts are not filled with invented wallets. EVM rows retain the same address with separate network links. Pending Stellar registration does not establish on-chain activation; the explorer may report that the account does not exist.

The renderer escapes HTML, restricts clickable links to HTTPS explorer hosts, provides table column headers and keyboard focus, and confines horizontal scrolling to the table on narrow screens. MCP tool guidance asks ChatGPT to use returned URLs rather than inventing them.

## Sources

- [Avalanche official network documentation](https://build.avax.network/docs/primary-network): Fuji explorer `https://explorer-test.avax.network/c-chain`.
- [BNB official wallet configuration](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/): BNB Testnet explorer `https://testnet.bscscan.com`.
- Existing catalog destinations for Stellar Testnet, Base Sepolia and Solana Devnet are preserved; Solana retains `cluster=devnet`.

## Verification

- Clean dependency install: passed with pinned npm 11.6.1. Existing dependency audit notices were not auto-fixed.
- Full suite: 655 tests, 653 passed, zero failures, two external omissions (official MCP smoke and Dexalot Testnet smoke, opt-in).
- Production build: passed. No migrations executed.
- Lint: passed before final import-only cleanup; final run recorded in PR evidence.
- Tests cover all five exact destinations, invalid addresses, owned pending registration, foreign-row exclusion, ES/EN/PT tables, five expanded rows, shared EVM address with distinct links, unsafe links and escaped HTML.
- Browser fixture: passed in the internal browser, 390 × 844 viewport. Table scrolls inside its region without document overflow; Tab focuses the region and then its explorer link. All three languages inspected. Fixture uses fictitious identities and no authentication or database.
- Graphify update attempted, blocked by launcher referencing missing Python 3.12. Graph is not claimed current.

## Release gate

Preview acceptance and an actual comparison of Carmelita/ChatGPT results with this version are pending. No production promotion has occurred. CI, isolated Preview configuration and the manual promotion must be verified before release. Existing worker branch remains separate.
