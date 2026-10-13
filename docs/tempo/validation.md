# Validación de Tempo Moderato

Estado de aceptación: **Fase A pendiente de prueba real desde ChatGPT conectado al Preview correcto**. Las lecturas públicas del RPC verifican la red y el token; no acreditan autenticación Privy, asociación persistida ni conexión de punta a punta. Fase B no iniciada; firma, fondeo y pagos no se ejecutaron.

## Identidad de la ejecución

| Campo | Evidencia |
| --- | --- |
| Fecha de trabajo | 12 de octubre de 2026, Chile continental; horas técnicas registradas en UTC |
| Repositorio | CaBsCrypto/carmelita |
| Base verificada después de fetch por el coordinador | `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542` |
| Contratos integrados | `0f8780c4bf57d23f2bbf3718862cb1ddad9c015a` |
| Rama QA | `codex/tempo-qa` |
| Rama de entrega | `feat/tempo-testnet-mcp`; confirmar SHA integrado en el cierre |
| SHA de código probado | `6c07143e897f32619365ab027aed65d5acaa4135`, fuente final y snapshot de runtime; pruebas focales QA en el mismo código antes del commit del snapshot |
| Runtime local | Node `v24.14.0`, npm `11.9.0`; manifest declara npm `11.6.1` |
| Entorno hospedado probado | Ninguno para este incremento |

El QA es un agente distinto de los autores de Wallet/RPC y Backend/MCP. Escribió pruebas y este registro; no implementó el código revisado. No se descartaron cambios del árbol principal ni se copiaron secretos a los checkouts. No se publicaron builds hospedados, producción ni permisos nuevos persistentes.

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

## Plugin y Preview: bloqueo comprobado

Se inspeccionó el plugin QA de solo lectura usando `plugin-creator:update-plugin` y herramientas Plugin Creator:

- Plugin: `plugin_asdk_app_6ac2f0e3dba0819185f6754eaff8aabd`, scope `USER`, `PRIVATE`, versión `1.0.0`.
- Release observado: `PluginRelease_61587b99cbc48191a4fb023ec721b083`.
- Inventario: `.app.json` y `.codex-plugin/plugin.json`; App asociado `asdk_app_6ac2f0e3dba0819185f6754eaff8aabd`. Ninguno contiene el endpoint MCP. El paquete App-backed no acredita qué URL o SHA usa la conexión.
- Los schemas conectados de `read_personal_wallets_status` y `read_personal_wallets_balances` todavía enumeran cinco redes y no incluyen Tempo.
- Tres intentos de `Carmelita QA.get_agent_context`: dos solicitaron reintento tras autenticación; el tercero devolvió **`McpServerError: Protected by Vercel Authentication`**, sin datos de wallet.

No se desactivó protección de Vercel ni se amplió consentimiento. La siguiente validación necesita identificar la URL real de ese App, contrastar deployment/SHA y health del Preview aislado, publicar el incremento solo con autorización explícita, y actualizar el catálogo/conexión por su flujo soportado. Una llamada con `vc curl` o local no sustituye el resultado desde ChatGPT.

El coordinador leyó la configuración actual de Vercel por el CLI existente: Standard fijo, Elastic desactivado y filtro que ignora ramas distintas de `main` siguen configurados. La consulta específica de `feat/tempo-testnet-mcp` devolvió overrides de branch vacíos. Esto **no significa que falten valores genéricos de Preview**: existen nombres de configuración QA en scopes genéricos u otras ramas, cuyos valores no se leyeron para este registro. La configuración Tempo de un nuevo Preview aún no está acreditada. No se inició ningún despliegue ni se modificó el filtro o el plan.

No se ejecutaron los scripts heredados que crean PATs, perfiles o sesiones admin como efecto secundario: `gateway:preview:acceptance` crea y revoca credenciales persistentes; `wallets:preview:acceptance` requiere login admin. No son pruebas autorizadas de solo lectura.

## Aceptación real pendiente

1. Dos identidades Privy reales propias de prueba: asociar dos veces Tempo y volver a iniciar sesión; confirmar mismo wallet ID y dirección, una sola asociación por usuario/red.
2. Descubrir esa wallet desde ChatGPT con el plugin conectado al Preview exacto y SHA probado. Consultar `read_personal_wallets_status` para `tempo:moderato` y comparar con servidor: dirección, 42431, token, monto bruto/formateado, bloque, hash, hora y explorer.
3. A manipula IDs/address/userId/context de B, y B hace lo mismo con A; no debe salir ningún dato de la otra wallet. Comprobar también secuencia A-B-A y cualquier caché.
4. Revocar el token real de prueba por el flujo autorizado y repetir petición HTTP/MCP: 401/403 según contrato, sin wallet ni secretos. No modificar autorizaciones reales ajenas.
5. Abrir la ruta real de explorer de la misma dirección. Cero saldo y ausencia de historial son válidos; no afirmar despliegue, fondeo ni actividad.
6. Apagar flag Tempo: no lectura RPC Tempo ni descubrimiento; conservar bindings y flujos de las redes existentes. Reencender en el Preview autorizado y repetir lectura.

Fase A no puede marcarse `done` mientras falten estos puntos de punta a punta. La demo solo debe mostrar resultados efectivamente obtenidos; véase `docs/tempo/demo.md`.
