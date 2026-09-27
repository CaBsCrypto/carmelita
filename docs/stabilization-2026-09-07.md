# Local stabilization — September 7, 2026

## Changes

- Node 24.14.0, npm 11.6.1; verified clean lockfile installation with pinned tooling, without changing direct dependency versions.
- Bazaar reference excluded from Git, TypeScript, ESLint, npm packaging and Vercel upload. Its files were not edited or moved.
- Shared WebMCP types and serialized registration; abort cleanup, stale callback rejection, fresh credentials and sanitized HTTP failures.
- Direct Solana faucet WebMCP tool removed. The explicit first-party flow remains, and invalid JSON or missing confirmation rejects.
- Pull-request CI runs clean install, lint (zero warnings), tests and build without migration or external payment steps.

## Validation

`npm ci --no-audit --no-fund` succeeded using npm 11.6.1 and Node 24.14.0. npm reports upstream OpenZeppelin package-manager advisories and deprecated transitive dependencies; no direct dependency versions were changed to suppress them.

Final local quality run: 413 cases, 411 passed, 0 failed, 2 explicitly skipped external smoke tests (Avalanche official MCP and Dexalot). Lint passed with zero warnings and production build completed successfully. Evidence: [full local quality output](audits/stabilization-2026-09-07/quality.txt). Direct dependency versions were independently compared to HEAD and are unchanged.

`graphify update .` was attempted but its launcher cannot start the configured Python312 interpreter. The graph is not current; no graph was generated inside Bazaar.

No deployment, migration, account mutation, reservation or payment was executed. Current authenticated acceptance still needs a configured test environment and user login/confirmation through Carmelita. Public health alone does not close that gate.

## Next acceptance

Use the existing acceptance scripts with the test deployment configured. First verify two independent user logins and wallet persistence; then obtain transaction-specific user confirmation for a Stellar Testnet payment, verify delivery and debit, replay without a second debit, and check cross-user rejection. Never load a production database for local quality checks. Do not mark this gate passed using mocked tests.

Compatibility reference: https://webmachinelearning.github.io/webmcp/ (September 4 draft, consulted September 7). Native Document registration is preferred, with Navigator as a compatibility fallback. Native cleanup uses the registration AbortSignal; optional legacy unregisterTool is supported. Execution cancellation propagates to requests. Actual browser acceptance remains separate from mocks.

Dependency clarification: with npm 11.6.1 the original package resolution installs cleanly; the lockfile diff only records the pinned engine metadata. The earlier missing-entry failure was observed with npm 11.9.0. No speculative package additions were required.

## Handoff status

Milestone 1 is ready for local review. Milestone 2 is awaiting the existing Carmelita test deployment URL and user-driven authenticated acceptance. Milestone 3 remains unimplemented; it follows the Stellar acceptance gate. The deployed Bazaar origin is also pending confirmation. No claim of full-plan completion or live browser acceptance is made.
