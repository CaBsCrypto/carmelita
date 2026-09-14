# Carmelita: aceptación de sesiones y aislamiento de recibos

Fecha: **9 de septiembre de 2026, UTC**. Continuación de [PR #28](https://github.com/CaBsCrypto/carmelita/pull/28), sin reemplazar sus cortes históricos.

**Corte histórico previo al pago.** El [cierre posterior del pago Stellar, entrega, repetición, recuperación y aislamiento](STELLAR-PAYMENT-ACCEPTANCE-2026-09-09.md) conserva su propia versión y evidencia; no reemplaza los resultados de este documento.

**Estado en este corte: recuperación de ambas cuentas y ambos administradores aceptados; pago real pendiente.** La nueva pantalla de aislamiento está implementada y verificada localmente en `51f21e1f37cc003d39e57a60644864e14881c8b6`. No se ha enviado ningún pago durante este corte.

## Versión observada y sesiones

Las comprobaciones de navegador de esta sección corresponden exclusivamente a `6be6bc5dba14b85ebf51dc33f3bc4e0ef1be4ebb`, desplegado en [Preview inmutable](https://agente-asistente-7adi10rft-cabscryptocontacto-6028s-projects.vercel.app). La rama conserva [su alias de Preview](https://agente-asistente-git-f-22838e-cabscryptocontacto-6028s-projects.vercel.app/preview-acceptance).

La cuenta A corresponde al primer usuario de prueba y la B al segundo. Los correos, identificadores de usuario, direcciones y credenciales no se incluyen en esta evidencia pública. El baseline privado original se conserva para comparar todas las identidades.

| Comprobación | Estado | Evidencia y límite |
| --- | --- | --- |
| Cuenta B después de cierre e ingreso explícitos | Aprobado | A las 08:19:46.080 UTC, 14/14 controles. Conservó la referencia anterior al cierre del 8 de septiembre, 09:03:58.507 UTC, en la misma pestaña y versión. |
| Cinco redes y rechazo administrativo de B | Aprobado | Misma identidad EVM en Fuji, BNB y Base; Stellar y Solana separadas. HTTP 403 al intentar abrir sesión administrativa. |
| Identidades originales y asociaciones | Aprobado | A las 08:20:48.101 UTC, 30/30 controles de sólo lectura contra QA: dos usuarios, seis billeteras originales, diez asociaciones, propietarios y direcciones conservados. |
| Registros financieros | Aprobado para ausencia de cambios | Cero pagos, acciones Stellar, solicitudes de faucet e intenciones de comercio en ese corte. Historial de 22 migraciones. |
| Cuenta A antes de su nuevo cierre | Aprobado con recuperación pendiente | A las 08:25:33.111 UTC: 13 controles aprobados y uno pendiente. La primera ejecución guardó una referencia; no acredita conservación anterior por sí sola. |
| Cinco redes y rechazo administrativo de A | Aprobado | Lecturas correctas, cinco asociaciones y HTTP 403 al intentar abrir sesión administrativa. |
| Cierre de ambas sesiones de A | Aprobado | La pantalla mostró «Cuenta: Sin sesión» y «Sesiones de administrador y Privy cerradas». Se abrió después un ingreso explícito en Privy para la misma cuenta. |
| Recuperación de A después de su nuevo ingreso | Aprobado | A las 08:31:42.523 UTC, 14/14 controles, con la misma referencia de las 08:25:33.111 UTC. Se observó el cierre anterior y un nuevo ingreso explícito de Privy; no fue una recarga. |
| Primer administrador, 08:35–08:36 UTC | Aprobado | Ingreso mediante `/admin/login`, identidad administrativa visible, dos usuarios, seis billeteras, diez asociaciones, filtros BNB/Base y cero conflictos. Cierre de ambas sesiones y retorno al login al abrir el registro protegido. |
| Segundo administrador, 08:37–08:38 UTC | Aprobado | Misma revisión visible con su propia identidad, después de cerrar la anterior. Filtros correctos y registro protegido al salir. Ningún administrador pasó por el bootstrap de usuarios. |
| Base después de los ciclos y revisión administrativa | Aprobado | A las 08:38:05.653 UTC, 30/30 controles: seis identidades originales, diez asociaciones, dos usuarios, 22 migraciones y todos los contadores financieros en cero. |

Los archivos locales `work/multichain-session-b-browser-20260909.json`, `work/multichain-session-b-db-20260909.json`, `work/multichain-session-a-before-logout-20260909.json` y `work/multichain-session-a-browser-20260909.json` conservan los resultados por comprobación. La referencia completa de identidades permanece en `work/evm-preview-before.json`, excluida de Git.

La evidencia administrativa sanitizada y la lectura final se conservan en `work/multichain-admin-browser-20260909.json` y `work/multichain-session-final-db-20260909.json`. [El reporte publicado](audits/sessions-receipts-preview-2026-09-09/evidence.json) reúne los resultados por comprobación sin correos, direcciones, identificadores Privy ni credenciales.

## Ajuste de aislamiento de recibos

`/preview-acceptance` añade el modo **Aislamiento de recibos Stellar**. La página continúa protegida por la condición de servidor de Preview y la comprobación de base aislada. El control exige un UUID válido, sesión Privy y metadatos completos de la versión antes de consultar el recibo.

Consulta primero `GET /api/agent/x402?paymentId=…`. Sólo si recibe HTTP 404 solicita `POST /api/agent/x402` con `action: "reconcile"` y el mismo ID. Cualquier otro estado impide considerar el rechazo como aprobado; un GET inesperado también impide el POST. No lee ni conserva cuerpos de recibos, incluso ante una respuesta 200 indebida.

El control no prepara, ejecuta ni firma pagos. Los tokens permanecen en memoria dentro de la aplicación y no forman parte del reporte. Cancelar, cambiar de cuenta, modo o identificador invalida respuestas anteriores. Cada comprobación incluye fecha, commit y despliegue; una comprobación final exige que la versión y la base sigan siendo las mismas.

**Dos HTTP 404 no prueban por sí solos que el pago exista.** El reporte conserva `ownershipValidation: "external_required"`. El UUID debe proceder del pago real verificado de B, y el rechazo se comprobará desde A. Un UUID ficticio sirve para probar la interfaz, pero no sustituye esa aceptación real.

No se añadieron APIs, migraciones ni dependencias. Se conservaron los ciclos de ambas cuentas en su versión original antes de publicar la nueva interfaz; un despliegue intermedio habría cambiado la clave de sus referencias de billeteras.

## Validación del ajuste

| Comprobación | Estado | Alcance |
| --- | --- | --- |
| Pruebas específicas | Aprobado | 12/12 nuevas: UUID, sesión, salud de Preview, códigos inesperados, redirecciones, errores y cancelación durante token o respuesta tardía. |
| Regresión de billeteras | Aprobado | 19/19 en el corte conjunto con los siete controles existentes. |
| Revisión independiente | Aprobado | Sin hallazgos bloqueantes; revisión de alcance, lectura de cuerpos, cancelación y evidencia. |
| Lint completo, 08:28:50 UTC | Aprobado | Cero errores y advertencias. |
| Suite completa y build, 08:30:07 UTC | Aprobado | 575 pruebas: 573 aprobadas, cero fallos y dos omisiones externas. Build y TypeScript completos. |
| Instalación limpia | Verificación anterior conservada | Aprobada en la entrega del 8 de septiembre; no se repite porque dependencias y lockfile no cambiaron. |
| Graphify AST | Actualizado con cobertura parcial | 433 archivos, 2.939 nodos, 6.979 relaciones y 146 comunidades. Los 22 SQL siguen sin extracción por ausencia de `tree_sitter_sql`; no se afirma actualización semántica de documentos. |
| Publicación y aceptación real del control | Pendiente | Falta desplegar la misma PR y verificar su versión. No existe aún un pago real en esta entrega. |

Los logs locales son `work/receipt-acceptance-test-build-20260909.log`, `work/receipt-acceptance-lint-20260909.log` y `work/receipt-acceptance-graphify-20260909.log`. Las omisiones externas conservan sus motivos: los smokes de Avalanche MCP y Dexalot Testnet requieren activación explícita mediante `AVALANCHE_MCP_LIVE=1` y `DEXALOT_LIVE=1` respectivamente.

Las pruebas locales no contactan al proveedor, no firman y no ejecutan transacciones. Los fallos de red, reinicio, concurrencia y recuperación del motor Stellar siguen acreditados por [la evidencia local del 8 de septiembre](MULTICHAIN-STELLAR-RECOVERY-2026-09-08.md), sin presentarlos como pruebas reales nuevas. La [evidencia histórica de chat y memoria](real-user-preview-acceptance-2026-09-08.md) conserva su versión original.

## Trabajo pendiente

1. Publicar el ajuste en la misma PR y verificar commit, Preview y aislamiento.
2. Volver a B y consultar cuenta Stellar, trustline y saldo. Si falta un requisito, el pago queda pendiente sin fondos ni trustlines automáticas.
3. Preparar la demo fija GET, `exact`, USDC oficial Testnet, patrocinio y máximo 0,01 USDC. La aprobación concreta y firma serán realizadas por el usuario en Carmelita y Privy.
4. Verificar un débito exacto y entrega completa, repetir el mismo ID sin segundo débito, recuperar el registro después de cerrar sesión y comprobar desde A los dos rechazos HTTP 404 sobre ese pago real.

Producción y Bazaar permanecen fuera de esta entrega. Se conservan usuarios, billeteras, asociaciones y el futuro recibo. Si hay pago confirmado sin contenido, el estado será «Pagado, entrega pendiente», sin otro envío.
