# Prepared PR57 update — not posted

Proposed title: **Carmelita: multichain landing, account access and service proposals**

The public pages previously presented different connection paths and a narrower wallet-first message. This candidate presents Carmelita as a personal agent in ChatGPT with multichain account context, a recommended manual connection path and direct Carmelita sign-in. Home, connection, guide, developer portal, login, OAuth and agent entry share the updated visual language and English-first rendering, while retaining Spanish and Portuguese user choices.

Developers can submit a bounded, consented proposal for private manual review. Saved proposals survive mail failures; duplicate submissions preserve the original. Optional notices use an atomic SQL outbox, frozen minimal payload, stable idempotency key, bounded retries and fenced leases. A prepared dispatcher supports later unattended recovery. Receiving a proposal does not approve, publish or activate a service.

Existing wallet, identity, MCP, OAuth and financial permission contracts remain intact. This candidate does not add Tempo production support, Claude acceptance, payments or public provider enrollment.

Validation on application candidate `78dc9242680a5c4b00308a836d7167dcb6a0e7ed`:

- Regression: 1,083 passed, three opt-in cases skipped; lint and TypeScript passed.
- Separate native PostgreSQL acceptance passed using independent backends and a non-superuser role: atomic rollback, concurrent duplicates/claims, `SKIP LOCKED`, lease fencing and recovery in a new process.
- Local browser exercised the real form, route, outbox, worker, transport and review page with synthetic identities and provider responses. Recovery after application/database restart required no new submission; repeat dispatch processed no jobs.
- Local Next.js 16.2.6 production build passed with Node 24.14.0, database and mail disabled. Existing nested-worktree root inference warning is recorded. The ordinary CI workflow still uses npm 11.6.1; its final-head run is pending the agreed push.
- Earlier responsive and language evidence is linked to its original commits; physical devices, real administrator/Neon acceptance and unattended production scheduling remain explicit gates.

Production notices remain disabled and no scheduler is installed. The provider setup test confirmed one real mailbox delivery separately; it does not certify the hosted application flow. Evidence and SHA256 manifests stay in ignored local QA folders, without credentials or real contacts in the public repository.

Release controls: `main` requires a PR and strict `local-quality`, including admins; force-push and deletion are blocked. Vercel remains Standard/fixed with extra concurrency disabled and the non-main Git build filter intact. Main still builds automatically. Keep this PR draft until its final head, CI, hosted acceptance for the agreed scope, cost allowance and explicit publication decision are aligned. A release with notices disabled or manual recovery retains delivery/scheduling acceptance as pending and must not advertise those features.

[Release packet](../releases/landing-proposals-2026-10-13.md) records the current production rollback, open PRs, Tempo snapshot conflict, acceptance gates and limits. This text is a local draft; replace the publication head/check links with verified results after the separately authorized branch push.
