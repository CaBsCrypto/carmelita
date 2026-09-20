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
2. Redactar el JSON de evidencia con el commit HEAD de este repo (debe coincidir con `CARMELITA_RELEASE_COMMIT`), fingerprint, `verifiedAt` fresco y los IDs de la vía elegida.

### C.4 Apply

`db:migrate:production apply` con entorno en memoria. Guardas ya activos: árbol limpio, evidencia vigente, mantenimiento verificado (firewall completo o 503), inventorío de conflictos de billeteras en cero, identidad inmutable antes/después, `remainingStatements === 0`.

Aceptación: journal 22 entradas; `agent_wallet_networks` igual en contenido a `agent_wallets` (8 billeteras, cero duplicados por propietario/red); columnas de recuperación de 0021 presentes con defaults y CHECKs; pagos y eventos intactos; `status: PASS` archivado.

Ante cualquier error `production_migration_*`: mantener el bloqueo de mantenimiento, no repetir a ciegas, consultar estado real antes de reintentar.

### C.5 Cierre

Desactivar/quitar la regla o re-promover según la vía. Comprobar `/api/health` 200 y rutas vivas. Este runbook se actualiza con resultados y se conmuta el estado de avance.

## Fase D — publicación PR #28

Publicar multichain y administración; Bazaar sigue deshabilitado hasta aceptación independiente. Revisión de las cinco redes de prueba y WebMCP experimental quedan fuera de este tramo.

## Estado de avance

- [x] A.1 `npm run qa:local` verde (19/09: 606 pruebas, 604 pasan, 0 fallos, 2 omisiones justificadas; log `work/runbook-phaseA-qa-20260919.log`)
- [x] A.2 commit del WIP + runbook (`881670c`; graphify actualizado, grafo: 3067 nodos/7224 aristas)
- [x] B.1 lectura CLI solo-lectura del runtime de producción (19/09: alias canónico `carmelita-agent.vercel.app` → `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`, READY/target=production, commit base `e4b6d96` con `carmelitaManifestSha256` coincidente con el manifiesto local de la candidata. El runtime declara 161 variables incluyendo el par `DATABASE_URL_DATABASE_URL` + `DATABASE_URL_UNPOOLED`; cero claves `CARMELITA_PREVIEW_*`. **Writer antiguo vivo**: `dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG` (main, `dcbb20ef`, target=production, READY) atiende `agente-asistente-git-main-…vercel.app` y debe quedar cubierto por la regla de bloqueo. Salud viva de producción responde con forma antigua: sin `deployment`, `maintenance` ni `previewIsolation` ⇒ el modo 503 de aplicación NO validarían contra el build actual; el modo firewall es la única vía sin redesplegar.)
- [ ] B.2 par de conexiones consistente verificado (opción b en memoria) — **hallazgo 19/09**: la vía CLI está técnicamente cerrada. `DATABASE_URL_DATABASE_URL` y `DATABASE_URL_UNPOOLED` de producción son `type=sensitive`: Vercel no los devuelve en plaintext por ningún medio (API `env?decrypt=true` → `valueLen=0`; `env run --environment production` inyecta solo 78 claves, ninguna de ellas). Las aprobaciones humanas solo aplican a `type=encrypted` (45 claves, ninguna es este par). Además no existe `DATABASE_URL` plain en production: el runtime usa `DATABASE_URL_DATABASE_URL` como pooler, exactamente la cadena de fallback del ejecutor (`production-migrate.ts:23`). El fingerprint de QA ya consta (`bfd2efdf…` en `docs/preview-pr28-2026-09-08.md`); no hay ningún FINGERPRINT como variable en Vercel: ambos los aporta el operador. Las reparaciones de 0019 se ejecutaron con SQL preparado por scripts y aplicación humana vía consola Neon ⇒ vía práctica restante: el operador coloca las dos connection strings (o `work/production-db-connections.json`, modo 0600, `wx`, gitignored) desde app.neon.tech; el hostname esperado es `ep-bold-mud-0oztn5sq` (pooler = base+"-pooler", no-pooler = base+puerto .5432 según `.env.example`). Se verifica identidad y fingerprint sin imprimir contraseñas.
- [ ] B.3 fingerprint confirmado
- [ ] B.4 `inspect` PASS archivado
- [x] C.1 sonda firewall live (19-20/09, `work/probe-firewall-live-20260920.mts` y `-b.mts`): **forma de payload compatible** con los fixtures — `pagination.next` es `null` en deployment/aliases (el verificador lo maneja), claves `uid/url/state/target` y `alias/deploymentId/projectId` presentes, config con `active/draft/versions`, sin borrador pendiente. **Ya existe una regla activa publicada**: `rule_carmelita_legacy_production_maintenance_2026_09_14_AhgPgR` (deny, path neq /api/health, ~66 hosts legacy incluidos `git-main` y `oni0pf1s2`). **Escritores production READY no cubiertos por la regla**: `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA` (candidata bajo alias público, url `agente-asistente-6yzo3s49v-…`) y `dpl_EfnB5FAmqDaiLozZFMvwSWJ83Dtr` (candidata anterior superseded, url `agente-asistente-j7ehxot93-…`). ⇒ para C.4 la regla debe extenderse con `carmelita-agent.vercel.app`, `agente-asistente-6yzo3s49v-…` y `agente-asistente-j7ehxot93-…` (la exención /api/health ya está). Riesgo residuo a verificar en la ventana: los hosts bloqueados retirados deben responder 403 al sondeo del verificador. Decisión: **vía firewall confirmada** (el fallback 503 es inviable con el build actual, cuyo /api/health carece de `deployment`).
- [ ] C.2 mantenimiento acreditado
- [ ] C.3 respaldo + evidencia fresca
- [ ] C.4 apply PASS + journal 22
- [ ] C.5 reapertura comprobada
- [ ] D publicación PR #28
