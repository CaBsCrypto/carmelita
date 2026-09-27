# OAuth publication review — 2026-09-27

Agent 3 inspected the Vercel control plane read-only at 08:37:04 UTC. No deployment, configuration, firewall, database, branch or alias was modified.

## Verified state

- Project `agente-asistente`, `prj_UQnTOdi1AWU6soTr04ACsqNo7YDu`, team `team_XjolcoWJ9V9yamVnCdpC7EMY`.
- Production branch `main`; **autoAssignCustomDomains=true**. This is a release blocker until root disables and rereads it before merging.
- Project buildCommand is null; versioned `vercel.json` sets `npm run build` (`next build`), without migrations.
- Both public hosts still point to `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`, not the complete PR.
- PR commit `fd1a8073002eb00e82e48e4c13149c59e20bfa9e` has READY Preview `dpl_FVYdBTHdQLSrz3TaqSHp5AFALrwn`, immutable host `agente-asistente-j9b6dnwjc-cabscryptocontacto-6028s-projects.vercel.app`.
- Eleven READY deployments and 26 aliases were returned by fully paginated inventory. No building deployment was observed. Project cron definitions are empty.
- Firewall enabled; one valid active deny rule, no draft, changes or IP exceptions. Its 69 legacy hosts include the old OAuth alias. The exception is only `/api/health`.
- `.vercelignore` excludes work, environment files, keys, Bazaar, local caches and graph outputs.

Sanitized control-plane evidence: `work/oauth-delivery-inventory-20260927.json`. This inventory does not prove database isolation or HTTP blocking by itself.

## Exact maintenance delta

Keep all 69 current hosts. Add these six existing production writer hosts to the published deny rule:

1. `carmelita.browns.studio`
2. `carmelita-agent.vercel.app`
3. `agente-asistente.vercel.app`
4. `agente-asistente-cabscryptocontacto-6028s-projects.vercel.app`
5. `agente-asistente-6yzo3s49v-cabscryptocontacto-6028s-projects.vercel.app`
6. `agente-asistente-j7ehxot93-cabscryptocontacto-6028s-projects.vercel.app`

Refresh this delta immediately before maintenance. Every new production candidate is another writer: its immutable host and any newly moved/generated aliases must join maintenance before further database work. Nonblocked Preview deployments require the existing verifier's authenticated QA health/fingerprint checks; labels alone are insufficient.

Use the existing `verifyFirewallMaintenance` flow with published rule `rule_carmelita_legacy_production_maintenance_2026_09_14_AhgPgR`, current production `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA` and QA fingerprint. It checks published state, all paginated writers, blocked route HTTP responses and stable inventory/config. Keep 403/410 distinction for retired hosts. Never remove the entire legacy rule at reopening.

## Controlled candidate and promotion

1. Root sets and rereads `autoAssignCustomDomains=false` before merge. Capture current alias mapping and production environment metadata first.
2. Finish runtime database identity and recovery compatibility evidence; do not infer either from this inventory.
3. Under verified maintenance, backup and guarded migration proceed only with the existing evidence requirements. Capture after-state.
4. Merge the existing PR, resolve resulting main SHA, wait for its CI. Do not promote a branch SHA as the claimed main build.
5. Build a production-target candidate with Vercel CLI 58.9.4 `deploy --prod --skip-domain --yes`, using the exact reviewed checkout and existing project. CLI help documents delayed promotion, but historical evidence shows a general project alias moved despite `--skip-domain`; therefore reread ALL aliases immediately and maintain firewall protection around every production writer.
6. Inspect immutable candidate metadata: exact source SHA, production target, READY state, no QA variables, intended runtime connections/configuration, and effective build command. Do not export full environment values.
7. If Git integration already produced a matching READY production candidate with promotion disabled, reuse it instead of creating a second candidate.
8. Verify candidate under controlled maintenance; then `promote <verified-deployment-id>` under root supervision. Reread aliases rather than trusting deployment metadata's cached alias array.
9. Reopen only the selected new deployment/domain hosts. Keep all old immutable deployments and legacy aliases denied. Retain the prior public URL without global redirects.

Production maintenance must not be weakened simply to facilitate probes. Use authenticated Vercel deployment access where available; acceptance requiring public OAuth waits for controlled reopening.

## Recovery and gates

The old deployment is **not certified for rollback**: it does not maintain the new network-association table. Agent 2/root must name and verify a compatible recovery deployment before migration. On failure keep maintenance, turn off new flags and promote only that verified version; no destructive migration reversal.

Required open gates: effective database configuration proof; recovery deployment compatibility; final backup/restore evidence; automatic promotion disabled; guarded migrations; correct OAuth production configuration; actual two-account ChatGPT acceptance including revocation. No health-only success declaration.

Graphify query attempted and failed because its launcher points to unavailable Python 3.12. No code changed in this review; no claim of refreshed graph.

The 19 September runbook contains obsolete credential status and wording that suggests disabling/removing the whole rule. The approved current plan and this maintenance delta supersede those passages: preserve all legacy blocks.

## Exact commands prepared for root (not executed by agent)

Official PATCH contract verified 27 September: https://vercel.com/docs/rest-api/projects/update-an-existing-project (`/v9/projects/{idOrName}`, optional boolean `autoAssignCustomDomains`). CLI `api --help` confirms typed `-F` and `--silent`.

```powershell
$releaseCli = "$env:APPDATA/npm/node_modules/vercel/dist/index.js"
node $releaseCli api '/v9/projects/prj_UQnTOdi1AWU6soTr04ACsqNo7YDu?teamId=team_XjolcoWJ9V9yamVnCdpC7EMY' --method PATCH --field autoAssignCustomDomains=false --silent
```

Payload is exactly `{"autoAssignCustomDomains":false}`. Do not add `autoAssignCustomDomainsUpdatedBy` or other project settings. Reread the project through a JSON parser that prints only ID and this boolean; demand `false`. Do not print the full project response because it may include environment metadata/values. Then reread aliases to establish no promotion occurred.

Maintained candidate command from exact reviewed checkout:

```powershell
node $releaseCli deploy --prod --skip-domain --yes --project prj_UQnTOdi1AWU6soTr04ACsqNo7YDu --scope cabscryptocontacto-6028s-projects --env CARMELITA_MAINTENANCE_ENABLED=true --build-env CARMELITA_MAINTENANCE_ENABLED=true
```

The exact flag is `CARMELITA_MAINTENANCE_ENABLED=true`; `app/maintenance.ts` tests literal equality. `proxy.ts` returns 503 for application/API requests, allowing health, maintenance and static assets. Optional server-only `CARMELITA_MAINTENANCE_ACCESS_TOKEN` (minimum 32 characters) accepts header `x-carmelita-maintenance-access`, strips it before forwarding, and does not grant app authentication. Do not put such a token in command arguments, logs, URLs or browser storage. Without a token, perform only allowed health checks until an authenticated operator mechanism is safely prepared.

This candidate remains in application maintenance even if an alias is accidentally assigned. `npm run build` remains the versioned build command; no migrations added. Inspect `/api/health` for `maintenance=true`, exact commit and production environment, and demand 503 from `/agent` and unauthenticated app API routes before treating it as protective.

Important: Vercel deployment variables are immutable snapshots. Changing a project flag later does not reopen this candidate. For release, build a separate final candidate with maintenance false while edge maintenance remains published, verify its metadata and connections, promote it, and remove only approved new hosts from the edge rule. Keep the maintained candidate available as a protection step; it is not proof of a functioning rollback application. Newly generated deployment hosts must be added to the edge inventory.
