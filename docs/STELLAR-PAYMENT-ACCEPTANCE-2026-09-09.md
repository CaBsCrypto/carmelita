# Aceptación Stellar: pago, entrega, recuperación y aislamiento

**Cierre de evidencia: 9 de septiembre de 2026, 09:05:42.805 UTC. Estado: APROBADO para este recorrido en Preview.** Se comprobaron el pago real de la demo Stellar Testnet, su entrega, repetición y recuperación de sesión sin débito adicional, además del rechazo de consulta y reconciliación desde la otra cuenta. Los [resultados por comprobación](audits/stellar-payment-acceptance-2026-09-09/evidence.json) conservan fechas, versión y despliegue.

La entrega corresponde a la [PR #28](https://github.com/CaBsCrypto/carmelita/pull/28), commit `968d780d01951bcba51d338772e88ba6fcbb39f6`, con código del control de recibos en `51f21e1f37cc003d39e57a60644864e14881c8b6`. La [Preview inmutable](https://agente-asistente-p2v0lwjat-cabscryptocontacto-6028s-projects.vercel.app) y el [CI del commit exacto](https://github.com/CaBsCrypto/carmelita/actions/runs/34330501829) están verificados; CI terminó el 9 de septiembre a las 08:44:01 UTC. Ocho checks externos a las 08:44:38 UTC comprobaron versión, aislamiento, páginas y rechazos sin sesión. No se usa ese smoke como prueba del pago autenticado.

La publicación posterior de este documento no cambia el commit del pago validado ni atribuye su aceptación a una versión posterior. Los cortes de [sesiones y administración](ACCEPTANCE-SESSIONS-RECEIPTS-2026-09-09.md) y de [implementación de recuperación](MULTICHAIN-STELLAR-RECOVERY-2026-09-08.md) mantienen sus fechas y resultados originales.

## Pago aprobado y resultado

La cuenta B aprobó la operación concreta en el recorrido visible de Carmelita y Privy, según la confirmación del operador de aceptación en esta sesión. La ficha preparada quedó registrada a las 08:51:29 UTC; esa ficha por sí sola no prueba consentimiento. No se recibió una hora exacta separada de la aprobación y no se inventa una.

El recurso fue la demo fija `https://stellar.org/x402-demo/api/protected/testnet`: GET, x402 v2, esquema `exact`, USDC oficial de Stellar Testnet, importe `0.0100000` USDC y comisiones patrocinadas. La aprobación preparada vencía a las 08:55:09.306 UTC. La cuenta y trustline autorizada ya existían al tomar la referencia; no se solicitaron nuevos fondos ni trustlines en esta ronda.

| Comprobación | Antes | Después del pago | Después de repetir |
| --- | --- | --- | --- |
| Hora UTC, 9 de septiembre | 08:49:06.273 | 08:53:47.195 | 08:54:46.835 |
| Saldo USDC | 0.4900000 | 0.4800000 | 0.4800000 |
| Saldo XLM | 9999.9999800 | 9999.9999800 | 9999.9999800 |
| Pagos de B / total Preview | 0 / 0 | 1 / 1 | 1 / 1 |
| Evidencia de lectura | 4/4 PASS | 16/16 PASS | 17/17 PASS |

El primer débito observado fue exactamente `0.0100000` USDC. El botón visible «Verificar protección contra duplicados» devolvió el mismo pago y recibo; el verificador posterior confirmó `0.0000000` USDC de débito adicional, el mismo ID, transacción y hash del cuerpo, sin otra fila de pago.

Después de cerrar sesión B e ingresar nuevamente con Privy, «Recibo x402» mostró que se recuperó el pago original. «Consultar estado del pago» volvió a confirmar pago y entrega. La lectura independiente de las 08:57:23–08:57:24 UTC dio **17/17 PASS**: mismo ID, transacción y SHA, un solo registro de pago, saldo USDC `0.4800000`, XLM sin cambio y débito adicional cero respecto del primer resultado.

Pago `b6a6bb7f-1a96-46d0-8056-bfbc66204415`, propietario B: `status=confirmed`, `paymentState=confirmed`, `deliveryState=received`. La transacción es `d09a654b2e0efcc0742d46de9bad11703b8b7dc29aa5631a62dd99e7ce5e50f4`. El resultado HTTP 200 conserva **6.851 bytes** y SHA-256 `16bf56dcb79dd7b26e1b155ed51857a46a90e931894f5f366b1622312916fc94`. Se comprobó el cuerpo completo; el extracto de presentación no sustituyó su integridad. Este documento no reproduce su contenido ni direcciones o identidades privadas.

Las fuentes originales `stellar-real-payment-before-20260909.json`, `stellar-real-payment-after-20260909.json`, `stellar-real-payment-replay-20260909.json` y `stellar-real-payment-recovered-20260909.json` se conservan en `work/`. Sus resultados sanitizados por check están incorporados en la [evidencia publicada](audits/stellar-payment-acceptance-2026-09-09/evidence.json), junto con los controles públicos, el aislamiento y las lecturas finales.

## Qué verifica cada capa

Carmelita realizó la verificación exacta mediante el RPC de Stellar Testnet: transacción, autorización, nonce, condiciones de transferencia y patrocinio de comisiones. Esa prueba se conserva en la aplicación.

El verificador independiente usó SELECT en una transacción de solo lectura y consultas al Horizon oficial Testnet. Comprobó que el pago pertenece a B, la consistencia de la prueba persistida, el recibo, el cuerpo completo y su SHA-256, además de la diferencia exacta del saldo a siete decimales. **No volvió a ejecutar una verificación criptográfica independiente del XDR.** La lectura HTTP separada del despliegue vincula esta evidencia con la versión publicada.

El saldo representa una diferencia neta observada: no excluye actividad concurrente compensatoria. Base de datos y Horizon se leen sucesivamente y no forman una instantánea atómica entre sistemas.

## Controles previos conservados con su versión

La aceptación visible multichain se cerró en `6be6bc5dba14b85ebf51dc33f3bc4e0ef1be4ebb`, antes del nuevo despliegue: B obtuvo 14/14 a las 08:19:46 UTC y A 14/14 a las 08:31:42 UTC tras cierre e ingreso explícitos, conservando sus referencias. Ambos administradores accedieron por `/admin/login`, comprobaron filtros BNB/Base y el registro, y volvieron al login protegido tras salir. Su evidencia se registró a las 08:39:54 UTC después del flujo observado, no como hora exacta de cada clic.

La lectura QA de las 08:38:05 UTC dio 30/30: dos usuarios, seis billeteras originales, diez asociaciones, 22 migraciones y cero registros financieros **en ese corte previo al pago**. Esa cifra histórica no se reemplaza ni se presenta como el estado posterior, que ahora contiene un pago.

La suite local del ajuste de recibos tuvo 575 pruebas: 573 aprobadas, cero fallos y dos omisiones externas explícitas, con lint y build/TypeScript aprobados. Se conservan `receipt-acceptance-test-build-20260909.log` y `receipt-acceptance-lint-20260909.log`; el CI posterior incluye instalación limpia. Los smokes omitidos son Avalanche MCP y Dexalot Testnet, habilitados separadamente por sus flags. Graphify AST registró 433 archivos, 2.939 nodos y 6.979 relaciones; la cobertura sigue parcial por 22 SQL sin parser y no se declara renovada la semántica documental.

Los 23/23 checks SQL del motor Stellar corresponden al 8 de septiembre, código `912db90`, sobre fixtures sintéticos aislados. La concurrencia y las respuestas inciertas, contradictorias o alteradas se probaron localmente y en esos fixtures. **Esta aceptación no indujo nuevos fallos reales de proveedor, timeout ni reinicio durante el envío.**

## Aislamiento, estado final y conservación de evidencia

Después de cerrar B e ingresar explícitamente como A, el control de recibos obtuvo **6/6 PASS** a las 09:03:02.990 UTC. GET del UUID real de B devolvió 404 a las 09:03:02.474 UTC; POST `reconcile` devolvió 404 a las 09:03:02.795 UTC. El contenido de las respuestas no se leyó. La prueba independiente de B acredita que el UUID existe y pertenece a B; así se satisface la condición que el panel mantiene como `external_required`. El resultado original del panel se conserva sin modificarlo.

La lectura posterior al aislamiento dio **17/17 PASS** a las 09:04:36.945 UTC: mismo pago, transacción y SHA, saldo USDC `0.4800000`, XLM `9999.9999800` y débito adicional `0.0000000`. La lectura final de identidades, registrada a las 09:04:35.921 UTC, dio **30/30 PASS**: dos usuarios, las seis billeteras originales, diez asociaciones, 22 migraciones, un pago y cero acciones Stellar, solicitudes de faucet o intenciones de comercio. Cada usuario conserva sus tres billeteras y cinco redes; las redes EVM comparten su identidad original.

Las fuentes son `stellar-real-receipt-isolation-20260909.json`, `stellar-real-payment-after-isolation-20260909.json` y `stellar-payment-final-wallets-20260909.json`. La evidencia publicada incluye cada check; los controles de identidades que no tienen hora individual se identifican con la hora de generación del reporte, sin inventar precisión.

No se crearon mensajes ni memorias ficticios nuevos. La inspección de limpieza de las 09:00:43–09:00:44 UTC identificó la pareja exacta de mensajes de solicitud/respuesta vinculada históricamente al pago mediante `requestId` e `idempotency_key`; se conservan ambos como evidencia. No se los trata como fixtures descartables ni se eliminan registros. El reporte público conserva esta decisión sin publicar mensajes, marcadores, identidades ni credenciales.

Un pago verificado puede conservar entrega pendiente si se pierde el cuerpo antes de persistirlo. La cadena no reconstruye ese contenido y la recuperación no debe iniciar otro cobro. La entrega efectiva de esta operación está comprobada; ese caso límite sigue teniendo su aceptación de fallos separada.

La comprobación final de producción, registrada a las 09:05:42.805 UTC, confirma el mismo despliegue `dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG`, en estado READY. Bazaar permanece intacto y fuera del consumo probado. Chat y memoria conservan sus evidencias históricas independientes.

Este cierre acepta la demo fija Stellar Testnet. Descubrimiento y consumo desde Bazaar quedan como el siguiente bloque de implementación y aceptación; otros proveedores, redes y Mainnet conservan su evaluación independiente.
