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
| SHA de código probado | Pendiente de integración y ejecución |
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
| `tests/tempo-rpc.test.ts` | Chain ID antes de token, bloque explícito único, código/metadata, cero medido, precisión superior a Number, ABI inválido, error JSON-RPC HTTP 200, timeout y secretos | Pendiente de ejecución integrada |
| `tests/tempo-wallet-onboarding.test.ts` | Identidad EVM estable, asociación repetida, owner ajeno, wallet ausente, no creación, chain inválida antes de persistencia, auth revocada 401, selectors manipulados | Pendiente de ejecución integrada |
| `tests/tempo-mcp-owner-read.test.ts` | Esquemas centrales compatibles, scope, principal, A-B-A, filtrado owner, sin native gas, mismatch y proyección sin datos privados | Pendiente de ejecución integrada |
| `tests/tempo-feature-rollback.test.ts` | Default off, aislamiento, producción bloqueada, TIP-20, apagado/reencendido conserva registro y redes existentes | Pendiente de ejecución integrada |

Comandos a ejecutar en la rama integrada, sin cargar archivos de credenciales:

```powershell
node --import tsx --test tests/tempo-rpc.test.ts tests/tempo-wallet-onboarding.test.ts tests/tempo-mcp-owner-read.test.ts tests/tempo-feature-rollback.test.ts
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

El registro final debe reemplazar estados pendientes por comando, resultado, fecha y SHA ejecutados. Las pruebas heredadas relevantes incluyen `erc20-balance-validation`, `wallet-readings`, `personal-query-parity`, `multichain-wallets`, `wallet-persistence-hardening`, `evm-network-expansion`, `mcp-gateway`, `personal-mcp-token`, `stytch-oauth-resource`, `preview-isolation` y `chatgpt-connection-readiness`.

## Plugin y Preview: bloqueo comprobado

Se inspeccionó el plugin QA de solo lectura usando `plugin-creator:update-plugin` y herramientas Plugin Creator:

- Plugin: `plugin_asdk_app_6ac2f0e3dba0819185f6754eaff8aabd`, scope `USER`, `PRIVATE`, versión `1.0.0`.
- Release observado: `PluginRelease_61587b99cbc48191a4fb023ec721b083`.
- Inventario: `.app.json` y `.codex-plugin/plugin.json`; App asociado `asdk_app_6ac2f0e3dba0819185f6754eaff8aabd`. Ninguno contiene el endpoint MCP. El paquete App-backed no acredita qué URL o SHA usa la conexión.
- Los schemas conectados de `read_personal_wallets_status` y `read_personal_wallets_balances` todavía enumeran cinco redes y no incluyen Tempo.
- Tres intentos de `Carmelita QA.get_agent_context`: dos solicitaron reintento tras autenticación; el tercero devolvió **`McpServerError: Protected by Vercel Authentication`**, sin datos de wallet.

No se desactivó protección de Vercel ni se amplió consentimiento. La siguiente validación necesita identificar la URL real de ese App, contrastar deployment/SHA y health del Preview aislado, publicar el incremento solo con autorización explícita, y actualizar el catálogo/conexión por su flujo soportado. Una llamada con `vc curl` o local no sustituye el resultado desde ChatGPT.

No se ejecutaron los scripts heredados que crean PATs, perfiles o sesiones admin como efecto secundario: `gateway:preview:acceptance` crea y revoca credenciales persistentes; `wallets:preview:acceptance` requiere login admin. No son pruebas autorizadas de solo lectura.

## Aceptación real pendiente

1. Dos identidades Privy reales propias de prueba: asociar dos veces Tempo y volver a iniciar sesión; confirmar mismo wallet ID y dirección, una sola asociación por usuario/red.
2. Descubrir esa wallet desde ChatGPT con el plugin conectado al Preview exacto y SHA probado. Consultar `read_personal_wallets_status` para `tempo:moderato` y comparar con servidor: dirección, 42431, token, monto bruto/formateado, bloque, hash, hora y explorer.
3. A manipula IDs/address/userId/context de B, y B hace lo mismo con A; no debe salir ningún dato de la otra wallet. Comprobar también secuencia A-B-A y cualquier caché.
4. Revocar el token real de prueba por el flujo autorizado y repetir petición HTTP/MCP: 401/403 según contrato, sin wallet ni secretos. No modificar autorizaciones reales ajenas.
5. Abrir la ruta real de explorer de la misma dirección. Cero saldo y ausencia de historial son válidos; no afirmar despliegue, fondeo ni actividad.
6. Apagar flag Tempo: no lectura RPC Tempo ni descubrimiento; conservar bindings y flujos de las redes existentes. Reencender en el Preview autorizado y repetir lectura.

Fase A no puede marcarse `done` mientras falten estos puntos de punta a punta. La demo solo debe mostrar resultados efectivamente obtenidos; véase `docs/tempo/demo.md`.
