# Matriz de evidencia y aceptación de ChatGPT

Corte documental: **8 de octubre de 2026**. Este cierre cubre conectar Carmelita, autorizar y consultar wallets propias. Claude, compras y ejecución de servicios MCP continúan por separado.

**Estado general: recorrido básico demostrado por una persona externa; cierre completo pendiente.** No se transfieren resultados de escritorio a celular, cancelación, revocación o aislamiento. Esta jornada prepara documentación, CI y recuperación sin fusionar a `main` ni generar builds o despliegues en Vercel.

## Versiones y fuentes

| Referencia | Versión o resultado | Límite |
| --- | --- | --- |
| Código en `main` y producción comprobada | `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542` | La consulta de `/api/health` identifica el despliegue observado; no identifica retrospectivamente cada llamada de un cliente |
| Producción | `https://carmelita.browns.studio` | Mantener el origen y el endpoint productivo durante la aceptación; una guía QA no prueba ese entorno si copia producción |
| Endpoint MCP personal | `https://carmelita.browns.studio/api/mcp/agent` | URL pública, sin tokens ni credenciales |
| Prueba externa CGPT-01 | Reportada por el usuario el 7 de octubre de 2026, America/Santiago: alta, autorización y listado de wallets propias | El SHA exacto de sus llamadas ChatGPT no se capturó independientemente; la producción fue corroborada en el corte posterior |
| Documento de esta jornada | Rama `codex/chatgpt-milestone-closeout`, basada en el `main` anterior | SHA final y PR documental pendientes de registrar; ese SHA no es una nueva versión desplegada |
| CI de la jornada | Pendiente de enlace, SHA y resultado final | El CI de una versión anterior no acredita el PR documental ni su restauración |

CGPT-01 es un seudónimo. La correspondencia con una identidad real y las comparaciones de direcciones permanecen privadas; estos documentos no publican correos, DID, direcciones personales, credenciales ni capturas de la sesión.

## Casos del milestone

Cada caso tiene un estado independiente: **Aprobado**, **Fallido** o **Pendiente**. La columna de evidencia distingue una comprobación técnica de un resultado humano. Un caso pendiente no significa que haya fallado.

| Caso | Estado | Evidencia y alcance | Qué falta |
| --- | --- | --- | --- |
| Correspondencia `main` y dominio productivo | Aprobado | SHA `caa3cd3` comprobado mediante salud de producción y GitHub en el corte de esta jornada | Repetir la identificación al registrar los nuevos casos humanos |
| Alta, autorización y listado desde ChatGPT | Aprobado | CGPT-01 completó el recorrido y listó sus wallets, según la prueba real reportada por el usuario | Capturar versión y cliente de la próxima prueba sin datos personales |
| Cinco redes registradas | Aprobado | Registro de CGPT-01 corroborado privadamente: Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet | Comparar nuevamente desde móvil y al reconectar |
| Dirección EVM compartida | Aprobado | Las tres redes EVM usan la misma wallet; Solana y Stellar tienen sus propias direcciones | Conservar esa correspondencia después de revocar y reconectar |
| Activación Stellar del nuevo tester | Aprobado | Auditoría privada de Horizon confirmó la cuenta Testnet y XLM nativo en el corte; la observación no publica dirección ni saldo personal | No extrapolar este resultado a todas las cuentas ni a futuros proveedores disponibles |
| Celular con la misma cuenta ChatGPT | Pendiente | La prueba reportada no acredita un teléfono real | CGPT-01 o CGPT-02 consulta sus wallets desde el celular y registra cliente/fecha/versión |
| Cancelación y reintento OAuth | Pendiente | Cobertura técnica aprobada; falta recorrido humano en la versión identificada | Cancelar antes de autorizar y repetir sin duplicar identidad ni direcciones |
| Revocación desde Carmelita | Pendiente | Cobertura técnica aprobada de Connected Apps y tokens | La conexión revocada debe rechazar una consulta privada nueva |
| Reconexión con las mismas direcciones | Pendiente | Provisión idempotente implementada; no consta aceptación humana de reconexión | Volver a autorizar la misma identidad y comparar las cinco asociaciones en privado |
| Aislamiento entre dos identidades | Pendiente | Pruebas por propietario y alcance aprobadas; registros separados corroborados privadamente | CGPT-01 y CGPT-02 comprueban que sólo reciben sus wallets y actividad |
| Respuesta tardía tras cambiar de usuario | Pendiente | Recuperación y descarte por sesión aprobados localmente | Registrar comprobación humana del cambio de sesión; no inducir fallos en producción |
| Stellar no disponible y recuperación local | Aprobado | Tests controlados de activación, reserva persistente y reconciliación de la misma dirección, sobre el código de `caa3cd3` | Esta evidencia técnica no garantiza disponibilidad de los proveedores ni sustituye pruebas humanas |
| Catálogo y actividad desde móvil | Pendiente | Catálogo público y consultas propias existen; actividad vacía puede ser válida | Registrar respuesta real, incluidos estados parciales o indisponibles de Bazaar |
| Teclado, 320 px y zoom 200 % | Pendiente | Hay observaciones UI históricas; no acreditan todos los casos actuales | Asociar mediciones al SHA observado y registrar idioma y dispositivo |
| Casos Stellar legacy | Pendiente | Auditoría privada detectó dos excepciones: un estado almacenado pendiente con cuenta activa en red y una cuenta aún no activa | Seguimiento y reconciliación propios; no anunciar todas las cuentas existentes como activas |
| Respaldo privado restaurado | Aprobado | Clon GitHub de `carmelita-recovery` en `810c2589`, 73 archivos verificados, seis bundles y 14 commits locales; 29 archivos worker + cuatro OAuth restaurados sobre `bded469` | [Recibo de restauración](./evidence/recovery-restoration-20261008.json); no acredita recuperación de Neon o Privy |
| Protección de `main` | Aprobado | PR obligatorio y `local-quality` de GitHub Actions requerido, rama al día y protección aplicada a administradores; force-push y borrado bloqueados. [Lectura de configuración](./evidence/main-protection-20261008.json) | Reconfirmar lectura final; cero aprobaciones de terceros exigidas mientras exista un único colaborador |
| PRs históricos clasificados | Aprobado | PR43–45 cerrados como incorporados; PR36 cerrado como sustituido, con cobertura y seguimiento citados en sus comentarios | Ramas conservadas; PR49 y worker siguen separados. Véase [Clasificación de ramas](./branch-dispositions.md) |
| CI del PR documental | Pendiente | Check obligatorio `local-quality` | Enlace a corrida aprobada y SHA exacto; el PR permanece sin fusionar |
| Etiqueta y límites del piloto | Aprobado | Etiqueta anotada [chatgpt-wallets-pilot-2026-10-07](https://github.com/CaBsCrypto/carmelita/tree/chatgpt-wallets-pilot-2026-10-07) sobre `caa3cd3`, con el alcance CGPT-01 y pendientes explícitos | Es un ancla de recuperación del piloto, no aceptación completa del milestone |

## Evidencia técnica de esta jornada

El [recibo público saneado](./evidence/chatgpt-local-tests-20261008.json) registra **167/167 tests enfocados aprobados, 0 fallidos y 0 omitidos en 19 archivos**, sobre el código funcional de `main caa3cd3`: 114 de OAuth, Stellar, revocación, sesión y propietario, y 53 de paridad de mercado y cobertura histórica de PRs. Incluye comandos, horarios, archivos y límites de la corrida. No hubo inyección de fallos en producción.

| Frente | Casos que cubre | Resultado de la jornada |
| --- | --- | --- |
| `oauth-direct-registration` y `oauth-wallet-preparation` | Identidad verificada, preparación tras consentimiento, propietario, conflicto y error sin concesión falsa | Aprobado dentro de la corrida enfocada enlazada |
| `stellar-auto-activation` y `stellar-activation-onboarding` | Dirección canónica, persistencia antes de financiar, ausencia confirmada, plazos, concurrencia, respuesta incierta y confirmación en Horizon | Aprobado dentro de la corrida enfocada enlazada |
| Recurso OAuth y revocación Stytch | Scope, issuer/audience, expiración y rechazo después de revocar | Aprobado dentro de la corrida enfocada enlazada |
| Sesión y recuperación | Cancelación, respuesta tardía, conservación del borrador y lectura de recuperación sin reenvío automático | Aprobado dentro de la corrida enfocada enlazada |
| Cobertura histórica de PRs | Paridad de mercado y recuperación incorporada | Aprobado dentro de la corrida enfocada; clasificación de cierres por registrar |
| Calidad completa del PR documental | `local-quality`: tooling de Graphify, lint, tests y build en GitHub | Pendiente de corrida del PR; el build se ejecuta fuera de Vercel |

La suite completa histórica de `main` registró 1048 tests aprobados y dos omisiones explícitas de probes vivos Avalanche MCP/Dexalot. No sustituye el CI del PR documental. Los tests usan identidades y proveedores controlados; no prueban por sí solos una sesión ChatGPT móvil real.

## Límites y antecedentes

La creación de direcciones y el registro de cinco redes no equivalen a financiar todas las redes. Stellar Testnet intenta la activación automática con XLM mediante Friendbot durante la preparación autorizada; sólo una confirmación de Horizon permite presentarla activa. XLM es nativo y no necesita trustline. USDC, firmas, compras y Mainnet quedan fuera de este milestone. Véase [Guía Stellar vigente](../privy-stellar-testnet.md).

Las observaciones de Bazaar del 5 de octubre, las corridas A7/A8 y la candidata PR46 se conservan como antecedentes en [QA independiente](./qa-independent.md) y [Contrato Bazaar](./bazaar-contract.md). No acreditan catálogo actual, ejecución de Guionista ni una compra desde ChatGPT. Claude mantiene su aceptación separada en PR49. La compra nativa conserva sus requisitos de compatibilidad, contrato hospedado y firma.

La documentación no modifica permisos financieros: `agent:read` permite lectura, no pagos ni acceso automático al historial de conversaciones. El respaldo de código y evidencia no acredita recuperación de Neon, usuarios Privy, sesiones o secretos de proveedores. Sus procedimientos necesitan otra revisión. Los snapshots privados se restauran sin ejecutar código, migraciones ni deploys.

## Decisión de cierre

El milestone completo sigue **pendiente** hasta registrar la aceptación humana restante, CI obligatorio, clasificación de PRs y restauración remota. No se cierra por agotar una jornada o un plazo. La ficha para 500 LatAm puede describir ya el recorrido demostrado, indicando sus pendientes; el envío corresponde al usuario.

La ficha resumida está en [Milestone ChatGPT](./chatgpt-milestone.md), la prueba próxima en [Checklist externo](./external-tester-checklist.md) y la guía de entrada en [Primeros usuarios](./first-users.md).
