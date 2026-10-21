# Carmelita MVP — execution board

Updated: 2026-09-28. Coordinator: root (Scrum Master).
Base: bded469. Branch: codex/mvp-beta. Public beta is NOT accepted yet.

## Contract
Chat-first personal assistant. First useful journey: sign in, connect Notion, search notes and summarize supported pending work with sources, save an explicit preference, return and continue. Verified provider catalog only. No payments, reservations, arbitrary MCP URLs, funding or Mainnet. Incoming ChatGPT authorizations remain separate from outgoing provider connections.

## Roles
1 Product/acceptance; 2 UX/accessibility; 3 Identity/security; 4 Connections/MCP; 5 Chat/memory; 6 Data/multichain; 7 Platform/operations; 8 Independent QA/evidence. Root alone integrates and promotes. Maximum three specialists active. Roles rotate; a role assignment is not evidence of completed work.

## Sprint board
| Sprint | Owner roles | Dependency | Status | Exit evidence |
|---|---|---|---|---|
| 1 Publish onboarding | 6,7,8 | final candidate runtime verification | in progress | manual promotion, two-account chat acceptance, recovery |
| 2 MVP contract | 1,4,8 | current code audit | in progress | capability matrix, viable Notion authentication |
| 3 Chat-first UX | 2,5,8 | 2 | pending | mobile and keyboard walkthrough |
| 4 Notion connection | 3,4,8 | 2 | in progress: audit | real two-account search and revocation |
| 5 Useful daily task | 1,4,5 | 4 | pending | source-backed summary, no invented tasks |
| 6 Continuity | 3,5,6 | 5 | pending | reconnect and cross-account tests |
| 7 Verified catalog | 1,2,4 | 4 | pending | honest provider states and submission documentation |
| 8 Public readiness | 3,6,7 | security begins now | in progress: audit | durable quotas, redacted telemetry, support |
| 9 Pilot and opening | 1,7,8 | 1–8 | pending | five external users, four independent completions, zero critical defects |
| 10 Pitch | 1,2,8 | verified evidence | pending | three-minute demo, six-slide deck, actual results |

## Mandatory release gates
2 concurrent queries/account and 30 turns/account/day enforced server-side; IP limit supplements authentication. Two-account isolation, session expiry, insufficient permissions and revocation. Errors never become successful empty results. Credentials and provider content excluded from telemetry. Preview isolated; no migration without reviewed need, rehearsal and backup. Manual promotion with compatible rollback. No external acceptance marked passed by mocks.

## Current evidence

Este snapshot de migración conserva código para revisión. Los identificadores de infraestructura y la evidencia operativa de la ejecución original se omitieron. El estado del entorno y cualquier aceptación deben verificarse nuevamente contra el SHA y el entorno elegidos; este documento no acredita preparación actual para publicar.

## Acceptance ledger format
UTC | commit | deployment | environment | account alias (no email) | check | passed/failed/pending | evidence | next action.

## Launch narrative
Carmelita turns your services and preferences into a personal assistant you use through conversation. Arbitrary MCP onboarding and self-service enterprise publishing are roadmap, not launch claims. Seven-day retention is reported only after seven days.

## User steering — 2026-09-28
Primary delivery is Carmelita accessed from ChatGPT and subsequently other explicitly tested chat clients. Notion/Slack/calendar onboarding is optional future work, NOT a public-launch gate. Existing Notion hardening stays in this unpromoted branch for review. Do not claim Claude or Grok compatibility without actual acceptance. Next value-defining integration is the user's other application, still unspecified. First close production onboarding and ChatGPT acceptance; then rebaseline sprints4–7 against that application before implementation. Do not create Notion workspaces solely to satisfy the superseded launch gate.
