# Tempo Moderato — backlog y contratos

Coordinador e integrador: root. Base verificada tras fetch: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`, remoto `https://github.com/CaBsCrypto/carmelita.git`. Rama nueva `feat/tempo-testnet-mcp`; trabajo ajeno del árbol principal preservado. Cuatro especialistas, archivos exclusivos y root único integrador.

**Corte vigente, 13 de octubre de 2026: aceptación parcial.** Dos Previews autorizados y utilizados. El corregido `5a5fec953911292abc93973723c1bb76469d79f3` / `dpl_2fLJAdDjcxvtqkNccRwuFJ3GpEPL` dio lectura real de A desde ChatGPT. B dio login/asociación/lectura UI, pero su cliente OAuth se comparte con un grant previo de siete scopes; no se alteró ese grant y su MCP sigue pendiente. La ventana renovada terminó y los accesos temporales están retirados. [Validación](validation.md), [evidencia](evidence/preview-qa-20261013.json), [PR draft #58](https://github.com/CaBsCrypto/carmelita/pull/58).

Plazo comunicado: 13 de octubre 03:59 Chile / 06:59 UTC. No se habilita Fase B por presión de tiempo. Done de componente significa revisión e integración con la evidencia indicada; **no equivale a aceptación completa de Fase A**.

## Contratos acordados

- Owner se deriva de autenticación servidor/MCP. Schemas de lectura strict, sin owner/address/wallet ID/RPC arbitrarios; `networks` solo filtra registros propios.
- `tempo:moderato`, `eip155:42431`, RPC fijo `https://rpc.moderato.tempo.xyz`; mainnet 4217 excluida.
- Asociación explícita reutiliza EVM canónica Privy; ID/dirección estables, sin firma/fondeo/wallet nueva. Red SQL como texto; no migración añadida.
- Flag servidor Tempo por defecto off, exige aislamiento y Preview/local explícito; producción siempre deshabilitada. Providers recibe decisión del servidor.
- TIP-20 con seis decimales y metadatos/código/balance verificados en un bloque explícito; strings enteros/decimales. Sin saldo nativo de gas. Error/timeout nunca se transforma en cero.
- `readTempoWallet` conserva estados available/disabled/misconfigured/wrong_network/unavailable; fallos sanitizados, token/bloque nulos.
- MCP conserva nombres/scopes y comportamiento compatible. No caché de lectura compartida; peticiones no-store.
- Consentimiento existente valida las tres identidades SQL + listas Privy del owner; aislamiento primero, sin profile/provision/Horizon/Friendbot ni fallback. Asociación Tempo es separada.
- OAuth QA solicita read/context sin OIDC. Client ID separado permitiría revocación de prueba separada; audiencia entre recursos requiere validación propia.

## Tarjetas

WIP máximo: una implementación por especialista. Ready exige entradas/permisos/contrato/archivos exclusivos y prueba reproducible. Los criterios en vivo no se marcan por mocks.

| ID / prioridad | Objetivo / responsable | Entradas → salida / dependencias | Archivos asignados | Aceptación y evidencia | Estado / bloqueo |
| --- | --- | --- | --- | --- | --- |
| T01 P0 | Fuentes/versiones/contratos — tempo_architecture | Docs + manifest/exports → catálogo/Privy; base verificada | app/wallets/types.ts; networks.ts; app/providers.tsx | 42431/RPC/explorer/token/versiones y flags; revisión independiente | done, bases integradas |
| T02 P0 | Wallet/asociación/RPC — tempo_wallet | T01 + Privy owner → vínculo/lectura | app/wallets/tempo.ts; tempo-onboarding.ts; tempo-status.ts; privy.ts; evm-onboarding.ts; evm-status.ts; evm-rpc.ts; app/api/agent/wallets/route.ts; tempo/route.ts; app/agent/wallet-readings.ts; app/agent-chat-balances.ts | A/B Privy+SQL, repetición sin duplicados, tres RPC contrastados; 28 tests Tempo | review; relogin B y negativos hospedados quedan en T06 |
| T03 P0 | MCP propietario — tempo_backend | T01/T02 → tools/contexto compatibles | app/mcp/agent-context.ts; app/queries/personal.ts | Mocks owner/scopes y A ChatGPT real; native no aplicable, errors sanitizados | review; B MCP y negativos reales pendientes T06 |
| T04 P0 | QA independiente — tempo_qa | Incrementos → pruebas/revisión/evidencia | tests/tempo-*.test.ts; tests/multichain-wallets.test.ts; registro inicial docs/tempo/validation.md y demo.md | 28 Tempo + 36 OAuth, suite 1112 PASS/0 FAIL/2 SKIP, lint/types/build; contraste independiente | review; aceptación de seguridad completa pendiente |
| T05 P0 | Integración/UI/docs — root | T01–T03 → diff/revisión | app/layout.tsx; app/agent/registry-wallet-panel.tsx; registry-wallet-model.ts; .env.example; scripts/tempo-rpc-evidence.ts; docs/tempo/* | UI A–B–A sin mezcla, explicit register; README/registro/demo y PR | review; recorrido demo preparado, vídeo no grabado |
| T06 P0 | Preview/ChatGPT y aceptación — root + QA | SHA probado + acceso autorizado → E2E y negativos | docs/tempo/validation.md; README.md; evidence/preview-qa-20261013.json | A ChatGPT real, B UI real, correlación revocación401; falta B MCP, negativos propietarios/recurso y otros gates del registro | blocked; cliente OAuth B compartido, ventana cerrada |
| T07 P1 | Pago — fuera de implementación | T06 done + autorización separada → propuesta/envío/receipt | Ninguno | Aprobación/fees/idempotencia/receipt | blocked; P0 no aceptado |
| T08 P0 | Huellas runtime — tempo_backend, review QA | Dependencias compartidas → snapshot actual | app/queries/acceptance-runtime.json | Seis hashes verificados; históricos no reescritos | done; 36 históricos requieren revalidación propia |
| T09 P0 | Consentimiento existente — root | Rechazo f573 → validación solo lectura; T06 | app/stytch/existing-oauth-wallets.ts; authorize-with-wallets.ts; public-error.ts; app/oauth/authorize/consent-request.ts; consent-client.tsx; page.tsx; app/preview-acceptance/page.tsx; panel.tsx; app/providers.tsx; app/layout.tsx; app/agent/registry-wallet-panel.tsx | Sin preparación/creación, aislamiento primero, existente/owner válido; consent A real nuevo read/context | done para componente revisado, probado en segundo Preview |
| T10 P0 | Regresión consentimiento — tempo_qa | T09 → helper/ruta/Providers reales con fronteras simuladas | tests/oauth-existing-wallets.test.ts; oauth-existing-route-fixture.mts; oauth-existing-route.test.ts | 36 tests PASS, traps efectos/fallback/grant al fallar, CI | done para pruebas locales/CI; no sustituye T06 |
| T11 P0 | Cliente/grant QA independiente — PM, ejecución root | Legacy B siete scopes + DCR dedup → cliente separado; T06 | Docs/propuesta/recibos; autorización independiente recibida | Client público distinto, App privada adicional, read/context, grants solo nuevos; ventana20min mismo5a sin build | blocked; cliente5028 creado sin secret/grants; ChatGPT rechazó App por contexto. PM acepta entrega con App pendiente |

Rutas adicionales de documentación/evidencia asignadas a root antes de escribir: `docs/tempo/evidence/build-pricing.json`, `preview-qa-20261013.json`. QA dejó de escribir docs antes del cierre de root. `docs/tempo/evidence/pinned-rpc-20261013.json` está asignado exclusivamente a tempo_wallet para recibos de RPC público; root solo lo referencia.

## Historial y decisiones

1. Corte local `6c07143`: 1076 PASS, 0 FAIL, 2 SKIP; lector público real y revisión independiente, sin E2E. Snapshot histórico conservado.
2. Primer Preview autorizado `f5731a6`: READY, health/SHA/baseQA/MCP401 correctos; dos consentimientos rechazados por revisión automática por posible Friendbot heredado. No lectura autenticada. No puede afirmarse ausencia de un grant previo de A: el que se observó después tenía recurso/actor desconocidos.
3. Runtime `b268649`: consentimiento SQL/Privy sin preparación, SDK sin createOnLogin/migración y panel seguro con reconfirmación/cancelación al cambiar owner. Reviews Backend/Wallet/QA sin hallazgos pendientes de ese incremento. Suite1112 PASS/2 SKIP, lint/types/build PASS. Fixture React corregido después; CI `5a5fec9` SUCCESS.
4. Segundo Preview autorizado `5a5fec9`: A descubrió/leyó desde ChatGPT; tres lecturas A web/A conector/B UI contrastadas por RPC. SQL mantuvo una EVM/un binding por propietario. Revocación A correlacionada con401; reauth automática del conector reapareció y grant fue retirado otra vez.
5. Renovación20min sin build para login B: usuario completó login; asociación repetida y UI propias. B ya tenía siete scopes del mismo cliente público: no consentir/revocar ese grant. No tercera publicación.
6. Cierre renovación: excepción retirada **28,507 segundos tarde** respecto del límite `05:22:09.809Z`; baseline Privy verificada `05:23:39.836Z`, hora exacta de retirada UI desconocida. QA independiente verificó protección/origen/excepción a05:25Z.
7. T11 autorizado por PM: cliente5028 distinto creado HTTP201 a05:48:42.397Z, sin secret ni grants A/B. ChatGPT rechazó crear la App privada con configuración mínima por restricción de contexto; causa más específica desconocida, sin cambio de permisos globales. Ventana05:51:05.504Z–06:11:05.504Z cerrada anticipadamente05:54:32.906Z y baseline Privy12 verificada05:55:40.940Z. Sin grants ni builds nuevos. PM decide entregar avance con App pendiente. Cliente separado permite futuras revocaciones separadas, no valida audiencia.

Controles Vercel: Standard 4 CPU fijo, extras apagados, filtro main-only y deployment/alias de producción conservados. Dos builds usados sumaron 5 machine-min/20 CPU-min: US$0,070 equivalente **solo si facturable**, no factura; Functions aparte. El inventario global de variables cambió sin snapshot inicial completo para atribuir diferencias; las diez variables de rama mantuvieron digest. No afirmar que todo inventario productivo o todos sus tokens OAuth permanecieron intactos.

Grafo AST tras fixture: 3941 nodos/10275 relaciones/169 comunidades;22SQL no parseados. Root reserva commits/push de rama/PR, sin main, force-push, producción ni otro build.
