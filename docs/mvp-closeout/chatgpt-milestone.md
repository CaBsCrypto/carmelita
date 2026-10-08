# Milestone ChatGPT: conexión y wallets propias

Fecha de este expediente: **8 de octubre de 2026**. Base de código comprobada: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542` en `main` y `https://carmelita.browns.studio`.

**El recorrido básico funciona según una prueba externa real y el respaldo remoto se restauró correctamente; la aceptación humana completa sigue pendiente.** Este documento no anuncia una nueva publicación ni disponibilidad de compras o Claude.

## Recorrido demostrado

El tester **CGPT-01**, con su propia identidad, pudo registrarse, autorizar Carmelita desde ChatGPT y listar sus wallets. El usuario reportó ese resultado el **7 de octubre de 2026, America/Santiago**. Una comprobación privada posterior corroboró las cinco asociaciones de red y la cuenta Stellar activa en Testnet.

Las redes son Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet. Las tres primeras comparten una dirección EVM; Solana y Stellar tienen sus propias direcciones. Stellar se prepara automáticamente con XLM Testnet en la misma dirección cuando Horizon confirma que falta la cuenta. XLM es nativo y no requiere trustline.

El SHA productivo fue corroborado en el corte de la jornada; **no se capturó independientemente el SHA de cada llamada histórica del tester**. Su correo, DID, direcciones y capturas privadas no forman parte del expediente público. No consta todavía aceptación humana de móvil, cancelación, revocación, reconexión o aislamiento entre dos identidades.

## Entrega de esta jornada

| Entregable | Estado |
| --- | --- |
| Matriz, checklist y guía Stellar coherentes con `caa3cd3` | Preparados y revisados; aceptación humana restante explícita |
| PR documental `codex/chatgpt-milestone-closeout` | [PR56](https://github.com/CaBsCrypto/carmelita/pull/56), draft y sin fusionar; SHA y CI finales registrados allí |
| Check obligatorio `local-quality` y protección de administradores | Configurados; comprobación final registrada en la matriz |
| Respaldo privado `CaBsCrypto/carmelita-recovery` | Aprobado en `810c2589`; clonado de GitHub y restaurado, Actions desactivado y sin Vercel |
| Manifiestos SHA256 y reconstrucción de 29 archivos worker + 4 OAuth | Aprobado: 73 archivos y seis bundles verificados; [recibo saneado](./evidence/recovery-restoration-20261008.json) |
| PR43–45 incorporados y PR36 sustituido | Cerrados con equivalencia, cobertura y seguimiento; ramas conservadas |
| Etiqueta del piloto y límites aceptados | `chatgpt-wallets-pilot-2026-10-07` anotada sobre `caa3cd3`; no declara aceptación completa |
| Aceptación humana restante | Pendiente con CGPT-01 y CGPT-02 |

El [recibo público saneado](./evidence/chatgpt-local-tests-20261008.json) registra 167/167 tests enfocados aprobados, sin fallidos ni omitidos, sobre el código funcional de `caa3cd3`. La [protección de `main`](./evidence/main-protection-20261008.json) exige PR y calidad, incluidos administradores. El CI completo aprobó `bbdf813`: siete tests Graphify, 1048 tests de aplicación, dos probes vivos omitidos, lint y build. Su [recibo con SHA](./evidence/documentation-ci-20261008.json) identifica esa revisión; el check del head documental posterior y su SHA final se registran en PR56. La documentación no modifica el código desplegado.

El respaldo conserva historial publicado, snapshots pendientes, bases de restauración, políticas y manifiestos. Excluye credenciales, bases de datos, listados personales y reportes privados de usuarios Neon/Privy; la historia original conserva contactos ya públicos y autoría Git. Actions permanece desactivado y el repositorio de recuperación separado de Vercel. Véase [respaldo y controles comprobados](./github-recovery-closeout.md). Recuperar Neon, identidades Privy y configuración secreta requiere procedimientos adicionales; este respaldo protege **código y evidencia**.

La etiqueta [chatgpt-wallets-pilot-2026-10-07](https://github.com/CaBsCrypto/carmelita/tree/chatgpt-wallets-pilot-2026-10-07) fija un ancla recuperable del código `caa3cd3`. Su anotación limita la aceptación al registro, autorización y listado reportados por CGPT-01; mantiene las pruebas humanas restantes pendientes. Los cierres y equivalencias se detallan en [Clasificación de ramas](./branch-dispositions.md).

## Ficha breve para 500 LatAm

**Carmelita conecta una identidad y sus wallets con una conversación en ChatGPT.** La primera prueba externa demostró registro, autorización y consulta de wallets propias en cinco redes de prueba. Una identidad mantiene la misma dirección EVM en Avalanche Fuji, Base Sepolia y BNB Testnet, además de wallets Solana y Stellar. La preparación incluye activación automática de Stellar Testnet con XLM, confirmada por la red.

La conexión se instala manualmente siguiendo la guía de Carmelita y el consentimiento OAuth. Las lecturas privadas usan permisos acotados; consultar wallets no autoriza pagos. El catálogo Bazaar se ofrece para descubrir información, con disponibilidad de proveedores explícita; este milestone no acredita compra ni ejecución de servicios.

**Pendientes antes de declarar cierre completo:** celular real, cancelación/reintento, revocación, reconexión con las mismas direcciones y aislamiento de dos identidades. El respaldo remoto ya se restauró; el resultado del CI obligatorio se registra en el PR. Claude, integración de servicios MCP, USDC y compras continúan en fases separadas. Hay dos excepciones Stellar legacy bajo seguimiento; la prueba del nuevo tester no afirma activación de todas las cuentas históricas.

El material queda preparado para revisión; el usuario realiza el envío a 500 LatAm. No se registra envío ni aprobación de la aceleradora.

## Próxima prueba y publicación

Usar el [checklist externo](./external-tester-checklist.md) con dos identidades propias. Registrar cada caso como aprobado, fallido o pendiente, conservando los datos personales en privado.

El cierre completo requiere aceptación humana restante, CI obligatorio, clasificación de PRs y restauración remota. La preparación, CI y respaldo de esta jornada **no autorizan fusión a `main`, builds ni deploys en Vercel**. La publicación seguirá pendiente de revisar Billing y acordar una publicación concreta. Conservar el despliegue actual y los worktrees; no limpiar masivamente ramas con trabajo pendiente.
