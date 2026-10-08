# Ramas y cierre del piloto ChatGPT

Auditoría del 8 de octubre de 2026. Base verificada en GitHub y producción: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`. Esta jornada conserva ramas y worktrees; no fusiona a `main` ni publica en Vercel. La disposición histórica del 5 de octubre permanece recuperable en el historial de este documento.

## Integraciones presentes en main

PR46 se integró mediante `1781a4b7cf48d7719b63c67cc6df0f47d1c779d6`. Las correcciones posteriores incluyen ingreso directo y preparación de identidad/wallets (PR50–52), recuperación administrativa (PR53), distinción entre registro y activación (PR54), y activación automática Stellar Testnet (PR55, `caa3cd3`). La nueva documentación parte de ese código; no sustituye su aceptación humana pendiente.

| PR | Cobertura y disposición |
|---|---|
| [43](https://github.com/CaBsCrypto/carmelita/pull/43) · `feeb797` | Su único parche es equivalente en `main` (`git cherry origin/main` devuelve `-`). Resolución de mercado y recuperación de errores incorporadas mediante PR46. Cerrado como incorporado, sin repetir la fusión. |
| [44](https://github.com/CaBsCrypto/carmelita/pull/44) · `70bf2a8` | Los tres parches, incluida su base PR43, son equivalentes en `main`. Registro de wallets y contratos web/MCP incorporados mediante PR46. Cerrado como incorporado. |
| [45](https://github.com/CaBsCrypto/carmelita/pull/45) · `385f487` | Sus dos parches, incluida su base PR43, son equivalentes en `main`. Estados multilingües y fuentes verificadas incorporados mediante PR46. Cerrado como incorporado. |
| [36](https://github.com/CaBsCrypto/carmelita/pull/36) · `fd3d2bb` | Sus diez commits no son equivalentes por parche. Mercado/presentación fueron sustituidos por `7eb9fb4`, `a8e211a`, `92e41a1` y `3608e7c`; recuperación adaptada mediante `8c5b11f`. Cerrado como sustituido tras regresiones enfocadas. No fusionar la rama antigua completa. |
| [49](https://github.com/CaBsCrypto/carmelita/pull/49) · `f28ea6f` | Claude y selector de asistentes: conservar abierto e independiente. Su CI aprobado no acredita OAuth web/móvil ni aceptación por segunda cuenta. |

Los checks históricos fallidos de PR43–45 no se reclasifican como aprobados: 167 regresiones enfocadas de la implementación integrada pasan sobre `caa3cd3` (114 del recorrido y 53 de la cobertura sustituida), sin fallos ni omisiones. No se realizaron pagos ni fallos en producción.

## Trabajo pendiente preservado

| Rama o snapshot | Base y seguimiento |
|---|---|
| `codex/wallet-preparation-worker` | Base `bded46951ebf9ae104636d69692247bd9e3c3b15`, 29 archivos pendientes. Conservar sus bytes y base en el respaldo privado. Leases, cron, reintentos y migración `0022` requieren revisión propia; no activarlos en esta jornada. |
| `codex/oauth-consent-navigation` | Misma base `bded469`, cuatro archivos pendientes. Preservar por separado; el cierre de PR36 no declara terminados estos cambios de navegación. |
| `codex/mvp-beta` · `f5aab6b` | Dos commits locales exclusivos: `bd7701e` (lifecycle/revocación Notion) y `f5aab6b` (cuotas del chat web). Respaldo explícito y revisión selectiva posterior; no fusionar la antigua beta completa. |
| `codex/pilot-script-qa` · `71b2f0b` | Nueve commits históricos locales: preservar como archivo separado. Cinco parches no equivalentes requieren revisión; la evidencia histórica no certifica producción actual. |
| `codex/pilot-chat-routing-fix`, `codex/pilot-graph-tools`, `codex/pilot-provider-diagnosis` | Un commit local exclusivo por referencia; los parches útiles están incorporados. Preservar referencias explícitas antes de cualquier limpieza futura. |
| `feat/mcp-stage-a-hardening` | Preservar para adaptación selectiva. No recuperar actor aportado por cliente, replay retirado ni migraciones antiguas como si fuesen compatibles con el MCP personal actual. |
| `feat/avalanche-x402-merchant-sdk` | Cobertura funcional incorporada mediante `a08ae50`; ancestry y equivalencia de parche no son iguales. Mantener comparación y referencia histórica. |
| `fix/apify-connection-claim` | Parche equivalente incorporado mediante `9df3959`. Conservar rama en esta jornada. |

PR22 y PR35 se cerraron como sustituidos; PR34 (puentes) y PR37 (voz experimental) como aplazados el 5 de octubre. Sus referencias se conservan. Las ramas integradas, incluidas las de PR48 y PR50–55, tampoco se eliminan aquí.

## Seguimientos independientes

- **RECOVERY-36:** completar aceptación humana de cancelación/reintento y cambio de identidad; revisar legibilidad de tablas en móvil (la propuesta antigua `ca1091f` difiere de la implementación actual).
- **OAUTH-NAVIGATION:** revisar el snapshot de cuatro archivos antes de adaptarlo a la implementación actual.
- **WORKER:** revisar migración, concurrencia SQL, recuperación y despliegue como entrega independiente.
- **LEGACY-STELLAR:** reconciliar perfiles históricos con estado pendiente en base de datos o cuenta todavía sin activar; no afirmar que todos los registros antiguos están activos.
- **CLAUDE:** completar PR49 y aceptación web/móvil después del milestone ChatGPT.
- **SERVICES / PURCHASES:** identidad compartida, contrato hospedado Bazaar, firma, activo/trustline USDC y compatibilidad de compras siguen fuera de este cierre.
- **NOTION / QUOTA / VOICE / BRIDGE:** conservar trabajo y revisar con alcance y aceptación propios.

La etiqueta del piloto identifica únicamente el recorrido aceptado de registro/autorización/consulta de wallets. El milestone completo sigue condicionado a la [matriz de aceptación](evidence-matrix.md), el respaldo restaurado y el CI obligatorio. El cierre de PRs históricos no satisface esas puertas.
