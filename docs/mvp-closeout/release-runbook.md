# Publicación y cierre de referencias

Preparado el 5 de octubre de 2026. Este documento es un procedimiento revisable; A9 no hizo push, merge, deploy, cambios de configuración ni eliminación de ramas. El coordinador ejecuta las operaciones y registra sus resultados.

## Estado comprobado y alcance

- GitHub consultado en vivo: main protegido en `7edcb1890a76a7dfcf9f3eb4da50615807a951be`; 36 ramas y nueve PR abiertos. PR46 sigue draft, remoto `608bb84218be9834607aa414736fac98202520a5`. La candidata local avanzó a `a40f4e9e6e0bf1bff1e1f6b16fce710330ad5d63` mientras se preparaba esta auditoría. Un nuevo commit final requerirá sus propios checks.
- PR22 y PR35 están sustituidos por código ya presente en main. PR34 y PR37 se aplazan conservando referencia y backlog. PR43–45 tienen parches equivalentes en la candidata; PR36 tiene recuperación adaptada. **PR36 y PR43–45 esperan la integración de PR46 en main antes del cierre como incorporadas/sustituidas.** Una candidata local o un draft publicado no equivale a integración.
- La entrega de PR46 permite conexión guiada, consultas propias, catálogo Bazaar y recuperación del historial autorizado. No acredita compras nativas, vínculo de propietario Bazaar, firma ni la aceptación hospedada del nuevo Guionista. El catálogo observado puede ser parcial; suites son declaraciones y skills están indisponibles.
- Siguen pendientes la segunda identidad real, ChatGPT móvil y zoom medido al 200%. Las pruebas locales, el ancho de 320 px y la cuenta inicial no sustituyen esas aceptaciones.

Evidencia privada saneada, fuera del código público: `work/mvp-closeout-20261005/a9-github-live.json`, `a9-branch-cleanup-audit.json`, `a9-hotfix-selection.json`, `a9-pr-texts.json`, `a9-rollback-api-metadata.json` y los respaldos existentes. Ninguna contiene tokens, bypass secrets, magic links o datos de compradores.

## Flujo de la candidata

1. Congelar el conjunto de archivos de entrega. Mantener fuera los 29 archivos del worker y los cuatro históricos de OAuth respaldados; rescates ya adaptados son archivos distintos de la candidata. No mezclar evidencias ignoradas, secretos o migraciones del worker.
2. El coordinador actualiza Graphify y el snapshot de runtime de forma legítima, conservando la evidencia histórica. Crear el commit final y anotar SHA completo. Si cambia código o snapshot después de los checks, repetir los checks afectados y vincular la evidencia al nuevo commit.
3. Ejecutar `npm run qa:local` y TypeScript en el checkout final limpio. El workflow `.github/workflows/quality.yml` ejecuta graph-tooling, lint, suite completa y build con Node 24.14.0 / npm 11.6.1. La aceptación fixture de A8 (223) y recuperación enfocada (51) son antecedentes; no marcar el SHA final como probado por esos runs anteriores.
4. Push normal de `codex/pilot-readiness`, actualizar título/cuerpo de PR46 desde el texto preparado y dejarlo draft. Confirmar que GitHub head, CI y el SHA final coinciden. No force-push ni auto-merge.
5. Obtener el Preview del commit exacto y comprobar target, estado READY, recurso OAuth/issuer y versión de runtime. La API de Vercel debe asociar ese despliegue al mismo Git SHA; ni el alias de rama ni la hora de build bastan.
6. Verificar aislamiento Preview y la fuente Bazaar pública. Sólo Preview recibió `STELLAR_BAZAAR_DISCOVERY_ENABLED=true` y `STELLAR_BAZAAR_BASE_URL=https://bazaar.browns.studio`, limitadas a esta rama. El recibo `preview-catalog-config.json` acredita scope/protección, pero deja los valores efectivos del runtime pendientes del rebuild. No cambiar DB, variables productivas, SSO ni protección para pasar QA.
7. Completar gates humanos sobre el mismo recurso desplegado: alta con identidad independiente, OAuth visible mínimo `agent:read`, billeteras propias, catálogo, historial permitido y denegación sin scope adicional, móvil y zoom 200%. No usar magic link como permiso de compra. Una conexión de Preview necesita su recurso de Preview explícito; la guía muestra la URL canónica productiva.
8. PR46 sólo pasa a revisión/fusión cuando se acepta su alcance publicado. Si falta una puerta, informar el bloqueo y conservar el draft. Después del merge, comprobar el commit real de main, CI y el artefacto **productivo** construido con configuración productiva; nunca promover el artefacto QA con su base aislada. Verificar la decisión de catálogo en configuración productiva: un false explícito, base vacía u origen distinto conserva el estado unavailable. No anunciar catálogo disponible sin su respuesta productiva comprobada.
9. Registrar deploy ID, SHA, estado, alias canónico y comprobaciones públicas. Refrescar metadata en ChatGPT y repetir los flujos afectados; la conexión instalada no recibe automáticamente permisos nuevos. Cerrar PR36/43/44/45 usando el SHA de main confirmado.

### Consultas a Preview protegido

El CLI Vercel 58.9.4 permite `vercel curl` con protección automática y `--deployment`. Usar un ID/URL exacto; una ruta relativa sin deployment apunta al último despliegue productivo. No usar debug, verbose o trazas que expongan encabezados; no escribir manualmente un bypass secret. [Referencia oficial](https://vercel.com/docs/cli/curl).

```powershell
$previewDeployment = 'REPLACE_WITH_VERIFIED_PREVIEW_ID'
vercel curl /api/health --deployment $previewDeployment -- --request GET --max-time 20
vercel curl /.well-known/mcp --deployment $previewDeployment -- --request GET --max-time 20
```

Inspeccionar respuestas públicas permitidas y guardar proyecciones mínimas de estado/SHA/recursos. `vercel inspect --json` puede omitir el vínculo Git y devolver un inventario amplio; preferir GET de la API de deployments con una proyección permitida de `id, projectId, target, readyState, meta.githubCommitSha, gitSource.sha`. No publicar el JSON completo.

## Hotfix de seguridad separado

Recomendado mientras PR46 espera aceptación: partir del main comprobado y trasladar **únicamente** el cambio de seguridad de `3b538da43b31ddd8a77cbce12de8a740978b9414`. El coordinador ya eligió preparar un worktree específico; A9 sólo evaluó la selección.

| Archivo | Función |
| --- | --- |
| `app/api/mcp/route.ts` | Anunciar sólo search_offers/get_offer; retirar intención, autorización, ejecución y recibos públicos; errores fijos |
| `app/api/commerce/route.ts` | Conservar catálogo GET; rechazar POST 405 antes de cuerpo/storage |
| `app/.well-known/mcp/route.ts` | Metadata pública coherente con lectura y ejecución deshabilitada |
| `app/api/health/route.ts` | Declarar commerceSandbox disabled |
| `app/webmcp-registry.tsx` | Retirar prepare_commerce_intent del navegador |
| `app/demo/action-console.tsx` | Demo de catálogo sin controles de operaciones retiradas |
| `app/demo/page.tsx` | Explicar el catálogo y retirar promesas de recibo/ejecución demo |
| `tests/acceptance-contracts.test.ts` | Ajustar contrato health/metadata para la frontera cerrada |
| `tests/public-commerce-boundary.test.ts` | Pruebas de HTTP/MCP directo y cero llamadas a escritores/recibos |

Los ocho archivos preexistentes tienen **el mismo blob** en `3b538da^` y main `7edcb189`; el test nuevo falta en ambos. Esto permite aplicar el parche acotado sin traer los otros ocho archivos del commit, los 21 commits de la candidata original, la nueva landing, sesiones, onboarding, catálogo Bazaar nuevo, fondos o schema. No cherry-pick del commit completo.

Verificación requerida sobre el SHA propio del hotfix: boundary/acceptance tests, lint, tipos, suite/build y CI; Preview protegido; tools/list contiene exactamente dos lecturas, calls a herramientas retiradas fallan sin storage, commerce POST es 405 y GET funciona. Comprobar que metadata pública y demo ya no ofrecen esos controles. Estas son comprobaciones **pendientes del hotfix preparado**, no un run certificado sobre main por los tests de la candidata.

Publicar/fusionar sólo el hotfix revisado con su configuración productiva. No cambia la aceptación ni el estado draft de PR46. Si main avanza por el hotfix, refrescar live refs, recalcular ancestry/cleanup y validar la candidata contra ese main antes del merge posterior.

## Limpieza elegible de referencias remotas

Auditoría: para cada fila, el SHA live de GitHub coincide con `refs/remotes/origin/…`, es ancestro completo del main live, tiene cero commits exclusivos y la misma referencia/SHA está en el bundle privado verificado. Son **23 referencias remotas** elegibles; esto no autoriza eliminar ramas locales activas ni worktrees.

| Rama | SHA exacto comprobado |
| --- | --- |
| codex/channel-parity | 7ad2b7febb99c22d43527fc053885758b1a91c1c |
| codex/channel-parity-foundation | a8e211af4962862d56bc54082a62c5023b8f4ec4 |
| codex/channel-parity-personal | 260fec2d465f1d9eecbdbdb8ef6f4dee337b3f20 |
| codex/mcp-market | 7eb9fb443548265b381903f04909a098c13adcbc |
| codex/multichain-onboarding | 74d13cb007be58cc4502a070fbdc22ea608b465a |
| codex/oauth-client-identity | a317dd373789960dc748eeb0302bc8d4c4a7e42e |
| codex/oauth-introspection-contract | 4ef7941120d910a3945a7bb739a8ea1a46145254 |
| codex/oauth-rejection-diagnostics | 9be8e0bf6e09ac04eaa04533a4855e412027fedf |
| codex/tester-interface | 34466b4cb8b84510bba80afd2b0c9871d0b82bb5 |
| codex/wallet-explorer-links | 2eff3e8a8de8395974e54d660bd701943a16a468 |
| feat/aave-fuji | 9dbc4002403e363a0b937f875f36e386416af2cf |
| feat/avalanche-connection-intelligence | e50910e4b15646fbbf39d9699d2f4df2240122fc |
| feat/avalanche-ecosystem-next | e067f8e38a580a19ddfe41240754b08ef89c41e8 |
| feat/carmelita-agent-gateway | 5c36f4fdbefc463ea683dc8d4a77e3cfc1cda24c |
| feat/carmelita-oauth-chat-connectors | 660fdcde86a708ddc097eeb79f5af3dd3009e133 |
| feat/multichain-wallet-foundation | 16d6d627d04c8777b4152856b4e31b7bcd6377f6 |
| feat/solana-devnet-foundation | dc2d35fffdac05dc105eb1d15f2a8f54f7003cb2 |
| feat/webmcp-official-integration | c163e15ba52bdc9d7bd2250e2bd9d20834b7ee48 |
| fix/dexalot-quote-not-live | 105b85de7dc05db94b73e9302b75a9ea61e1e43b |
| fix/stellar-reconnect-idempotency | 351cfba2610e52eb803410db78921c8f0bc6c707 |
| fix/webmcp-type-contract | f761023b3497e787f6ca0cdd5fcafc30a7511eb6 |
| integrate/avalanche-multichain | 7c8ecf827e135872929f9de7f038713a132f4728 |
| integrate/avalanche-release | aae1ee896056da4801776209fb3c15616f66f3ab |

Bundle: `all-refs-before-closeout.bundle`, 6.347.096 bytes / 89 refs, SHA-256 `04aa5b318c74a2f20c69755c0f86726b3c7f8ebda5718f2c9f4b43baf2840c44`; `git bundle verify` volvió a pasar. Incluye historia, no evidencias ignoradas; los 33 archivos pendientes tienen sus copias independientes verificadas.

Justo antes de cada eliminación, el coordinador debe consultar otra vez el ref live y comprobar el SHA esperado, ancestry con el main actual y bundle. Un movimiento nuevo invalida la fila; no borrar ese ref usando un inventario histórico. Ejecutar la eliminación condicionada al SHA esperado para que falle si la rama avanza entre comprobación y borrado. Conservar los 18 worktrees inspeccionados y sus archivos, las ramas aplazadas y todas las ramas no elegibles; no usar reset, clean o borrado recursivo. PR22/35/34/37/36/43–45 no forman parte de estas 23 eliminaciones.

## Rollback y registro de operaciones

Operaciones ejecutadas por el coordinador el 5 de octubre: PR22 y PR35 cerrados como sustituidos; PR34 y PR37 cerrados como aplazados, conservando sus ramas. Las 23 referencias remotas de la tabla fueron eliminadas después de comprobar nuevamente los SHA contra GitHub, ancestry con main y refs del bundle; una operación atómica con leases impide borrar si cambian. Las ramas locales y los worktrees se conservaron. Recibos privados: `github-closures.json` y `remote-cleanup-receipt.json`. El hotfix de nueve archivos se publicó como [PR47](https://github.com/CaBsCrypto/carmelita/pull/47), inicialmente draft, con SHA `c16a26c04ad2554a5d14b855d70fa6075e5795a2`; su publicación productiva requiere sus checks propios. PR46 continúa draft y PR36/43–45 esperan su integración.

Referencia verificada por GET autenticado de Vercel: `dpl_AZhKWj3aKHSc9Wmv1DT2Z65XpnZA`, READY / production, proyecto `prj_UQnTOdi1AWU6soTr04ACsqNo7YDu`, Git SHA/ref `7edcb1890a76a7dfcf9f3eb4da50615807a951be` / main. Guardado en `a9-rollback-api-metadata.json`. Esta referencia anterior todavía contiene la superficie legacy; volver a ella restaura esa exposición, por lo que después de publicar el hotfix se debe guardar también un rollback que conserve la corrección.

Ante regresión que justifique retroceso, el coordinador decide y registra la versión adecuada antes de ejecutar `vercel rollback DEPLOYMENT_ID`, espera su estado y vuelve a verificar SHA/alias/metadata. El rollback no revierte base de datos ni convierte Testnet en Mainnet. No hubo migraciones nuevas en esta selección. [Referencia oficial](https://vercel.com/docs/cli/rollback).

Registrar por operación: fecha, actor coordinador, alcance, SHA antes/después, PR/deploy ID, check/CI URL, resultado y gates que siguen abiertos. Los cuerpos preparados en `a9-pr-texts.json` contienen condiciones y marcadores: reemplazarlos con evidencia real antes de usarlos. Cerrar una rama, un PR o las 72 horas no declara terminado el recorrido de compra.
