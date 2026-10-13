# Carmelita × Tempo Moderato

Fase A: asociación explícita de la wallet EVM existente de Privy y lectura de un token TIP-20 en Tempo Moderato testnet. Los tools MCP existentes conservan nombres/scopes y añaden datos de Tempo. No se implementan pagos, firma autónoma ni fondeo. La aceptación desde ChatGPT exige un Preview autorizado y evidencia separada; ver [validación](validation.md), [backlog](backlog.md) y [demo](demo.md).

## Base y versiones

Rama nueva `feat/tempo-testnet-mcp` desde `origin/main`, verificado tras fetch: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`. Se preservó el checkout original con cambios ajenos. Implementación mediante ramas separadas para contratos, wallet/RPC, backend y QA; commits/integración reservados al coordinador.

Runtime final probado: `b268649a8e4dc72b7bd5993bdc68da7d1e6b6862`; el cierre posterior actualiza documentación y corrige el uso de children en un fixture React, sin cambiar la aplicación. Regresión: **1112 PASS, 0 FAIL, 2 probes opt-in omitidos**, incluidas 28 pruebas Tempo y 36 de consentimiento existente, además de lint, tipos y build local. [Lectura pública reproducible](evidence/public-rpc.json): Moderato 42431, bloque 39343638, hora 2026-10-13T00:51:31.307Z. El resultado no demuestra conexión MCP/ChatGPT. La Fase A completa sigue pendiente de esa aceptación real.

Manifest/lock y exports efectivamente instalados: Node 24.14.0, npm declarado 11.6.1 (entorno local 11.9.0), viem 2.52.0, Privy React 3.35.0 y Privy Node 0.26.0. `viem/chains` exporta `tempoModerato`; no se actualizan dependencias. La Fase A utiliza JSON-RPC de solo lectura y no depende de APIs recientes de `token.transfer`.

## Red y activo comprobados

| Dato | Valor |
|---|---|
| Red | Tempo Moderato testnet |
| Chain ID / CAIP-2 | 42431 / eip155:42431 |
| RPC fijo | https://rpc.moderato.tempo.xyz |
| Explorador | https://explore.testnet.tempo.xyz |
| TIP-20 testnet | 0x20c0000000000000000000000000000000000000 |
| Name / symbol en RPC | PathUSD / PathUSD |
| Decimales | 6 |

La documentación del [faucet oficial](https://tempo.xyz/docs/quickstart/faucet) identifica el predeploy de prueba con el alias pathUSD. `name()` y `symbol()` devuelven **PathUSD** en el RPC real, contrastado a las 00:33:23 UTC del 13 de octubre de 2026 en bloque `0x2584e8d`; `decimals()` devuelve 6 y `eth_getCode` devuelve código no vacío (`0xef`, predeploy). Cada lectura vuelve a verificar código y metadatos en el bloque consultado. El lector conserva montos y números de bloque como strings decimales.

Fuentes oficiales comprobadas en orden antes de editar: portal/docs (el acceso directo al portal falló en el buscador; docs redirigió y las páginas específicas abrieron mediante HTTP autorizado), [README Tempo](https://github.com/tempoxyz/tempo), [Privy Using Tempo](https://docs.privy.io/recipes/tempo/send-transactions), [definición Moderato de viem](https://raw.githubusercontent.com/wevm/viem/main/src/chains/definitions/tempoModerato.ts). Los [detalles de conexión](https://tempo.xyz/docs/quickstart/connection-details) y viem confirman el explorador testnet; el README contiene un enlace distinto y se prioriza la configuración de red específica comprobada. La ruta `/address/<dirección>` respondió HTTP 200 e incluyó la dirección de prueba; la ausencia de historial no implica fallo.

Tempo [no tiene un token nativo para gas](https://tempo.xyz/docs/protocol/fees): sus fees usan TIP-20 elegibles. El catálogo distingue `balanceKind=tip20`, `feeModel=tip20` y `readOnly=true`; la etiqueta heredada `nativeAsset=USD` no se utiliza como saldo nativo. El MCP presenta `native.status=not_applicable` y saldo TIP-20 explícito. [TIP-20](https://tempo.xyz/docs/network/tokens) es compatible con lecturas ERC-20. El [activo de prueba y el activo mainnet](https://tempo.xyz/docs/protocol/exchange/quote-tokens) son distintos aunque compartan predeploy. Mainnet 4217 queda excluida.

## Instalación y activación

Desde el checkout de la rama de integración:

```powershell
npm ci --no-audit --no-fund
npm run lint
npm run test
npm run build
```

El flag nuevo **de servidor** es `CARMELITA_TEMPO_TESTNET_ENABLED=false` por defecto. Para habilitarlo en el Preview acordado, configurar `true`, junto con la variable de aislamiento existente `CARMELITA_PREVIEW_ISOLATED=true`, `VERCEL_ENV=preview` y la base separada exigida por `app/preview-isolation.ts`. Los controles existentes requeridos son `CARMELITA_PREVIEW_DATABASE_HOST`, `CARMELITA_PREVIEW_DATABASE_URL`, `CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED`, `CARMELITA_PREVIEW_ORIGIN` y `CARMELITA_PREVIEW_DEPLOYMENT`; `CARMELITA_PRODUCTION_DATABASE_HOST` permite rechazar el host productivo explícitamente. Ambos URLs deben referir a la misma base dedicada, con TLS; el URL de migración no utiliza pooler. No copiar la base de producción ni migrarla para este cambio. `CARMELITA_PUBLIC_ORIGIN` debe corresponder al origen aprobado del Preview para la conexión OAuth/MCP.

Las credenciales existentes de Privy (`PRIVY_APP_ID`, `PRIVY_APP_SECRET`) y OAuth/MCP permanecen en servidor/gestor de secretos. Identificador público existente `NEXT_PUBLIC_PRIVY_APP_ID` alimenta el proveedor React; no se crea un flag público adicional. No añadir variables de conexión Preview vacías al entorno de producción: la presencia de esos nombres ya activa los controles de aislamiento. No se publicaron ni añadieron al repositorio o logs valores secretos; la configuración QA reutilizó los existentes en memoria/stdin del CLI.

Para la consulta pública local reproducible no hacen falta credenciales ni base:

```powershell
$env:CARMELITA_TEMPO_TESTNET_ENABLED='true'
$env:CARMELITA_PREVIEW_ISOLATED='true'
# VERCEL_ENV ausente y NODE_ENV / VERCEL_TARGET_ENV distintos de production.
npm exec -- tsx scripts/tempo-rpc-evidence.ts 0x0000000000000000000000000000000000000000
```

Este comando comprueba una dirección pública, **no** acredita propiedad Privy, asociación persistida ni acceso desde ChatGPT. El RPC está fijo en código; cualquier `rpcUrl` de DI es interno a pruebas y no una entrada de UI/MCP. No hay secretos nuevos, claves API, signers o delegación persistente.

## Uso autenticado y contrato

1. En el Preview actualizado y autorizado, abrir `/preview-acceptance` e iniciar sesión con una identidad de prueba ya existente. El SDK desactiva creación Ethereum/Solana y migración automática en modo Tempo aislado. No usar `/login` o `/agent` para esta QA: esos flujos conservan bootstrap heredado.
2. Elegir **Tempo Moderato: asociación y lectura** y pulsar **Conectar Tempo Testnet**. La acción explícita POST a `/api/agent/wallets` contiene solo `network=tempo:moderato` y `explicitUserConfirmation=true`; no acepta una dirección o propietario como prueba de identidad. **Confirmar asociación existente** permite repetir la misma asociación para QA de idempotencia; volver a iniciar sesión permite comprobar persistencia.
3. El servidor resuelve usuario/wallet Privy, comprueba la cadena y lee PathUSD antes de persistir el vínculo idempotente. Si falta una wallet EVM utilizable, se detiene: esta QA no prepara ni crea una wallet. Agregar Tempo no mueve fondos ni firma.
4. UI y MCP usan la misma dirección persistida. `GET /api/agent/wallets/tempo` autentica y deriva la dirección de la asociación propia. El contexto MCP y `read_personal_wallets` descubren el registro; `read_personal_wallets_status` y `read_personal_wallets_balances`, con filtro opcional `networks=["tempo:moderato"]`, consultan la cadena realmente.

Una lectura exitosa incluye testnet, chain ID verificado, CAIP-2, dirección, token/contrato/decimales/balance bruto y formateado, bloque con hash/timestamp, hora y enlace a la dirección. POST y MCP usan `tempo.status=available`; GET y el lector devuelven `status=available` en la raíz (el script lo envuelve en `reading`). En el tool status, `native.status=not_applicable`; en balances, `nativeBalanceStatus=not_applicable`. Los estados disabled, misconfigured, wrong_network y unavailable conservan token/bloque nulos y errores sanitizados. Un cero válido se devuelve como `"0"`; timeout o RPC caído jamás se convierte en cero. No se infiere actividad, wallet desplegada ni fondeo de un registro interno.

No hay caché de lecturas compartida: peticiones `no-store`, dirección exclusivamente del propietario autenticado, señal y límite de tiempo. Los schemas de tools no aceptan IDs/direcciones/RPC/owner arbitrarios. El modelo existente SQL usa redes como texto y claves de propietario/identidad; este cambio no añade una migración.

El consentimiento OAuth de Preview Tempo valida las tres identidades canónicas existentes con consultas SQL y listas Privy filtradas por propietario. No persiste perfil, provisiona, consulta Horizon, activa Stellar ni solicita Friendbot. Aislamiento incompleto falla antes de esas dependencias y jamás recurre al provisionador. Billeteras faltantes responden `oauth_existing_wallets_required` (409), conflicto de identidad (409), lectura/configuración no disponible (503); no se concede el grant si falla. La vinculación OAuth y concesión solicitada son los efectos normales de autorizar la App y conservan el flujo de permisos existente. Asociar Tempo sigue siendo una acción separada. Producción y los modos sin este flag mantienen el comportamiento OAuth anterior.

Las huellas de ejecución en `app/queries/acceptance-runtime.json` se regeneran determinísticamente para las dependencias actuales. Cambios en las raíces compartidas afectan los seis grupos de consultas. Los manifests y registros de aceptación real históricos se conservan sin alterar sus hashes, fechas, SHA o digests; las pruebas históricas no se presentan como equivalentes al código nuevo. La aceptación correspondiente requiere revalidación real y puede mostrarse pendiente. Actualizar el snapshot de código no demuestra aceptación desde ChatGPT.

## Preview, revisión y rollback

No se publica automáticamente. La regla de `AGENTS.md` suministrada por el PM y su registro local `work/mvp-closeout-20261005/vercel-build-cost-review-20261007.md` requieren autorización explícita de publicación y una ventana concreta para QA (el registro local no pertenece a la base Git). Mantener Standard 4 CPU, concurrencia extra apagada y ramas no-main omitidas por Ignored Build Step. Una PR tampoco autoriza merge/publicación. La producción actual permanece intacta.

Después de autorizar un Preview aislado de un SHA probado, registrar su URL real, deployment ID, SHA y coste/tiempo del build; verificar el endpoint `/api/mcp/agent` real de esa instancia. El plugin **Carmelita QA** es App-backed: su paquete no expone la URL MCP, por lo que debe usarse el flujo soportado de conexión de la App y verificar el endpoint y SHA, sin editar archivos del plugin para inventar URLs. La conexión QA disponible inicialmente respondió **Protected by Vercel Authentication**, no una lectura autenticada. Cualquier permiso nuevo o ampliación persistente requiere decisión separada.

El único Preview autorizado y ejecutado fue `f5731a6138e1c22dd727b162992de15eb41ba946`, deployment `dpl_2fUtySGNT6d3YU6HnKCghL7H8Fne`, [URL inmutable](https://agente-asistente-8833nn99i-cabscryptocontacto-6028s-projects.vercel.app). Health verificó SHA, Preview y base QA separada; el endpoint MCP público respondió 401 con el desafío de OAuth correcto. Se creó la App privada **Carmelita Tempo QA** contra el alias QA, con `agent:read` y `agent:context` únicamente, sin OIDC. Su autorización fue rechazada por revisión automática: el código f573 aún podía llamar Friendbot durante preparación. No se concedió grant ni se obtuvo lectura autenticada desde ChatGPT.

La ventana del alias QA comenzó a las 03:16:52.884 UTC y se cerró a las 03:34:25.575 UTC, antes del límite de 20 minutos. El origen temporal Privy se retiró a las 03:34:40.609 UTC y se verificó la lista original de 12 orígenes. Producción, sus alias, protección general, Standard fijo y concurrencia adicional conservan configuración. **La corrección b268649 todavía no está desplegada**; PR de revisión [#58](https://github.com/CaBsCrypto/carmelita/pull/58), sin merge. Una nueva publicación y ventana de acceso requieren autorización nueva; el permiso anterior de un build ya está consumido.

API del primer Preview: `timeForBilling=120000 ms`, `cpuTimeForBilling=480000 ms` (2 minutos de máquina y 8 CPU-minutos). Equivalente tarifado **US$0,028 si resulta facturable**, antes de créditos/impuestos; no es una factura ni cargo confirmado. La [tarifa vigente](https://vercel.com/docs/pricing#builds) es US$0,0035/CPU-minuto y Standard solo se factura con concurrencia on-demand o Elastic. Standard fijo con esos extras apagados normalmente no factura el build. Functions y otros servicios se contabilizan aparte. Fuente vigente y condición conservadas en [build-pricing.json](evidence/build-pricing.json); no se promete un cargo cero de la cuenta.

Rollback: establecer `CARMELITA_TEMPO_TESTNET_ENABLED=false` y reiniciar el entorno aprobado con esa configuración (en Vercel, un cambio de variables requiere una nueva publicación acordada). Incluye decisión server del catálogo y supportedChains. Se oculta/bloquea Tempo y se preservan wallets/vínculos; no borrar registros. Las redes existentes siguen habilitadas conforme a sus flags. Producción (`VERCEL_ENV` o `VERCEL_TARGET_ENV`) se rechaza incluso si el flag se activa por error. Fase B no se implementa y ninguna lectura habilita firma o envío.
