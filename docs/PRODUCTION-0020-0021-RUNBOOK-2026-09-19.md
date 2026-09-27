# Runbook: aplicar 0020 y 0021 y publicar PR #28 — 19 de septiembre de 2026

Referencia de partida: `6eae1e4` (reparación Stellar y reconciliación de 0019 aplicadas y aceptadas; producción corre la candidata compatible). Evidencia de reparación vigente: [PRODUCTION-REPAIR-APPLIED-2026-09-14.md](PRODUCTION-REPAIR-APPLIED-2026-09-14.md).

Este documento es el único plan operativo vigente. Si una sesión se interrumpe, se reanuda desde el primer paso no marcado como cerrado en la sección "Estado de avance".

## Decisiones acordadas (19 de septiembre)

1. **Conexiones del ejecutor: opción (b).** El par `DATABASE_URL` (pooler) y `DATABASE_URL_UNPOOLED` (no-pooler) se inyecta solo en memoria de la sesión del ejecutor, tomado del runtime real de producción vía CLI autenticada de solo-lectura. No se escriben secrets nuevos en producción. La garantía es equivalente porque `CARMELITA_PRODUCTION_DATABASE_FINGERPRINT` ata el endpoint esperado y `productionMigrationConfig` rechaza discrepancias de identidad, usuario o clave entre ambas URLs.
2. **Mantenimiento: firewall como vía principal, 503 de aplicación como fallback.** Se elige en el paso C.1 según la sonda live. El modo firewall evita desplegar un build de mantenimiento y re-promover después, y bloquea en el borde a todos los escritores (despliegues y aliases), que es la lección del duplicado Stellar.
3. **Bazaar permanece deshabilitado** hasta aceptación independiente. Sin pagos, sin financiación, sin trustlines, sin claves Privy, sin escribir configuración de producción durante C salvo la regla de mantenimiento acordada.

## Hallazgos del análisis previo a ejecutar

- No existe generador automatizado de `CARMELITA_RELEASE_EVIDENCE_FILE`. La evidencia es JSON manual con ventana de validez de una hora (`verifiedAt`): `databaseFingerprint`, `commit`, `maintenanceCommit`, `backupId`, `restoreVerified: true`, `rollbackCompatible: true` y, en modo firewall, `maintenanceMode: "firewall"` con `firewallRuleId` (`rule_...`) y `maintenanceDeploymentId` (`dpl_...`).
- Requisito duro del ejecutor: si el runtime de producción no expone el par pooler+no-pooler consistente, `productionMigrationConfig` falla con `production_migration_connections_disagree`; por eso la Fase B es el camino crítico.
- El modo firewall solo se verificó contra fixtures. Antes de confiar en él se contrasta la forma real de `/v9 o /v1 security/firewall/config`, `/v6/deployments` y `/v4/aliases` (inventarios previos en `work/` sugieren compatibilidad pero no la acreditan).
- Confirmado a favor: `identitySnapshot` no lee columnas tocadas por los UPDATE de 0021; 0020 es aditivo sobre un `agent_wallets` que ya tiene `network`; `inspect` no exige árbol limpio; el bloqueo serializable con advisory lock y snapshot de journal ya está probado en QA.

## Fase A — validar y commitear el modo firewall (local)

Comandos:

1. `npm run qa:local` (lint `--max-warnings 0`, `tsx --test tests/*.test.ts`, `next build`).
2. Esperado: 606 pruebas, 604 aprobadas, cero fallos, dos omisiones externas justificadas (ver `work/multichain-release-quality.log`).
3. Commit del WIP actual: `scripts/production-firewall.ts`, su test, cambios en `scripts/production-migrate.ts`, su test y `docs/PRODUCTION-ACTIVATION-2026-09-14.md`, más este runbook.

Criterio de avance: verde completo y commit creado. El commit es necesario además porque `apply` rechaza checkout sucio (`production_migration_dirty_checkout`).

Nota Graphify: el lanzador Python 3.12 sigue roto; `graphify update .` queda pendiente y no bloquea nada.

## Fase B — desbloquear conexiones e `inspect` en verde (solo-lectura)

1. Con CLI de Vercel autenticada (`CARMELITA_VERCEL_CLI_PATH`), leer solo:
   - despliegue de producción actual y su mapeo de alias (`/v6/deployments`, `/v4/aliases` con `projectId`/`teamId`);
   - variables de entorno del runtime de producción: comprobar presencia y forma de `DATABASE_URL` y `DATABASE_URL_UNPOOLED` (nunca volcar el set completo a disco; si la comparación lo exige, guardar únicamente las dos conexiones en `work/`, ignorado por Git, como en QA).
2. Si el par no está o discrepa: detener aquí y reabrir decisión (a) vs (b) — no improvisar escritura de secrets.
3. Verificar el fingerprint: `sha256(hostname minus -pooler + pathname)` del runtime debe coincidir con `CARMELITA_PRODUCTION_DATABASE_FINGERPRINT` y diferir del de QA.
4. Ejecutar `db:migrate:production inspect` con el entorno en memoria. Salida esperada: `status: PASS`, `journalBefore: 20`, `journalAfter: 20`, `pendingStatementsBefore > 0`, `remainingStatements > 0` (0020+0021 pendientes), identidades sin cambio.

Criterio de avance: JSON de inspect archivado en `work/` (nombre con fecha). Si `inspect` no pasa, la Fase C no comienza.

## Fase C — mantenimiento, evidencia y apply (sesión continua)

### C.1 Sonda firewall live (determina la vía)

Ejecutar solo-lectura de `firewallDependencies(cliPath).read(...)` sobre config firewall, despliegues y aliases, y comparar claves con los fixtures de `tests/production-firewall.test.ts` (`pagination.next` numérico, `active.rules[].conditionGroup`, `deployment.url`, `alias.deploymentId`). Discrepancia de forma ⇒ fallback 503 de aplicación.

### C.2 Mantenimiento

- Vía firewall: publicar y activar la regla exacta (hosts de producción incluidos, `path neq /api/health`, deny, sin excepciones de IP/cambios, sin borrador pendiente). El borrador en `work/reopen-firewall-draft.log` sigue deshabilitado y no acredita nada. **La publicación requiere aprobación explícita del operador en el momento.**
- Vía 503: desplegar el build de mantenimiento y verificar `health.maintenance === true` con `gitCommitSha === maintenanceCommit`.

### C.3 Respaldo y evidencia (ventana de 1 hora hasta `apply`)

1. Respaldo Neon nuevo, restauración en entorno separado verificada, comprobación de roll-forward/rollback compatible.
2. Redactar el JSON de evidencia con el commit HEAD de este repo (debe coincidir con `CARMELITA_RELEASE_COMMIT`), fingerprint, `verifiedAt` fresco y los IDs de la vía elegida. Desde el 20/09 existe generador validado: `scripts/production-release-evidence.ts` (round-trip garantizado contra `validateReleaseEvidence`, salida obligatoria bajo `work/`, modo 0600):

   `npx tsx scripts/production-release-evidence.ts --mode=firewall --rule=<rule_…> --deployment=<dpl_…> --backup=<id> --maintenance-commit=<sha40> --restore-verified=true --rollback-compatible=true --out=work/release-evidence-<fecha>.json`

   con `CARMELITA_PRODUCTION_DATABASE_FINGERPRINT` solo en memoria. `--commit` por defecto es `git rev-parse HEAD`.

### C.4 Apply

`db:migrate:production apply` con entorno en memoria. Guardas ya activos: árbol limpio, evidencia vigente, mantenimiento verificado (firewall completo o 503), inventorío de conflictos de billeteras en cero, identidad inmutable antes/después, `remainingStatements === 0`.

Aceptación: journal 22 entradas; `agent_wallet_networks` igual en contenido a `agent_wallets` (8 billeteras, cero duplicados por propietario/red); columnas de recuperación de 0021 presentes con defaults y CHECKs; pagos y eventos intactos; `status: PASS` archivado.

Ante cualquier error `production_migration_*`: mantener el bloqueo de mantenimiento, no repetir a ciegas, consultar estado real antes de reintentar.

### C.5 Cierre

Desactivar/quitar la regla o re-promover según la vía. Comprobar `/api/health` 200 y rutas vivas. Este runbook se actualiza con resultados y se conmuta el estado de avance.

## Fase D — publicación PR #28

Publicar multichain y administración; Bazaar sigue deshabilitado hasta aceptación independiente. Revisión de las cinco redes de prueba y WebMCP experimental quedan fuera de este tramo.

## Handoff para el día siguiente (estado al cierre del 20/09)

Todo está verificado salvo las credenciales (único paso humano). Piezas listas y probadas: ejecutor con guardas (tests), verificador firewall con los tres primitivos probados en vivo (`read` API ✓, sondas HTTP ✓, `readQaHealth` sobre `dpl_yvpkck` ✓ aislamiento verificado con fingerprint QA `bfd2efdf…`), generador de evidencia ✓, PR #28 con head remoto `91f542a` y CI verde sobre `44383db`. IDs y datos fijos para la ventana: proyecto `prj_UQnTOdi1AWU6soTr04ACsqNo7YDu`, equipo `team_XjolcoWJ9V9yamVnCdpC7EMY`, CLI `C:\Users\MGC\AppData\Roaming\npm\node_modules\vercel\dist\index.js`, regla vigente `rule_carmelita_legacy_production_maintenance_2026_09_14_AhgPgR`, candidata `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA` (url `agente-asistente-6yzo3s49v-…`), superseded `dpl_EfnB5FAmqDaiLozZFMvwSWJ83Dtr` (url `agente-asistente-j7ehxot93-…`, responde 503 propio), QA fingerprint `bfd2efdf0f2fec5299c643ab9ef012c2648d8baa2d83297ff3f924b6bd123299`.

### Secuencia de mañana

**Paso H1 (humano, ~3 min):** app.neon.tech → proyecto con rama `br-patient-block-atq0m38n` → copiar pooled y direct → crear `work\production-db-connections.json`:
`{"DATABASE_URL_DATABASE_URL":"<pooled>","DATABASE_URL_UNPOOLED":"<direct>"}` (gitignored; nunca pegar credenciales en el chat).

**Paso B2-B4 (asistente):** verificar par en memoria sin imprimir credenciales:

```powershell
node -e "const{createHash}=require('crypto');const c=require('./work/production-db-connections.json');const id=v=>{const u=new URL(v);return u.hostname.toLowerCase().replace(/-pooler(?=\.)/,'')+u.pathname};const a=id(c.DATABASE_URL_DATABASE_URL),b=id(c.DATABASE_URL_UNPOOLED);const A=new URL(c.DATABASE_URL_DATABASE_URL),B=new URL(c.DATABASE_URL_UNPOOLED);console.log(JSON.stringify({sameDatabase:a===b,sameUser:A.username===B.username,samePassword:A.password===B.password,fingerprint:createHash('sha256').update(a).digest('hex')}))"
```

Luego `CARMELITA_PRODUCTION_DATABASE_FINGERPRINT` = ese fingerprint, y:

```powershell
$c = Get-Content work/production-db-connections.json -Raw | ConvertFrom-Json
$env:DATABASE_URL_DATABASE_URL=$c.DATABASE_URL_DATABASE_URL; $env:DATABASE_URL_UNPOOLED=$c.DATABASE_URL_UNPOOLED
$env:VERCEL_ENV="production"; $env:CARMELITA_RELEASE_COMMIT=(git rev-parse HEAD).Trim()
$env:CARMELITA_PRODUCTION_DATABASE_FINGERPRINT="<del paso anterior>"
$env:CARMELITA_QA_DATABASE_FINGERPRINT="bfd2efdf0f2fec5299c643ab9ef012c2648d8baa2d83297ff3f924b6bd123299"
npx tsx scripts/production-migrate.ts inspect   # esperar status PASS, journalBefore 20, remaining > 0
Remove-Item Env:DATABASE_URL_DATABASE_URL,Env:DATABASE_URL_UNPOOLED,Env:CARMELITA_PRODUCTION_DATABASE_FINGERPRINT
```

Archivar el JSON de inspect en `work/`. Antes de `apply` hay que quitar las 3 claves sensibles del proceso shell si la sesión se comparte.

**Ventana C (~20-30 min, con aprobación explícita por paso de escritura):**
1. Extender la regla (Vercel dashboard → Firewall, o API): añadir hosts `carmelita-agent.vercel.app`, `agente-asistente-6yzo3s49v-cabscryptocontacto-6028s-projects.vercel.app`, `agente-asistente-j7ehxot93-cabscryptocontacto-6028s-projects.vercel.app` (mismos host inc + path neq /api/health, deny). Verificar sondas 403 y `/api/health` 200.
2. Neon: crear rama/backup de `br-patient-block-atq0m38n` (como el `br-proud-sun-attzb8b7` de 0019), consultarla y contrastar conteos/huellas de billeteras y pagos (huellas de referencia 14/09: billeteras `1e4b8847…`, pagos `0a69e512…` — deben haber cambiado solo por filas nuevas desde entonces; lo que se exige es conservacionismo, no igualdad).
3. Evidencia (ventana 1 h): `npx tsx scripts/production-release-evidence.ts --mode=firewall --rule=rule_carmelita_legacy_production_maintenance_2026_09_14_AhgPgR --deployment=dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA --backup=<id> --restore-verified=true --rollback-compatible=true --out=work/release-evidence-<fecha>.json` (con fingerprint en env).
4. `npx tsx scripts/production-migrate.ts apply` con `CARMELITA_RELEASE_EVIDENCE_FILE` apuntando al archivo. Cualquier `production_migration_*`: NO repetir, mantener el bloqueo, inspeccionar el journal antes de reintentar.
5. Aceptar: journal 22; `agent_wallet_networks` consistente con `agent_wallets` (8 filas, cero duplicados); columnas 0021 con defaults/CHECKs. Quitar los 3 hosts nuevos de la regla (dejar la legacy como estaba). Health 200 + rutas vivas.
6. Registrar resultados aquí y en `PRODUCTION-ACTIVATION-2026-09-14.md`; luego Fase D (merge controlado multichain+admin, Bazaar off) en sesión aparte.

## Estado de avance

- [x] A.1 `npm run qa:local` verde (19/09: 606 pruebas, 604 pasan, 0 fallos, 2 omisiones justificadas; log `work/runbook-phaseA-qa-20260919.log`)
- [x] A.2 commit del WIP + runbook (`881670c`; graphify actualizado, grafo: 3067 nodos/7224 aristas)
- [x] B.1 lectura CLI solo-lectura del runtime de producción (19/09: alias canónico `carmelita-agent.vercel.app` → `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`, READY/target=production, commit base `e4b6d96` con `carmelitaManifestSha256` coincidente con el manifiesto local de la candidata. El runtime declara 161 variables incluyendo el par `DATABASE_URL_DATABASE_URL` + `DATABASE_URL_UNPOOLED`; cero claves `CARMELITA_PREVIEW_*`. **Writer antiguo vivo**: `dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG` (main, `dcbb20ef`, target=production, READY) atiende `agente-asistente-git-main-…vercel.app` y debe quedar cubierto por la regla de bloqueo. Salud viva de producción responde con forma antigua: sin `deployment`, `maintenance` ni `previewIsolation` ⇒ el modo 503 de aplicación NO validarían contra el build actual; el modo firewall es la única vía sin redesplegar.)
- [ ] B.2 par de conexiones consistente verificado (opción b en memoria) — **hallazgo 19-20/09, vías CLI agotadas**: `DATABASE_URL_DATABASE_URL` y `DATABASE_URL_UNPOOLED` de producción son `type=sensitive`. Ninguna vía las recupera: API `env?decrypt=true` → `valueLen=0`; `env run --environment production` no las inyecta; `vercel env pull --environment production` las escribe literalmente como `"[SENSITIVE]"` (comprobado 20/09; el archivo temporario se borró); `env pull --id` solo sirve en despliegues INITIALIZING, no en READY. Las aprobaciones humanas solo aplican a `type=encrypted`. Ninguna variable de conexión existe en `.env.local` (solo `VERCEL_OIDC_TOKEN`) ni en disco bajo el repo. **No hay vía automatizada restante**: el operador copia las dos connection strings desde app.neon.tech y crea `work/production-db-connections.json` (gitignored, 0600) con las claves exactas `"DATABASE_URL_DATABASE_URL"` (pooler) y `"DATABASE_URL_UNPOOLED"` (directa). Pista de identificación verificada en el repo: el proyecto de producción es el que contiene la rama Neon `br-patient-block-atq0m38n` (produción) con hija de respaldo `br-proud-sun-attzb8b7` y rama `carmelita-pre-repair-20260914` (evidencia 14/09). NO es el proyecto QA (endpoints `ep-bold-bar-avy0fdpj`). Ningún host de producción consta en el repo (el nombre `ep-bold-mud-…` no estaba verificado y queda retirado); la desambiguación real la hace el fingerprint: si el operador copia del proyecto equivocado, el chequeo B.3 falla y se detiene antes de tocar nada. Luego el asistente verifica identidad/fingerprint sin imprimir credenciales y ejecuta inspect. Las reparaciones de 0019 acreditaron además la vía alternativa de aplicación humana por el editor SQL de Neon con SQL preparado por scripts del repo.
- [ ] B.3 fingerprint confirmado
- [ ] B.4 `inspect` PASS archivado
- [x] C.1 sonda firewall live (19-20/09, `work/probe-firewall-live-20260920.mts` y `-b.mts`): **forma de payload compatible** con los fixtures — `pagination.next` es `null` en deployment/aliases (el verificador lo maneja), claves `uid/url/state/target` y `alias/deploymentId/projectId` presentes, config con `active/draft/versions`, sin borrador pendiente. **Ya existe una regla activa publicada**: `rule_carmelita_legacy_production_maintenance_2026_09_14_AhgPgR` (deny, path neq /api/health, ~66 hosts legacy incluidos `git-main` y `oni0pf1s2`). **Escritores production READY no cubiertos por la regla**: `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA` (candidata bajo alias público, url `agente-asistente-6yzo3s49v-…`) y `dpl_EfnB5FAmqDaiLozZFMvwSWJ83Dtr` (candidata anterior superseded, url `agente-asistente-j7ehxot93-…`, que además responde 503 de aplicación por su propia cuenta). ⇒ para C.4 la regla debe extenderse con `carmelita-agent.vercel.app`, `agente-asistente-6yzo3s49v-…` y `agente-asistente-j7ehxot93-…` (la exención /api/health ya está). **Sonda de estados (20/09)**: hosts retirados de la regla responden **410 Gone**, no 403 ⇒ el verificador fue parchado el 20/09 para exigir 403 solo en hosts con respaldo vivo (despliegue READY o alias a él) y aceptar 403/410 en retirados/orfenes; alias huérfanos se prueban igual. Tests nuevos en verde. Decisión: **vía firewall confirmada** (el fallback 503 es inviable con el build actual, cuyo /api/health carece de `deployment`).
- [x] Generador de evidencia creado y testeado (20/09: `scripts/production-release-evidence.ts` + `tests/production-release-evidence.test.ts`; hallazgo #1 cerrado).
- [ ] C.2 mantenimiento acreditado — **preparado**: la regla vigente debe extenderse con los 3 hosts descubiertos en C.1 (escritura en el borde, con aprobación explícita en la ventana). El ensayo de 0019 acreditó la vía de aplicación humana por consola/editor Neon; queda documentada como respaldo operativo.
- [ ] C.3 respaldo + evidencia fresca
- [ ] C.4 apply PASS + journal 22
- [ ] C.5 reapertura comprobada
- [x] Push de `881670c`/`c2d6292`/`44383db` a PR #28 (20/09: head remoto `44383db`, `local-quality` y Vercel preview verdes).
- [ ] D publicación PR #28 (merge controlado tras el apply: multichain+admin, Bazaar deshabilitado) Falta el tramo D de merge/publicación controlada.
