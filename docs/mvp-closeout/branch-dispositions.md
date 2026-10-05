# Disposición de ramas y preservación del trabajo

Verificación del 5 de octubre de 2026. Repositorio: [CaBsCrypto/carmelita](https://github.com/CaBsCrypto/carmelita). La consulta de GitHub confirmó nueve PR abiertos y 36 ramas remotas, con los mismos SHA que las referencias locales inspeccionadas. Este documento registra las condiciones de cierre; no afirma que esos cierres o la publicación ya ocurrieron.

## Base de integración y respaldo

- `origin/main`: `7edcb1890a76a7dfcf9f3eb4da50615807a951be`, integración de PR42. La rama local `main` está atrasada y no fue usada como base de comparación.
- Candidata PR46: `608bb84218be9834607aa414736fac98202520a5`, 21 commits propios frente a main. Los cambios de este cierre requerirán aceptación sobre su nuevo SHA; la evidencia histórica de `608bb84` no certifica automáticamente un commit posterior.
- Worker local: HEAD `bded46951ebf9ae104636d69692247bd9e3c3b15`; 29 archivos pendientes preservados mediante copia exacta, con SHA-256 de origen y destino: 11 modificados y 18 nuevos, 136.843 bytes. Respaldo privado ignorado por Git: `work/mvp-closeout-20261005/worker-backup/manifest.json`. Huella del manifiesto: `036b2cb81d009b3efcff8389eb49ab3426e1744fa7c3cb1850915058daeecf79`.
- Navegación OAuth: cuatro archivos pendientes encontrados en `work/oauth-consent-navigation`, pese a que su HEAD ya es ancestro de main. Preservados por separado: dos modificados y dos nuevos, 14.241 bytes. Manifiesto privado: `work/mvp-closeout-20261005/oauth-navigation-backup/manifest.json`; SHA-256 `96750d1a2090aeed4b0e5d5d8e7f3e0e48e1acae351a98fef81786c881180846`.
- Ambos respaldos verificaron todos los hashes, estado Git e índice sin cambios. Se copiaron solamente las rutas aprobadas de código, pruebas, esquema y configuración; no archivos `.env` o credenciales. La revisión de patrones de credenciales de alta confianza no produjo coincidencias. Esto es una comprobación limitada, no una auditoría exhaustiva de secretos.
- El inventario privado de los 18 worktrees, referencias y nombres de evidencia está en `work/mvp-closeout-20261005/branch-worktree-inventory.json`. El worktree `mvp-beta` está limpio; no se alteró configuración global de Git para inspeccionarlo.

## Nueve PR: disposición y condición de cierre

| PR / head | Evidencia y trabajo útil | Condición y disposición |
|---|---|---|
| [46](https://github.com/CaBsCrypto/carmelita/pull/46) · `608bb84` | Candidata consolidada; resolución de mercado, billeteras, fuentes y presentación ES/EN/PT. Draft, mergeable. | Integrar únicamente la candidata final con pruebas, aceptación y configuración productiva. Actualizar la descripción para reflejar el cierre completo y los bloqueos externos. |
| [43](https://github.com/CaBsCrypto/carmelita/pull/43) · `feeb797` | `git cherry` contra PR46 marca todo su parche con `-`, ya equivalente en la candidata. | Cerrar como incorporada después de verificar la integración de la candidata; conservar referencia al commit integrado. |
| [44](https://github.com/CaBsCrypto/carmelita/pull/44) · `70bf2a8` | Base PR43; ambos parches propios `022a41a` y `70bf2a8` son equivalentes en PR46. | Igual que PR43. No fusionar otra vez encima de la consolidación. |
| [45](https://github.com/CaBsCrypto/carmelita/pull/45) · `385f487` | Base PR43; presentación multilingüe y fuentes, parche equivalente en PR46. | Cerrar como incorporada tras integración verificada. |
| [35](https://github.com/CaBsCrypto/carmelita/pull/35) · `55075e9` | Seis commits históricos de chat principal, paneles, ingreso y permisos cerrados; el objetivo se implementó mediante PR42. La base actual incluye gating de bootstrap, borrador, paneles y controles de foco. No es equivalente por ancestry o parche y el PR tiene conflictos. | Cerrar como sustituida tras comprobar que el recorrido actual conserva esas funciones. No importar el diseño histórico ni revertir consultas multired. |
| [36](https://github.com/CaBsCrypto/carmelita/pull/36) · `fd3d2bb` | Base PR35. El mercado multired se incorporó mediante PR38–41; fuentes seguras están en PR46. Queda útil el último commit: token/cuerpo/refresh cancelables, plazo completo y reintento explícito de conversación. | Adaptar esa recuperación sobre la candidata actual, probar interrupción/propietario tardío/borrador y cerrar como sustituida después. No fusionar toda la rama antigua. |
| [37](https://github.com/CaBsCrypto/carmelita/pull/37) · `0798aea` | Cuatro commits sobre PR36; 19 archivos. El documento de la propia rama registra precisión **failed / experimental**, Spanish→English reportado por el usuario y omisión de palabras en el fixture largo. | Cerrar como aplazada, conservar la rama y registrar backlog VOICE. Las pruebas de unidad no acreditan precisión en teléfono real. |
| [34](https://github.com/CaBsCrypto/carmelita/pull/34) · `5974349` | Un commit, ocho archivos. Ocho descriptores direccionales Testnet; todos `executionEnabled:false` y `acceptedOnchain:false`. Ejecutores inversos/Base/Solana y SQL/reinicio pendientes; BNB bloqueada. PR con conflictos. | Cerrar como aplazada, conservar rama y backlog BRIDGE. No presentar descriptores como puente operativo ni condicionar el MVP de catálogo a esta preparación. |
| [22](https://github.com/CaBsCrypto/carmelita/pull/22) · `13f906d` | Problema original resuelto por otra implementación en main: `settlement.ts` exige `receiptVerifier.verify` antes de registrar; el verificador valida red, hash/estado de recibo y transferencia exacta de token/pagador/destinatario/importe, con cuarentena si falta prueba. El lector espera minería acotada. PR con conflictos. | Cerrar como sustituida tras prueba enfocada del verificador actual. Rescatar casos de regresión útiles, no la implementación antigua ni su interfaz `deps.chain`. |

El coordinador añadió las regresiones de destinatario incorrecto, pagador incorrecto, contrato token diferente, transferencia correcta entre logs ajenos y hash de otra transacción al verificador actual. `node --import tsx --test tests/avalanche-merchant-receipt.test.ts`: 6/6 pruebas pasan. La cobertura previa incluye red incorrecta, revertido, importe corto, logs eliminados/duplicados y cuarentena antes de entrega. Estas pruebas son locales; no realizaron pagos.

## Otras ramas remotas

| Rama / head | Resultado |
|---|---|
| `feat/mcp-stage-a-hardening` · `cd01bc6` | Preservar; no fusionar completa. El objetivo ArcusX ya está superado y el replay script fue retirado deliberadamente. Las mitigaciones de MCP/comercio genéricos deben adaptarse o aislarse en este cierre; su `actorId` aportado por cliente no sustituye identidad autenticada y la antigua migración `0015` no es reutilizable. El MCP personal conserva controles distintos. |
| `feat/avalanche-x402-merchant-sdk` · `49c5f8b` | Funcionalidad incorporada mediante `a08ae50`. `git cherry` sigue mostrando `+`, por lo que no se confundirá equivalencia funcional con ancestry. Preservar comparación antes de limpiar. |
| `fix/apify-connection-claim` · `248e6c3` | `git cherry origin/main` devuelve `-`: parche equivalente incorporado mediante `9df3959`. Clasificar como incorporada. |

Veintitrés ramas de trabajo son ancestros completos de main, con cero commits exclusivos: `codex/channel-parity`, `codex/channel-parity-foundation`, `codex/channel-parity-personal`, `codex/mcp-market`, `codex/multichain-onboarding`, `codex/oauth-client-identity`, `codex/oauth-introspection-contract`, `codex/oauth-rejection-diagnostics`, `codex/tester-interface`, `codex/wallet-explorer-links`, `feat/aave-fuji`, `feat/avalanche-connection-intelligence`, `feat/avalanche-ecosystem-next`, `feat/carmelita-agent-gateway`, `feat/carmelita-oauth-chat-connectors`, `feat/multichain-wallet-foundation`, `feat/solana-devnet-foundation`, `feat/webmcp-official-integration`, `fix/dexalot-quote-not-live`, `fix/stellar-reconnect-idempotency`, `fix/webmcp-type-contract`, `integrate/avalanche-multichain` e `integrate/avalanche-release`.

La eliminación de una referencia incorporada no autoriza retirar un worktree con cambios o evidencia privada. Primero debe existir una copia recuperable del código y de la evidencia necesaria; no usar `reset --hard`, `clean` o borrado recursivo para conseguir una lista limpia.

## Siete ramas locales sin rama remota

| Rama local / head | Disposición |
|---|---|
| `codex/mvp-beta` · `f5aab6b` | Dos parches propios no equivalentes en PR46: `bd7701e` lifecycle/revocación Notion y `f5aab6b` límites duraderos del chat web. Revisar selectivamente; no sustituir la nueva landing con la antigua beta ni afirmar cuotas equivalentes en ChatGPT. Conservar la referencia local mientras no exista respaldo recuperable de ambos commits. |
| `codex/wallet-preparation-worker` · `bded469` | Cero commits exclusivos de main, pero 29 archivos pendientes ahora respaldados. Backlog WORKER: leases/reintentos/cron y migración `0022` quedan fuera de la candidata; no aplicar migración ni habilitar cron en este cierre. |
| `codex/oauth-consent-navigation` · `bded469` | Cero commits exclusivos, pero cuatro archivos pendientes ahora respaldados. Revisar su cancelación/navegación en el frente ChatGPT antes de clasificarla como terminada o retirar el worktree. |
| `codex/pilot-chat-routing-fix` · `556880f` | Único parche propio equivalente en PR46 (`git cherry -`). Clasificar como incorporada después de integrar candidata. |
| `codex/pilot-graph-tools` · `691255a` | Parche propio equivalente en PR46, que contiene correcciones adicionales posteriores. Clasificar como incorporada tras integración. |
| `codex/pilot-provider-diagnosis` · `06aedc0` | Documento equivalente en PR46 (`git cherry -`). Conservar evidencia y luego clasificar como incorporada. |
| `codex/pilot-script-qa` · `71b2f0b` | Nueve commits históricos: cuatro parches equivalentes y cinco no equivalentes (`ddc2e87`, `9ce84e9`, `1f42030`, `d2bf9fe`, `71b2f0b`), principalmente evidencia y control independiente. Retener esa evidencia; comparar el control útil antes de cualquier limpieza. No mezclar automáticamente todos los scripts de QA. |

## Backlog que no bloquea la demo aprobada

- **VOICE:** precisión de dictado local en español, descarga inicial, permisos y recuperación en teléfono real. La voz nativa de ChatGPT no acredita este componente web.
- **BRIDGE:** ejecutores por dirección, identidad oficial de contratos/programas, SQL concurrente, reinicio, conciliación y aceptación on-chain autorizada por separado. BNB requiere proveedor/ruta acreditados.
- **WORKER:** migración aditiva revisada, leases/reintentos/cron, pruebas SQL reales y activación específica; preservar el respaldo actual.
- **NOTION-LIFECYCLE / QUOTA:** revisión selectiva de `mvp-beta`, sin expandir el alcance de Guionista y catálogo. Las cuotas web requieren un diseño separado si se desean también en MCP.
- **MCP-COMMERCE-HARDENING:** aislar ahora las mutaciones genéricas inseguras; una reactivación posterior exigirá identidad, propiedad, idempotencia por principal y estados finales protegidos.
- **ACCEPTANCE:** alta con segunda cuenta, móvil real, expiración/reconexión y aceptación hospedada Bazaar permanecen puertas explícitas según el alcance publicado. El cierre de una rama no las satisface.

Las restricciones de compra nativa, firma real dentro de ChatGPT y financiación no se resolverán cerrando ramas. El cierre técnico puede publicarse con lectura/catálogo aprobados mientras esas condiciones se mantienen visibles y la ejecución permanece bloqueada.
