# Carmelita landing and service proposals — release preparation

Prepared on October 13, 2026, using the Santiago client date. This is a reviewable release packet, not publication approval. It supersedes the October 5 runbook's deployment instructions for this candidate; historical evidence remains intact.

## Frozen application candidate

- Repository: `CaBsCrypto/carmelita`, public.
- Branch: `codex/landing-redesign`.
- Application candidate: `78dc9242680a5c4b00308a836d7167dcb6a0e7ed`.
- Live GitHub main: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`.
- Candidate delta: 20 commits and 70 files before this documentation packet. No application source changes were made while preparing it.
- [PR57](https://github.com/CaBsCrypto/carmelita/pull/57) is draft and its remote head is `9b2c8a8b8bbe59f3398724709fea5eb97fe4eb2f`. Fifteen candidate commits are still local. Its current Stellar-oriented description does not describe the complete multichain/proposal candidate.
- The [passing CI run](https://github.com/CaBsCrypto/carmelita/actions/runs/38205212004) belongs to `9b2c8a8`, not to the later local candidate. CI on the final publication head remains pending a separately agreed branch push.
- Local `main` is an older reference; use the verified live SHA above when preparing a future integration. Do not reset existing worktrees.

The [prepared PR text](landing-proposals-pr-draft.md) remains local. No PR body, branch, protection rule or remote ref was changed.

## Scope to review

| Surface | Candidate behavior | Acceptance boundary |
| --- | --- | --- |
| Home, connection and guide | Personal agent in ChatGPT, multichain account context, recommended manual connection, direct Carmelita sign-in, local Inter and demand-driven depth effects | EN is the initial/server language; ES/PT remain available. Account/workspace connector availability still applies. |
| Login, OAuth and agent entry | Consistent access presentation and translated preparation/error states | Existing identity, callbacks, owner isolation, scopes and wallet contracts remain intact. |
| Developer proposals | Consent, bounded form input, durable save, safe duplicate handling and private review inbox | Receiving a proposal keeps it pending manual review. It does not approve, publish or activate a provider. |
| Email notices | Atomic outbox, frozen minimal payload, bounded retries, fenced leases and private inbox link | Production flag remains disabled; real deployed database/admin acceptance and scheduling are pending. |
| Existing ChatGPT wallet reads | Preserve the established five Testnet/Devnet networks and account-specific reads | Registration, network activation and balances remain distinct. New UI evidence does not replace authenticated hosted acceptance. |

This release does not add Tempo production support, Claude acceptance, payments, public provider enrollment or private per-user installation of a newly proposed service. Those flows require their own acceptance.

## Branch coordination

Live open PRs observed during preparation:

| PR | Branch / observed head | Treatment |
| --- | --- | --- |
| [57](https://github.com/CaBsCrypto/carmelita/pull/57) | `codex/landing-redesign` / `9b2c8a8` | Primary draft; update only after the candidate push is explicitly agreed. |
| [58](https://github.com/CaBsCrypto/carmelita/pull/58) | `feat/tempo-testnet-mcp` / `f5731a6` | Separate Tempo pilot, default off and production blocked; hosted user acceptance remains pending. |
| [56](https://github.com/CaBsCrypto/carmelita/pull/56) | `codex/chatgpt-milestone-closeout` / `c4ed99a` | Separate milestone documentation and recovery work. |
| [49](https://github.com/CaBsCrypto/carmelita/pull/49) | `codex/claude-onboarding` / `f28ea6f` | Separate Claude pilot. |

All four are drafts. The landing and five inspected Tempo worktrees were clean and share the same main base. Tempo's backend, wallet, contract and QA patches are already represented in its aggregate branch; do not integrate those subbranches again on top of the aggregate.

A read-only three-way `git merge-tree` simulation between the pinned landing and aggregate Tempo heads found:

- `app/layout.tsx`: shared changes merged textually; its resulting presentation still needs review if combining releases.
- `app/queries/acceptance-runtime.json`: an actual text conflict. Recompute execution fingerprints from the final combined sources through `buildAcceptanceRuntimeFingerprints`; do not choose one stale snapshot or alter historical acceptance evidence to create a passing badge. Fresh acceptance may still be required.

No merge commit, refs or worktrees were changed by that simulation. A combined release would need a new candidate and its own checks; the landing can remain a separate candidate.

Work preserved outside this candidate: wallet worker (30 pending paths), OAuth navigation (four), and marketing videos (two), as observed during the read-only audit. No cleanup, stash, reset or cross-worktree edits occurred.

## Evidence associated with the candidate

- Candidate regression: 1,083 passed, three opt-in cases skipped; lint and TypeScript passed. Native PostgreSQL acceptance ran separately: six scenarios, two independent backends, non-superuser role, atomic rollback, contention, fencing and fresh-process recovery.
- Real form/POST/store/worker/transport/review page exercised locally against PostgreSQL with synthetic identities and provider responses. Duplicate preservation, provider failure and recovery without a new submission passed; repeat dispatch processed zero jobs.
- A new local Next.js 16.2.6 production build passed on application SHA `78dc924`, using Node 24.14.0 with database and email disabled. Next's CLI was invoked directly; GitHub CI still installs npm 11.6.1. No dependency installation or lockfile mutation occurred. The initial sandbox SWC permission error was resolved by running the same local compilation with filesystem approval.
- The build reported the existing nested-worktree root/lockfile inference warning. CI in the normal repository checkout must verify the final head; no Next configuration change was made to hide that warning.
- Earlier responsive, locale and access-design evidence remains scoped to its recorded commits. New real-device, manual zoom and authenticated hosted acceptance must not be inferred from those historical screenshots.
- Graphify was queried using the existing 4,048-node AST graph. This preparation changes documentation only; its existing SQL-parser, partial fixture and labeling limitations remain recorded in the email verification document.

Local receipts, build log, merge simulation, hashes and recovery proof are under ignored `work/release-prep-20261013/`. No contacts, credentials, private billing screenshots or raw provider responses belong in this public packet.

## Verified GitHub and hosting controls

Main requires a PR and a strict `local-quality` check, including administrators. Required second approvals remain zero. Force-push and branch deletion are blocked. The existing workflow runs graph tooling, lint, tests and a local build; it does not automatically install/run native PostgreSQL acceptance.

The Vercel project is `prj_UQnTOdi1AWU6soTr04ACsqNo7YDu` in `team_XjolcoWJ9V9yamVnCdpC7EMY`:

- Build machine: `standard`, selection `fixed`, extra concurrency disabled. Standard has four vCPUs according to [Vercel's build documentation](https://vercel.com/docs/builds/managing-builds).
- Existing ignored Git build step continues to omit non-main branches; main still builds automatically. Keep it unchanged.
- `carmelita.browns.studio` serves production deployment `dpl_GpjPYjyeXDwhrwZMiwRzRRVcAaeH`, `READY`, main SHA `caa3cd3`. No current cron jobs were reported.
- Existing Tempo Preview `dpl_2fUtySGNT6d3YU6HnKCghL7H8Fne` is `READY`, source `cli`, SHA `f5731a6`. Its PR description says no Preview was executed; reconcile that historical statement in the Tempo task. This preparation did not create it and deployment metadata alone does not quantify its billed CPU use.
- Billing was inspected read-only through the authenticated dashboard because the CLI failed to parse its JSONL response. Private observations include the current cycle and consumed included credit. An agreed spend/build allowance for this publication remains pending; reading Billing is not publication authorization.

Environment metadata was inspected without decrypting values. Production has the Resend sensitive secret and the proposal sender, recipient, enable flag, trusted origin and admin allowlist names. Neither the worker capability nor `CRON_SECRET` was listed. Name presence does not verify the deployed values or the reviewing account; reconfirm configuration within the agreed window. The currently deployed main does not contain the candidate's email-notice implementation.

## Scheduling decision prepared, not installed

The existing dispatcher makes at most one authenticated GET and five job claims per invocation. A proposed five-minute cadence means 288 invocations per day, or 8,640 in 30 days; this is a request-count estimate, not a dollar quote or an availability guarantee.

| Option | Preparation needed | Cost/control boundary |
| --- | --- | --- |
| Vercel Cron | Review a production-only cron configuration; Vercel sends `Bearer CRON_SECRET`, while this route verifies `CARMELITA_PROPOSAL_EMAIL_WORKER_TOKEN`. Agree a dedicated shared capability or a separately reviewed adapter. Check existing secret use first; do not reuse unrelated credentials. | Cron execution consumes function resources. Agree cadence and budget before enabling. A cron config becomes part of a deployment. |
| External scheduler using the prepared CLI | Supply the dedicated capability securely to the scheduler and Carmelita, pin the reviewed runner and use `--check` before agreed execution. | An external scheduler still invokes a Vercel function. Hosting and authentication for that scheduler are not provisioned. |

[Vercel's cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs) explains the header; [cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) describes function resource consumption. No scheduler, credential, cron configuration or production flag was created or changed here.

## Ordered publication gates

1. Agree the application scope: this candidate alone, or a separately integrated/validated Tempo candidate. Keep PR57 draft while its remote head is stale.
2. Agree any branch push to update PR57. Recheck the Vercel filter first. Verify the new remote head and `local-quality` CI against that exact SHA; do not attribute the older green run to it.
3. Agree a concrete hosted window and cost before acceptance that requires any hosted build. Any QA build and production build are separate items; one grouped production release does not waive hosted QA requirements or guarantee one total build. Prebuilt production parity remains unvalidated.
4. In that agreed environment, validate the actual isolated Neon HTTP adapter/DDL permissions and a real reviewer opening the private inbox, plus denial for an ordinary account. Prepare environment values server-side without retrieving credentials into local files. Do not perform unapproved production SQL.
5. Choose mail activation and scheduler scope before any authorized build: environment changes require a new deployment to take effect. Publishing with notices disabled and enabling them later would require another publication; do not imply runtime activation is free of that step. Disabled/manual profiles retain email delivery and unattended recovery as explicit pending work.
6. Record current main, final candidate, production deployment and rollback immediately before release. Merge/publish only on the later explicit request. Recheck domain, target, Git SHA and CI afterward.
7. In the agreed environment, complete proposal → save → authenticated review with one approved synthetic contact. If notices are included in the agreed release, also verify real email delivery; if unattended recovery is included, verify its installed schedule. For a disabled/manual profile, keep those two checks pending and do not announce those features. Recheck duplicates and private access in every profile. Record remaining failures; do not publish services automatically.

## Rollback reference and procedure

The verified pre-release production artifact is `dpl_GpjPYjyeXDwhrwZMiwRzRRVcAaeH` at `caa3cd3`. Pin it again immediately before publication; do not use the October 5 historical deploy IDs as the default rollback for this candidate.

If a later release must be reversed, obtain the agreed rollback decision, stop the future scheduler, and restore that verified production artifact. Vercel rollback restores its previous environment/cron snapshot and disables automatic production-domain assignment; changing an environment value alone does not update an already running deployment. [Official rollback behavior](https://vercel.com/docs/instant-rollback).

Preserve proposals, outbox rows, frozen payloads and idempotency keys. Rollback does not undo external database changes. For an uncertain provider delivery, retain `needs_review`; do not reset the key or blindly resend. After rollback verify the canonical domain, SHA, wallet reads, private access and scheduler state. Re-enabling normal production assignment is a separate agreed action.

## Preparation outcome

No push, merge, PR edit, hosted build, deployment, production SQL, additional real email, billing-limit change, credential creation or worktree cleanup was performed. The documentation commit and local branch bundle are preparation artifacts only; remote backup and CI for the new head still depend on the later agreed branch push.
