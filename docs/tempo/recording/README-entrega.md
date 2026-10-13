# Carmelita × Tempo — paquete para grabación

**LISTO PARA GRABAR un recorrido del producto con lecturas reales registradas; nueva ejecución local/MCP sigue bloqueada.** Se obtuvo una lectura UI nueva de A a `06:14:27.476Z` / 03:14 Chile en una ventana específica autorizada. La parte ChatGPT usa la respuesta auténtica anterior de `04:44:01Z`, claramente identificada. La ventana terminó y no debe iniciarse otra consulta. El paquete se terminó después del objetivo ideal03:20; cierre comunicado por PM06:59UTC/03:59Chile. No se verifica ni promete elegibilidad externa.

## Commit y URLs reales

- Rama: `feat/tempo-testnet-mcp`; [PR #58](https://github.com/CaBsCrypto/carmelita/pull/58), draft, sin merge.
- **Código del producto/Preview para grabar: `5a5fec953911292abc93973723c1bb76469d79f3`**. Runtime `b268649a8e4dc72b7bd5993bdc68da7d1e6b6862`; el fixture React se corrigió después. Los cierres posteriores solo cambian documentación/evidencia.
- Producto: https://carmelita-chat-first-qa.vercel.app/preview-acceptance. La pestaña ya abierta conserva UI y sesión de A, con lectura **registrada** de `06:14:27.476Z`, bloque39375318, saldo0PathUSD. El RPC histórico independiente confirmó ese bloque/saldo a06:25:23Z. No se obtuvo una lectura nueva después del cierre.
- URL inmutable del mismo Preview: https://agente-asistente-2rklylqyj-cabscryptocontacto-6028s-projects.vercel.app/preview-acceptance. Protegida por Vercel; no se validó abrirla como usuario nuevo.
- ChatGPT, respuesta anterior auténtica: https://chatgpt.com/c/6acdb6c2-413c-83e9-a081-e596f320a021. Requiere la cuenta propietaria de la conversación. No invocar de nuevo la App revocada para este recorrido.
- Local, **no iniciado ni verificado accesible**: http://localhost:3001/preview-acceptance. Se necesita la configuración descrita abajo.

La URL QA pública redirige a Vercel Authentication. El origen QA temporal de Privy está retirado. La revisión automática rechazó primero reconfirmar tras el cierre/congelamiento; no se eludió ese rechazo. El PM autorizó después una ventana específica soloA hasta06:19UTC, en la que se obtuvo la lectura UI anterior. No repetir tras el nuevo cierre. La App adicional sigue rechazada por contexto de ChatGPT; son problemas distintos.

La excepción Vercel cerró automáticamente06:18:08.860Z antes del máximo. El grant nuevoA/read-context y el origen Privy se retiraron después del límite; hora UI exacta no registrada, baseline12 verificada06:23:34.117Z. No se afirma cierre completo a tiempo. El conector pidió reautenticación/reintento y no devolvió un balance MCP nuevo; no se reintentó tras retirar el alias. B/otros grants se conservaron. [Registro de la ventana](recording-window-20261013.json).

## Qué funciona y qué falta

Comprobado en el Preview5a: propietario A autenticado, wallet EVM existente, asociación explícita repetida estable, discovery/balance reales anteriores desde ChatGPT y conector; B login/asociación/lectura UI reales; UI A–B–A; cuatro contrastes RPC históricos y la [lectura UI de grabación](pinned-ui-recording-20261013.json) con chain42431 y PathUSD6/saldo0.

Falta: MCP B con grant mínimo separado, negativos reales bidireccionales/contexto, audiencia entre recursos, relogin B y otros gates del [registro de validación](../validation.md). La revocación401 se correlacionó con un request/log; no se capturó el token exacto. Fase A completa no está aceptada. Pagos Tempo/Fase B no implementados.

## Instalación y arranque local exacto, condicionado a accesos existentes

Desde el checkout de integración:

```powershell
Set-Location 'C:\Users\MGC\Documents\ChatGPT\Carmelita\work\tempo-testnet-mcp'
git branch --show-current
git diff 5a5fec953911292abc93973723c1bb76469d79f3 HEAD -- app scripts package.json package-lock.json
# El diff de aplicación debe estar vacío para grabar el mismo código.
npm ci --no-audit --no-fund
node --env-file-if-exists=../../.env.local node_modules/next/dist/bin/next dev --hostname localhost --port 3001
```

`npm ci` es para una instalación nueva del checkout; el entorno de trabajo actual ya tenía dependencias usadas en el build en el directorio raíz. Para esas dependencias existentes, sustituir únicamente el ejecutable por `../../node_modules/next/dist/bin/next`. No copiar ni publicar el archivo de variables. El arranque anterior **no se ejecutó como demo operativa**, porque la comprobación booleana del runtime local encontró ausentes `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_PRIVY_APP_ID` y `DATABASE_URL`. No se imprimieron valores secretos ni se recuperaron/exportaron variables sensibles de Vercel.

Requisitos reales para esa ruta segura: `VERCEL_ENV=preview`, `CARMELITA_TEMPO_TESTNET_ENABLED=true`, `CARMELITA_PREVIEW_ISOLATED=true`; base QA separada y controles `CARMELITA_PREVIEW_DATABASE_HOST`, `CARMELITA_PREVIEW_DATABASE_URL`, `CARMELITA_PREVIEW_DATABASE_URL_UNPOOLED`, `CARMELITA_PREVIEW_ORIGIN`, `CARMELITA_PREVIEW_DEPLOYMENT`, además del par Privy de servidor y el ID público de la misma App. Mantener el host productivo de comparación. El guard exige origen HTTPS sin puerto; **no sustituirlo por localhost ni debilitarlo**. El host de acceso local y el origen configurado del guard deben documentarse por separado, sin pretender OAuth local. Ver [README técnico](../README.md).

Entrar solo por `/preview-acceptance`, modo **Tempo Moderato: asociación y lectura**. No usar `/agent` o el login heredado, que conservan bootstrap. No crear wallets, signers ni solicitar fondos. El localhost3001 ya figuraba en la lista original de Privy; eso no demuestra que el servidor tenga las credenciales necesarias.

## Comprobación pública local reproducible disponible

No requiere credenciales ni genera un build hospedado. Es un lector real del mismo código, **no una demo de UI autenticada ni ChatGPT**:

```powershell
Set-Location 'C:\Users\MGC\Documents\ChatGPT\Carmelita\work\tempo-testnet-mcp'
$env:CARMELITA_TEMPO_TESTNET_ENABLED='true'
$env:CARMELITA_PREVIEW_ISOLATED='true'
Remove-Item Env:VERCEL_ENV -ErrorAction SilentlyContinue
node --import tsx scripts/tempo-rpc-evidence.ts 0x7A33b72BddF1d6D01c279b6cC9049c5E751f9d07
```

Exige entorno local fuera de production. Se ejecutó correctamente a `06:08:34.917Z`: chain42431, bloque39374745, PathUSD6, saldo bruto/formateado0; [recibo local nuevo](local-public-rpc-20261013.json). No usó sesión QA ni OAuth. Su dato nuevo no convierte la lectura UI anterior en nueva ni acredita por sí solo propiedad Privy. No usar stdout/código como sustituto del recorrido del producto.

## Arquitectura breve y atribución

Carmelita preexistente aportaba autenticación Privy, wallets Stellar/EVM/Solana, registro SQL de propietario, gateway/herramientas MCP y OAuth Stytch. La integración Tempo añade catálogo Moderato42431/flag aislado, asociación explícita idempotente de la misma EVM, lector TIP-20 especializado con metadata/chain/block verificadas, proyección en tools existentes y consentimiento Preview que valida wallets existentes sin provisioning/Friendbot. No se inventa moneda nativa de gas ni se actualizan dependencias en bloque.

Construido en este incremento: integración Tempo y corrección de su consentimiento/SDK/página segura. El producto Carmelita y sus integraciones anteriores no se presentan como creados durante el hackathon. La atribución temporal se basa en el diff desde `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`; no acredita por sí sola requisitos de elegibilidad externos.

## Pruebas y evidencia

- Código5a: [CI38344703439](https://github.com/CaBsCrypto/carmelita/actions/runs/38344703439), 1112 PASS/0 FAIL/2 opt-in SKIP; 28 Tempo y36 OAuth existente. Tipos/lint/build PASS.
- Cierre documental cca7d26: [CI38352968116](https://github.com/CaBsCrypto/carmelita/actions/runs/38352968116), SUCCESS; aplicación sin cambios.
- [Lecturas y límites](../evidence/preview-qa-20261013.json), [RPC independiente4/4](../evidence/pinned-rpc-20261013.json), [intento de App](../evidence/dedicated-qa-attempt-20261013.json), [cierre independiente](../evidence/dedicated-qa-closeout-20261013.json).
- Dos Previews autorizados, cero builds posteriores. Standard4 fijo/extras off. No main, producción, firmas, fondeo ni pagos Tempo.

No se grabó vídeo. [Guion del producto60–120s](guion-90s.md) y [checklist de pantallas](pantallas.md). El paquete no incluye `.env`, credenciales, node_modules, correos ni IDs privados del proveedor. El código exacto está en la rama/commit del repositorio privado; no se genera un ZIP completo no auditado con históricos de terceros.
