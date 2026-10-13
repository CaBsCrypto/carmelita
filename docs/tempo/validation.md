# Validación de Tempo Moderato

Estado de aceptación: **Fase A pendiente de prueba real desde ChatGPT conectado al Preview correcto**. Las lecturas públicas del RPC verifican la red y el token; no acreditan autenticación Privy, asociación persistida ni conexión de punta a punta. Fase B no iniciada; firma, fondeo y pagos no se ejecutaron.

## Identidad de la ejecución

| Campo | Evidencia |
| --- | --- |
| Fecha de trabajo | 12–13 de octubre de 2026, Chile continental; horas técnicas registradas en UTC |
| Repositorio | CaBsCrypto/carmelita |
| Base verificada después de fetch por el coordinador | `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542` |
| Contratos integrados | `0f8780c4bf57d23f2bbf3718862cb1ddad9c015a` |
| Rama QA | `codex/tempo-qa` |
| Rama de entrega | `feat/tempo-testnet-mcp`; confirmar SHA integrado en el cierre |
| SHA de código probado | `b268649a8e4dc72b7bd5993bdc68da7d1e6b6862`; corte anterior `6c07143e897f32619365ab027aed65d5acaa4135` preservado como histórico |
| Runtime local | Node `v24.14.0`, npm `11.9.0`; manifest declara npm `11.6.1` |
| Entorno hospedado probado | Preview f573: health/metadata/MCP 401 y login A; corrección b268649 solo local, no desplegada |

El QA es un agente distinto de los autores de Wallet/RPC y Backend/MCP. Escribió pruebas y el registro inicial; no implementó el código revisado. Root integra y actualiza la evidencia real. No se descartaron cambios del árbol principal ni se copiaron secretos a los checkouts. Se ejecutó un único build QA autorizado, sin producción. Se creó una App QA privada autorizada; grant pendiente. No se crearon claves de wallet, signers ni delegación de firma.

## Estado verificado del primer Preview y corrección local

El Preview `dpl_2fUtySGNT6d3YU6HnKCghL7H8Fne` quedó READY con SHA completo `f5731a6138e1c22dd727b162992de15eb41ba946`, rama `feat/tempo-testnet-mcp`, target Preview. Health comprobó la base QA separada y el SHA tanto en la URL inmutable como en `carmelita-chat-first-qa.vercel.app`. MCP público 401 incluyó el resource metadata correcto del alias QA. Estas comprobaciones de configuración no prueban lectura SQL ni wallet desde MCP.

El usuario A inició sesión mediante Privy en `/preview-acceptance`. La relación real del proveedor se observó en el Dashboard autenticado; una consulta SQL de solo lectura a la base QA comprobó exactamente una identidad canónica de Ethereum, Stellar y Solana para A, con los mismos IDs/direcciones. El lector real de Horizon comprobó existencia de la cuenta Stellar; no hubo bootstrap, asociación Tempo ni fondeo. La evidencia actual no acredita usuario B, persistencia tras relógin o E2E.

La App privada **Carmelita Tempo QA** fue creada por el flujo soportado de ChatGPT y DCR. URL real: `https://carmelita-chat-first-qa.vercel.app/api/mcp/agent`; consentimiento observado contra `/oauth/authorize` del mismo origen, scopes `agent:read agent:context`, sin OIDC. El issuer Stytch existente sigue compartido; no se cambió su configuración global. La revisión automática rechazó dos intentos de autorizar: el provisionador de f573 puede solicitar Friendbot si Horizon responde 404 más tarde. La concesión no ocurrió; no hay token/read MCP real. No se intentó una vía alternativa para eludir el rechazo.

Accesos retirados: excepción Vercel a las `03:34:25.575Z`; origen Privy a las `03:34:40.609Z`, lista original de 12 orígenes restaurada. QA independiente verificó health público 302 a protección a las `03:37:49.168Z`, lista Privy original a las `03:37:52.112Z` y alias/proyecto sin excepción con configuración general intacta a las `03:37:56.226Z`. Producción conservó deployment `dpl_GpjPYjyeXDwhrwZMiwRzRRVcAaeH`, SHA base y sus cinco alias; Standard fijo, concurrencia adicional desactivada y filtro main-only intactos.

Lectura de API de duración a las `03:52:26.253Z`: 120000 ms facturables de máquina y 480000 ms CPU. El equivalente a tarifa sería US$0,028 si facturable, antes de créditos/impuestos; no es cargo confirmado. [Pricing oficial](https://vercel.com/docs/pricing#builds) limita la facturación Standard a concurrencia on-demand o Elastic; ambos permanecen apagados. Functions aparte. Recibos sanitizados locales: `outputs/tempo/preview-inspect.json`, `qa-window.json`, `qa-alias-close.json`, `privy-qa-origin.json`, `existing-user-a-preflight.json`; no contienen tokens o credenciales.

Runtime de la corrección `b268649` (el fixture React se corrigió después, sin cambios de aplicación): valida SQL/Privy existentes y rechaza faltantes/conflictos sin perfil, provisionador, Horizon, activación ni Friendbot. Aislamiento inválido no permite fallback. SDK login fija creación Ethereum/Solana en off y migración automática desactivada solo en ese modo. `/preview-acceptance` reutiliza el panel de registro Tempo para asociación explícita y reconfirmación; cancela solicitudes durante cambio de cuenta. Tres especialistas revisaron sin pendientes; QA aplicó `vercel:react-best-practices` al consentimiento, Providers y paneles.

Regresión final: `npm test` **1114 tests, 1112 PASS, 0 FAIL, 2 SKIP**, duración `104939.9718 ms`; 36 nuevos tests de OAuth existente y 28 Tempo. El fixture ejecuta la ruta OAuth real, aislamiento/orquestación/helper reales con el validador externo simulado, trampas del provisionador/perfil/fetch, y renderiza Providers real con SDK simulado. Comprueba que un fallo no vincula sujeto ni emite grant; no consulta Horizon ni red. No sustituye pruebas hospedadas. Lint/tipos/build local finales PASS; Next 16.2.6 compiló en 15.5 s. SWC encontró acceso denegado en sandbox Windows y se repitió el build únicamente local fuera del sandbox. Grafo AST actualizado: 3916 nodos, 10203 relaciones, 165 comunidades; 22 SQL no parseados. No segundo build hospedado ni ventana reabierta.

## Lecturas reales del RPC público

Estas peticiones son de solo lectura, sin credenciales, firma ni transmisión. Se exigió ausencia de `error` JSON-RPC y resultado no nulo. El primer intento en el sandbox falló por resolución DNS (`Host desconocido`); la lectura pública fuera del sandbox fue aprobada y tuvo éxito.

| Petición | Hora UTC | Resultado |
| --- | --- | --- |
| `eth_chainId` | `2026-10-13T00:38:32.0172799Z` | `0xa5bf` = **42431**, Moderato |
| `eth_getBlockByNumber("latest", false)` | Metadatos completados `2026-10-13T00:38:52.7570811Z` | Número `0x2585139`, hash `0x7bf9ea3fd722d2d685b0d71377f1090bc450b21b6fdd49625ce2611782cf768d`, timestamp `0x6acd7d9a` |
| `eth_getCode` en el bloque anterior | Mismo conjunto de consultas | Token `0x20c0000000000000000000000000000000000000`, código no vacío `0xef` |
| `decimals()` vía `eth_call`, bloque `0x2585139` | Mismo conjunto de consultas | ABI uint = **6** |
| `name()` y `symbol()` vía `eth_call`, bloque `0x2585139` | Mismo conjunto de consultas | ABI string = **PathUSD** en ambos casos |

`0xef` corresponde al resultado real de este predeploy y no se trató como ausencia de código. La documentación usa el alias `pathUSD`; la cadena devuelve `PathUSD`. No se consultó un saldo de un propietario real durante estas peticiones.

Además, QA ejecutó el **lector real integrado** `readTempoWallet` en el árbol `cb6239d3a37037f14758be4e11781315c4214768`, sin credenciales, DB ni Privy, usando como dirección pública de control el propio contrato PathUSD. Resultado: `available`, chain ID **42431**, consulta `2026-10-13T00:47:24.091Z`, bloque decimal `39343234`, hash `0xcf8a1df2aca8a546ab7c9cb8a237964e3a0f906dd90adf98c7c8985a115936d9`, timestamp `1791852443`; metadata `PathUSD`, 6 decimales, `metadataVerified=true`; saldo bruto **`938733031469202`** y decimal **`938733031.469202`**. Duración del comando `2.287 s`; el probe usó límite de 15 s. Este saldo pertenece a la dirección de control, **no al usuario autenticado**. No es dinero real ni prueba de la asociación o del MCP. La apertura de su enlace en la herramienta web del agente no estuvo disponible; la verificación visual de la ruta sigue pendiente.

El coordinador repitió el script de lectura pública en el SHA final `6c07143e897f32619365ab027aed65d5acaa4135` a `2026-10-13T00:51:31.307Z`, con la dirección cero como control público: resultado `available`, chain **42431**, bloque `39343638`, hash `0x95111ded19455fa105ef253d6fe485fcad0d95fc73cce24a4258dc58baa93033`, timestamp `1791852690`, PathUSD y 6 decimales verificados, saldo bruto `40000000000000`, decimal `40000000`. La dirección cero de este probe tiene saldo de tokens testnet; no se presentó como wallet del propietario ni como un saldo cero. Tampoco intervino DB, Privy o ChatGPT. Respuesta conservada y revisada por QA sin credenciales: [public-rpc.json](evidence/public-rpc.json).

Receta mínima para repetir la comprobación pública desde PowerShell:

```powershell
$rpc = 'https://rpc.moderato.tempo.xyz'
$chain = Invoke-RestMethod -Uri $rpc -Method Post -ContentType 'application/json' -TimeoutSec 15 -ErrorAction Stop -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
if ($chain.error -or $chain.result -ne '0xa5bf') { throw 'Tempo Moderato no verificado' }
$block = Invoke-RestMethod -Uri $rpc -Method Post -ContentType 'application/json' -TimeoutSec 15 -ErrorAction Stop -Body '{"jsonrpc":"2.0","id":2,"method":"eth_getBlockByNumber","params":["latest",false]}'
if ($block.error -or -not $block.result) { throw 'Bloque no disponible' }
$block.result | Select-Object number, hash, timestamp
```

Para metadata y `balanceOf(address)`, usar ese `block.result.number` como segundo parámetro de cada `eth_call`; no mezclar `latest` entre consultas. La dirección que se valide para aceptación debe venir de la wallet del usuario autenticado y coincidir con UI, registry y MCP.

## Pruebas locales y regresión

Las pruebas nuevas usan `node:test`, `assert` y dependencias inyectadas. Sus wallets, autenticación y respuestas RPC son **fixtures sintéticos**, salvo la sección RPC público anterior. Una prueba unitaria de revocación 401 no sustituye revocar un token real en el Preview.

| Archivo | Riesgos que comprueba | Resultado |
| --- | --- | --- |
| `tests/tempo-rpc.test.ts` | Chain ID antes de token, bloque explícito único, código/metadata, cero medido, precisión superior a Number, ABI inválido, error JSON-RPC HTTP 200, timeout, secretos y owner/red del adaptador UI | **PASS 9/9**, fixtures RPC |
| `tests/tempo-wallet-onboarding.test.ts` | Identidad EVM estable, asociación repetida, owner ajeno, wallet ausente, no creación, chain inválida antes de persistencia, auth revocada 401, selectors manipulados | **PASS 9/9**, fixtures Privy/HTTP y contrato de sentencias SQL; sin ejecutar DB |
| `tests/tempo-mcp-owner-read.test.ts` | Esquemas centrales compatibles, scope, principal, A-B-A, filtrado owner, sin native gas, mismatch y proyección sin datos privados | **PASS 7/7**, fixtures MCP/dependencias |
| `tests/tempo-feature-rollback.test.ts` | Default off, aislamiento, producción bloqueada, TIP-20, apagado/reencendido conserva registro y redes existentes | **PASS 3/3**, catálogo/contexto local |

Comandos a ejecutar en la rama integrada, sin cargar archivos de credenciales:

```powershell
node --import tsx --test tests/tempo-rpc.test.ts tests/tempo-wallet-onboarding.test.ts tests/tempo-mcp-owner-read.test.ts tests/tempo-feature-rollback.test.ts
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

Resultados QA verificados al `2026-10-13T00:43:52Z` (21:43 del 12 de octubre en Chile): comando focal anterior **28 pruebas, 28 PASS, 0 FAIL**, duración `6.806 s`; `npx tsc --noEmit` **PASS**, salida 0. El primer intento detectó una expectativa incorrecta de la prueba QA sobre un error síncrono de autenticación; se corrigió la prueba para capturar ese error y se repitió. No se modificó la autorización para hacerla pasar. Las cantidades BigInt de las pruebas se expresan sin literales para respetar el target ES2017 del proyecto.

Primera regresión completa reportada por el coordinador en `cb6239d`: 1.078 pruebas, **1.075 PASS, 2 SKIP, 1 FAIL**. El único fallo fue el snapshot desactualizado de fingerprints de ejecución (`query-acceptance.test.ts`), porque las dependencias compartidas de wallets cambiaron. Backend regeneró solo `app/queries/acceptance-runtime.json`; QA recomputó independientemente los seis hashes y confirmó coincidencia exacta. `acceptance-manifest.json` y `acceptance-evidence.json` permanecen sin cambios: no se renovaron observaciones ni se fabricó aceptación real. El gate deja los históricos afectados en `pending` con `implementation_fingerprint_changed` hasta revalidación real. El test focal de ese gate fue reportado **9/9 PASS** por Backend.

**Regresión final en `6c07143e897f32619365ab027aed65d5acaa4135`: `npm run test` PASS**, salida 0, **1.078 pruebas: 1.076 PASS, 0 FAIL, 2 SKIP**, duración `124.772 s`, reportada por el coordinador y registrada al `2026-10-13T00:54:40Z` (21:54 del 12 de octubre en Chile). Incluye las 28 pruebas Tempo.

Lint reportado **PASS** por el coordinador en el código final; después cambió únicamente el JSON de seis hashes. `npm run build` del SHA final **PASS**, salida 0: compilación `18.3 s`, tipos `22.6 s`, 23 páginas estáticas y ruta GET Tempo presente en el build. Se ejecutó localmente con aprobación del reintento fuera del sandbox, porque SWC en Windows encontró una denegación de acceso en el sandbox; no fue un build hospedado en Vercel. El chequeo de tipos del build final también pasó. Las pruebas heredadas relevantes incluyen `erc20-balance-validation`, `wallet-readings`, `personal-query-parity`, `multichain-wallets`, `wallet-persistence-hardening`, `evm-network-expansion`, `mcp-gateway`, `personal-mcp-token`, `stytch-oauth-resource`, `preview-isolation` y `chatgpt-connection-readiness`. La expectativa heredada del catálogo EVM se amplió a cuatro redes incluidas las planeadas; eso no habilita Tempo por defecto.

Los dos tests omitidos de la suite son probes opt-in de red (`live official MCP smoke remains read-only` y `live Dexalot Testnet smoke is explicit`); no se ejecutaron sin su configuración explícita. La integración Tempo no introduce una migración: la red se persiste como texto y usa la asociación existente por wallet/red/owner. La idempotencia SQL se verificó en el contrato de sentencias, no mediante una nueva prueba real de DB.

`graphify update .` fue reportado **PASS** por el coordinador: 3.887 nodos, 9.302 relaciones, 182 comunidades, extracción AST sin LLM. Se registraron 22 archivos SQL no parseados por la herramienta; no hay una migración Tempo pendiente ni se presenta ese grafo como cobertura SQL completa.

## Revisión independiente de implementación

La revisión QA no encontró un fallo de seguridad bloqueante en el árbol revisado. El lector exige chain 42431 antes de bloques/tokens, usa un bloque explícito para metadata y saldo, valida identidad JSON-RPC y conserva precisión. Su deadline total cubre transporte y decodificación. El resolver Privy existente valida identidad canónica y lee wallets por `user_id`; la asociación explícita verifica red antes de persistir y no tiene ruta de creación o firma. Los handlers y MCP derivan owner de autenticación, rechazan selectors externos y sanitizan errores.

La revisión React de `registry-wallet-panel.tsx` aplicó `vercel:react-best-practices`: se confirmó `key={userId}` en el padre, cleanup de AbortController en cambio de owner/unmount, comprobación de dirección antes de mostrar lectura y conservación de otras wallets ante fallo Tempo. El estado de carga se muestra sin anunciar fallo prematuro; la UI usa el GET Tempo específico y deadline de 12 s para token, fetch y JSON. El POST explícito de asociación tiene su propio deadline y no transmite transacciones. No se ejecutó aún una prueba visual con usuarios reales.

## Historial previo al primer Preview: conexión QA antigua

Se inspeccionó el plugin QA de solo lectura usando `plugin-creator:update-plugin` y herramientas Plugin Creator:

- Plugin: `plugin_asdk_app_6ac2f0e3dba0819185f6754eaff8aabd`, scope `USER`, `PRIVATE`, versión `1.0.0`.
- Release observado: `PluginRelease_61587b99cbc48191a4fb023ec721b083`.
- Inventario: `.app.json` y `.codex-plugin/plugin.json`; App asociado `asdk_app_6ac2f0e3dba0819185f6754eaff8aabd`. Ninguno contiene el endpoint MCP. El paquete App-backed no acredita qué URL o SHA usa la conexión.
- Los schemas conectados de `read_personal_wallets_status` y `read_personal_wallets_balances` todavía enumeran cinco redes y no incluyen Tempo.
- Tres intentos de `Carmelita QA.get_agent_context`: dos solicitaron reintento tras autenticación; el tercero devolvió **`McpServerError: Protected by Vercel Authentication`**, sin datos de wallet.

En esta inspección inicial no se desactivó protección ni se amplió consentimiento. La URL antigua se identificó posteriormente y se conservó esa App; el primer Preview y la App nueva constan arriba. Una llamada con `vc curl` o local no sustituye el resultado desde ChatGPT.

La lectura inicial de Vercel confirmó Standard fijo, Elastic desactivado y filtro que ignora ramas distintas de `main`. En ese momento los overrides de `feat/tempo-testnet-mcp` estaban vacíos; posteriormente se configuraron diez variables de esa rama QA y se creó el único Preview autorizado. No se modificó el filtro global ni el plan; la excepción de build fue específica de f573.

No se ejecutaron los scripts heredados que crean PATs, perfiles o sesiones admin como efecto secundario: `gateway:preview:acceptance` crea y revoca credenciales persistentes; `wallets:preview:acceptance` requiere login admin. No son pruebas autorizadas de solo lectura.

## Aceptación real pendiente

1. Dos identidades Privy reales propias de prueba: asociar dos veces Tempo y volver a iniciar sesión; confirmar mismo wallet ID y dirección, una sola asociación por usuario/red.
2. Descubrir esa wallet desde ChatGPT con el plugin conectado al Preview exacto y SHA probado. Consultar `read_personal_wallets_status` para `tempo:moderato` y comparar con servidor: dirección, 42431, token, monto bruto/formateado, bloque, hash, hora y explorer.
3. A manipula IDs/address/userId/context de B, y B hace lo mismo con A; no debe salir ningún dato de la otra wallet. Comprobar también secuencia A-B-A y cualquier caché.
4. Revocar el token real de prueba por el flujo autorizado y repetir petición HTTP/MCP: 401/403 según contrato, sin wallet ni secretos. No modificar autorizaciones reales ajenas.
5. Abrir la ruta real de explorer de la misma dirección. Cero saldo y ausencia de historial son válidos; no afirmar despliegue, fondeo ni actividad.
6. Apagar flag Tempo: no lectura RPC Tempo ni descubrimiento; conservar bindings y flujos de las redes existentes. Reencender en el Preview autorizado y repetir lectura.

Fase A no puede marcarse `done` mientras falten estos puntos de punta a punta. La demo solo debe mostrar resultados efectivamente obtenidos; véase `docs/tempo/demo.md`.
