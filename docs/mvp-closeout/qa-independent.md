# Independent QA — A8

Recorded 2026-10-05 UTC. Result: the focused local automated checks pass; this is not acceptance of a deployed release, a mobile flow, or a second account.

## Version and limits of the evidence

- Worktree: `work/pilot-readiness`; base HEAD `df8116e4232305e210862830e5c38e3094ed4211`.
- The first run covered the committed tree. The second run included the uncommitted session-recovery changes from A7, the native financial-plan guards from root, and the new A8 test. Consequently, `df8116e` alone does not identify the second tested implementation.
- Tests used local fixtures, synthetic identities/tokens, fake providers, and query spies. This audit did not read private production data, operate a browser, exercise live OAuth, sign transactions, or move funds.
- A8 did not perform mobile UI, keyboard navigation, 200% zoom, a second account, or hosted Guionista acceptance. Root's later browser evidence is attributed separately below. Earlier QA on candidate `608bb84` does not transfer automatically to the final implementation.
- Root owns final integration, the final-SHA full tests/build, deployment fingerprints, and release acceptance.

## Checks executed

| Check | Time (UTC) | Result | Evidence |
| --- | --- | --- | --- |
| Initial focused suite, 21 files | 04:10:07–04:10:22 | 171 passed; 0 failed, cancelled, skipped | [Local log](../../../qa-independent-focused-20261005.log) |
| Integrated focused suite, 28 files | 04:13:30–04:13:42 | 223 passed; 0 failed, cancelled, skipped | [Local log](../../../qa-independent-integrated-20261005.log) |
| ESLint on A8's new test | After creating the test | Exit 0, `--max-warnings 0` | `tests/bazaar-native-plan-boundary.test.ts` |

The sandbox's `tsx` startup failed before the test runner with `uv_os_get_passwd returned ENOMEM` on Node 24.14.0. The same bounded test command was allowed through execution escalation and then passed. This was not a product/test assertion failure. No env file was loaded for the commands.

Integrated command:

```powershell
node node_modules/tsx/dist/cli.mjs --test --test-concurrency=4 --test-reporter=spec `
  tests/bazaar-native-plan-boundary.test.ts `
  tests/session-request.test.ts tests/session-recovery.test.ts `
  tests/chat-owner-session.test.ts tests/owner-travel-read.test.ts tests/session-close.test.ts `
  tests/personal-panel-parity.test.ts tests/public-commerce-boundary.test.ts `
  tests/commerce-catalog-read.test.ts tests/bazaar-catalog.test.ts tests/bazaar-contract.test.ts `
  tests/bazaar-native-channel-boundary.test.ts tests/oauth-consent-navigation.test.ts `
  tests/stytch-oauth-resource.test.ts tests/stytch-oauth-migration.test.ts `
  tests/stytch-connected-apps.test.ts tests/stytch-connected-app-revocation.test.ts `
  tests/stytch-preflight-contract.test.ts tests/stytch-public-error.test.ts `
  tests/mcp-gateway.test.ts tests/personal-mcp-token.test.ts tests/channel-parity-contract.test.ts `
  tests/personal-read-store.test.ts tests/personal-query-parity.test.ts `
  tests/query-history-presentation.test.ts tests/stellar-bazaar-connector.test.ts `
  tests/stellar-bazaar-route.test.ts tests/stellar-bazaar-chat.test.ts
```

## Findings and risk coverage

1. **Public commerce remains a catalog read.** `/api/mcp` advertises only `search_offers` and `get_offer`; retired intent/receipt calls do not reach storage. `/api/commerce` rejects POST before reading a body or invoking a backend. The route tests verify those boundaries with backend spies. Relevant files: `app/api/mcp/route.ts`, `app/api/commerce/route.ts`, `app/.well-known/mcp/route.ts`.
2. **Personal reads are authenticated and owner-scoped.** Authorization precedes schema parsing and provider access. `agent:read` does not grant conversation/context reads or payment execution. Private conversation queries select the authenticated owner and produce bounded projections. Existing tests cover owner isolation, scope rejection, revocation/introspection failures, and safe error output. Relevant files: `app/queries/types.ts`, `app/mcp/stytch-oauth.ts`, `app/api/mcp/agent/route.ts`, personal read-store/query modules.
3. **Bazaar data stays attributed and non-executable.** The adapter permits fixed read endpoints, rejects redirects, bounds response bodies/deadlines, and marks partial or unavailable catalogs explicitly. Suite aggregate status is a provider declaration rather than verified payment/delivery. Skills are untrusted metadata, not installation or execution. Unknown skill support has no hidden fallback. Native prepare/execute/status/history readiness remains closed. Relevant files: `app/connectors/bazaar-catalog.ts`, `app/bazaar/contract.ts`, `app/bazaar/readiness.ts`.
4. **The independent review added coverage for a financial-plan metadata gap.** The special Avalanche planning tool previously returned a raw capability/executable projection, and gateway planning could persist a financial preparatory plan. Root corrected those paths using `projectNativeAvalanchePlan` and `createNativeGatewayPlan`. The six new tests in `tests/bazaar-native-plan-boundary.test.ts` verify actual and future financial/cross capabilities, unsafe extra fields, all client requirements appearing satisfied, repeated attempts, zero injected `createPlan`/provider/store calls, unknown-capability propagation, and unchanged read-plan behavior. Financial/cross plans now return a closed capability, no executable plan, and the compatibility blocker. This does not assert that every non-financial planning tool is a pure read: the existing off-chain `prepare` capability retains its backend-blocked plan behavior.
5. **OAuth navigation and session recovery fail closed locally.** Consent callbacks must match the validated origin/path/state and contain a single outcome; token/fetch/body work is bounded; owner changes abort and ignore late responses. The decision latch prevents automatic consent resubmission after uncertainty. A7's shared session helper covers SDK/fetch/body/refresh promises that ignore cancellation, using 15 seconds for conversation reads, 30 seconds for chat, and 20 seconds for bootstrap/workspace/travel. Draft clearing occurs only after a valid successful response and preserves edits made while sending. These are code and automated-test findings, not evidence of a live consent round trip or rendered retry UI.
6. **Landing/onboarding promises are bounded in source.** The CTA opens `/connect-chatgpt`, whose guide describes manual connection and account/workspace availability. Catalog discovery remains separate from execution, payment, and a new Guionista listing being accepted. The public MCP URL in the guide is production; testing a preview requires selecting that preview resource explicitly. Relevant files: `app/home-experience.tsx`, `app/connect-chatgpt/page.tsx`, `app/services/page.tsx`.

## Browser evidence reported by root

Root subsequently reported these checks in the internal browser at localhost, with source HEAD `df8116e` and the local UI changes present. A8 did not operate that browser or independently inspect the captures. Final-SHA reconfirmation remains pending.

| Reported check | Result | Root's capture |
| --- | --- | --- |
| Spanish landing at 320 px; Tab to primary CTA and Enter | No horizontal overflow; navigated to `/connect-chatgpt` | [Landing](../../../mvp-closeout-20261005/landing-320-keyboard.jpg) |
| Connection guide at 320 px; copy MCP URL | Content width 305 / viewport 320; feedback `URL copiada` | [Guide](../../../mvp-closeout-20261005/guide-320-copy.jpg) |
| Services at 320 px; details expanded, Space to collapse | Two services, two suites, skills unavailable; content width 305 / viewport 320 | [Catalog](../../../mvp-closeout-20261005/catalog-320-inputs.jpg) |
| Desktop landing at 1280 px | Rendered; viewport reset after checks | [Desktop](../../../mvp-closeout-20261005/landing-desktop.jpg) |

Root explicitly did not credit 200% zoom: attempted shortcuts produced no measured change (DPR 1, width 1280). Mobile and a genuinely different account remain human gates.

## Post-run fingerprints

SHA-256 fingerprints were captured at approximately 04:16 UTC, after the integrated run, to identify the local files reviewed. They are not a substitute for rerunning the required checks on the final committed SHA.

| File | SHA-256 |
| --- | --- |
| `app/agent/agent-chat.tsx` | `0fe12d067270a941bbba85b98e166daf6f56634132f64007618782e3901ccdd7` |
| `app/agent/agent-onboarding.tsx` | `4376ee5891def8468c1696e40c7db974411c58add55a79baa9b4814dd06a1858` |
| `app/agent/chat-request.ts` | `c622e0b1b303afaadfb626b781090c422365f3bd0299869e85ac726de3c00e16` |
| `app/agent/travel-search-request.ts` | `08f511d10fce30b0157800a06b52bc66c28f52a5eeb01c8029816d149b22f06d` |
| `app/agent/workspace-queries.ts` | `6c707610bd3b3fba8a4e4a5193b9e376ff9efc6f5303f70a3fac5a6083b2aaef` |
| `app/agent/session-request.ts` | `89d27a9d9f6efda9916b63fe330daeb65d1eeaf1057845e162ce54d8353d297e` |
| `app/api/mcp/agent/route.ts` | `3511f1d53145b0e14ac0b0f4e1df2504fc891722cd884761518812429289cf31` |
| `app/bazaar/native-channel-boundary.ts` | `825d7a0fdd8e654bb4e1f4fdab90a24322b84f86cbdc8ecf5872c9391c25a7c3` |
| `tests/chat-owner-session.test.ts` | `ceffe5b9ec1c1c4d90a23f8b27c5dfedc23b6a70936bc9f8c8bda241566152de` |
| `tests/owner-travel-read.test.ts` | `3bac1486f539f56c0757b159111b9773c00987066814215337bc97499db76b33` |
| `tests/session-request.test.ts` | `475ab2516b8dcaaf50dcddd420ab16e06a34d6f1064ef4ce81ceb172ed0540b1` |
| `tests/session-recovery.test.ts` | `419ca7f13b7a7b1c2d5001a2b13fae60b6469bf980bcee779a1e39b4b324bf3d` |
| `tests/bazaar-native-plan-boundary.test.ts` | `92bc510bb6d09fa9cfb52099f9627b0985c3079ce946fe776de1034d3f218fde` |
| Initial focused log | `ef7c9dc458be4461bcade1c905c9898de12aba4657631dc64322ed83de597e91` |
| Integrated focused log | `e0338d4b33852f5e5f37e2638ebe246cf2137a47901210b013d0479aa1e36049` |

## Outstanding release gates

- Root must bind integrated files to a final commit and complete the required lint/types/full test/build checks for that SHA, then validate preview isolation and deployed resource/issuer/version fingerprints before any production decision.
- Human acceptance must exercise initial onboarding and connection with a genuinely distinct second account, then the mobile ChatGPT flow with the intended connector selected. Validate owner-specific wallets/catalog responses, rejection of private history without its scope, appropriate OAuth consent/revocation, and safe handling of an expired/revoked session. Do not reuse the successful first account as evidence of second-account isolation.
- Root's reported 320 px/keyboard/desktop checks are separate local evidence above. Reconfirm them on the final SHA; 200% zoom remains unverified. A8 did not execute browser checks.
- A new Guionista hosted listing/acceptance, native financial compatibility, and actual purchase/execution are not passed by catalog tests. Native financial operations remain disabled; neither testnet labeling nor provider availability clears that gate.
- Graphify was queried before source inspection. An AST refresh launched before root's centralization message was interrupted immediately (exit 1 after extraction); root owns the complete refresh after integrating new tracked files. Untracked files are intentionally excluded by the repository wrapper.

A8 changed only its new risk test and this document; product fixes belong to root/A7. No commit, push, merge, deployment, configuration change, or private production query was performed by A8.
