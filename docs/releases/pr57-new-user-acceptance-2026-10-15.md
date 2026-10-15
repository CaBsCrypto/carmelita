# PR57: new-user registration and final acceptance preparation

Reviewed October 15, 2026, from PR57 baseline `aa48e101bf90d69ad0cf4fe004ef53311f135ada` on `codex/landing-redesign`. This follow-up does not merge PR57 or publish a deployment. The final source commit and its GitHub checks are recorded in the PR.

## Resulting registration behavior

Normal chat authorization persists the verified profile, creates or recovers the owner's canonical Stellar, EVM and Solana identities, and issues a grant only after all three registrations succeed. It reads Stellar activation status without requesting Friendbot funding. The separate normal `/api/agent/bootstrap` flow retains its existing Testnet activation behavior and disclosure.

An EVM-only owner keeps the same EVM wallet, including when it exists in Privy but is not yet in the internal registry. Only missing families are created. Partial provider or persistence failures prevent subject linking and grant issuance; a fresh connection recovers the same provider wallets and completes registration. Denial performs no registration or wallet preparation.

Tempo's existing-wallet demo remains unchanged at the server boundary: it requires all three registered families and validates ownership without creating wallets, writing profiles, activating accounts or funding them. New users are not enabled in current production by this work. `/login` and OAuth consent explain that restriction in English, Spanish and Portuguese. Restricted login goes to `/tempo`; normal login goes to `/agent`.

## Local acceptance

| Boundary or scenario | Evidence | Scope |
| --- | --- | --- |
| New owner without wallets | `tests/oauth-new-user-route-fixture.mts` | Real authorization handler, owner orchestration, preparation, provisioner and wallet selection; synthetic external identity/provider/database boundaries |
| EVM-only owner, registered or unregistered | Same fixture | Existing EVM ID/address retained; only Stellar and Solana created |
| Reconnection | Same fixture | All canonical identities reused; no additional wallet creation |
| Partial provider failure and retry | Same fixture | No link/grant while incomplete; successful families retained |
| Profile or family persistence failure and recovery | Same fixture | No grant before persistence; already issued provider wallets recovered without duplication |
| No OAuth activation/funding | Fixture plus `tests/stellar-activation-onboarding.test.ts` | Activation hook and external fetch guards; normal bootstrap default retained |
| Tempo existing-wallet restrictions | Existing OAuth route and ownership tests | No fallback to provisioning or funding |
| Login and consent UI | Actual client components and CSS in isolated loopback browser fixture | Synthetic Privy SDK and transport; normal/restricted login destinations, EN/ES/PT, denial and single-request behavior |
| Proposal POST, persistence, outbox and private review | `tests/proposal-review-postgres-fixture.mts` | Real routes, schema creation, Drizzle queries, auth allowlist and server review component against disposable PostgreSQL 17.11 |
| Duplicate after notification | Same fixture | Original content retained; one outbox job; no second simulated provider notice |
| Provider failure and authorized recovery | Same fixture | Proposal remains reviewable; retry uses frozen payload and idempotency key |
| Anonymous/ordinary user, revocation and allowlist removal | Same fixture | Private review and dispatch denied before inbox SQL |
| Logout | Same fixture | Real logout handler clears both administrative cookies; later session, review and dispatch denied |
| Outbox concurrency and process recovery | Existing PostgreSQL fixture | Six scenarios with independent connections and a non-superuser role |

The PostgreSQL runner executes seven integrated review scenarios plus the six existing outbox scenarios:

```powershell
node scripts/proposal-email-postgres-local.mjs
```

The runner uses an owned loopback-only temporary cluster and removes it after stopping its child server. No `.env` files or remote databases are loaded. Identity verification, request cookie context, Next `after` and email transport are synthetic. Real emails and external fetches are zero. This is application integration acceptance in Node, not a hosted Next.js/browser/cookie acceptance.

Full regression command: `npm run qa:local` (graph tooling, lint, tests and local production build). Graph tooling passed 7/7 and lint passed. The first sandbox run reached the full test suite but its eight scheduler loopback cases returned `network_error`; 1,178 other tests passed. Repeating the same complete test suite with loopback access passed **1,186 tests, four expected skips, zero failures**. The separate Next.js production build and TypeScript check also passed. The existing warning about multiple worktree lockfiles remains; no Next configuration was changed to suppress it.

Final counts, source hashes and command outputs are retained in the ignored `work/new-user-acceptance-20261015/` evidence directory. The existing acceptance manifest/evidence and execution fingerprints are not rewritten to certify these local observations. Independent code review found no actionable issues. Graphify was updated after staging the new tests; its existing partial-parser warning for `tests/proposal-email-postgres-fixture.mts` remains an extraction limitation, not a TypeScript failure.

## Remaining final acceptance

PR57 stays draft. Its hosted evidence from `598bb3f` remains historical and does not certify this follow-up. Final hosted acceptance is still pending:

1. Choose an isolated registration environment and candidate with the normal enrollment configuration. Current production Tempo mode cannot test a new user; disabling that guard or changing production flags is not part of this work.
2. Complete a real fresh Privy login, Stytch consent and callback in ChatGPT. Repeat with an owner who has only EVM; confirm the same EVM address and all registered families in owner-bound reads. Pending Stellar activation is a valid registration state, not proof of funds or an active chain account.
3. Verify cancellation/retry, revocation/reconnection, mobile and two-user isolation, including a late response after changing owners.
4. Exercise the real proposal form, isolated Neon HTTP adapter, private reviewer page and ordinary-user denial in that same candidate. Confirm a duplicate does not send a second notice and logout removes access using actual browser cookies.
5. If real email delivery or unattended recovery is included, verify the chosen transport and explicitly configured scheduler. Local simulated delivery does not certify a mailbox or an installed schedule.

No hosted build, deployment, production SQL, real email or configuration change is authorized by this acceptance preparation. The repository's Vercel cost controls remain in effect; a later hosted window must identify the exact candidate and cost allowance. Main/production are not changed by this follow-up.
