# Carmelita multichain: ampliación EVM en Preview

Fecha de evidencia: **8 de septiembre de 2026, UTC**. Propuesta: [PR #28](https://github.com/CaBsCrypto/carmelita/pull/28). Base funcional previa: `ce871e1`.

**Seguimiento posterior:** este documento conserva los cortes iniciales de la ampliación. Los resultados de usuario A y usuario B sobre `ae96e70`, los ciclos de sesión y administración aún pendientes, y el nuevo código de recuperación Stellar se separan en [Cierre multichain y recuperación Stellar](MULTICHAIN-STELLAR-RECOVERY-2026-09-08.md). La evidencia histórica no se atribuye al código posterior `912db90`.

**Estado: implementación con comprobaciones locales y de base de datos aprobadas; aceptación de usuarios de la nueva Preview pendiente.** La primera versión desplegada corresponde a `1c5cbbdec0cd549428cf98c98de010845762f057`, enviada a la misma PR mediante tres commits adicionales: `54bec0b` (identidad y persistencia), `e33cedf` (catálogo y APIs) y `1c5cbbd` (usuario, administración y aceptación). Este corte añade la revisión de compatibilidad administrativa: `summary.wallets` conserva el número de identidades y cada asociación mantiene su estado independiente del estado antiguo de Fuji.

Alias de la rama: [Preview multichain](https://agente-asistente-git-f-22838e-cabscryptocontacto-6028s-projects.vercel.app/). Pantalla de aceptación: `/preview-acceptance`, modo **Solo billeteras multichain**. El usuario completa los códigos en Privy; la pantalla no solicita ni exporta tokens. El primer resultado de persistencia queda pendiente hasta recargar y repetir las lecturas.

## Comportamiento e interfaces

Cada usuario conserva **tres identidades de billetera**: Stellar, EVM y Solana. La misma identidad EVM, con el mismo ID de Privy y la misma dirección, se utiliza en Avalanche Fuji, BNB Smart Chain Testnet y Base Sepolia. Esto produce **cinco asociaciones de red por usuario**, con saldos independientes.

| Familia | Red | Identificador de cadena EVM | Activo nativo |
| --- | --- | --- | --- |
| Stellar | Stellar Testnet | No aplica | XLM |
| EVM | Avalanche Fuji | 43113 | AVAX |
| EVM | BNB Smart Chain Testnet | 97 | tBNB |
| EVM | Base Sepolia | 84532 | ETH |
| Solana | Solana Devnet | No aplica | SOL |

La ampliación añade registro, recuperación, visualización de dirección y consulta de saldo nativo de las redes EVM del catálogo. La búsqueda de billetera prioriza la identidad canónica persistida, exige coincidencia con Privy y rechaza identidades ambiguas. Activar BNB o Base no reemplaza la asociación de Avalanche.

La prueba visual detectó que cambiar el selector de idioma no actualizaba el onboarding, porque cada componente conservaba su estado independiente. El idioma ahora utiliza una suscripción compartida, sincroniza componentes y pestañas, conserva un estado inicial seguro durante el renderizado del servidor y sigue funcionando si el navegador restringe el almacenamiento local.

- El bootstrap conserva sus campos anteriores y añade información de la identidad EVM y sus redes.
- `GET /api/agent/wallets` devuelve una fila por red; `id` y `walletId` mantienen el ID canónico. El mismo ID puede aparecer en varias filas: la clave de una asociación es billetera más red.
- `GET /api/agent/wallets/evm?network=...` exige sesión y una red EVM habilitada del catálogo. Consulta saldo nativo y comprueba que el RPC responda con la cadena esperada. No acepta direcciones, propietarios ni RPC arbitrarios suministrados por el cliente.
- Las rutas financieras existentes conservan su red explícita. Compartir dirección EVM no habilita sus pagos, intercambios o puentes en BNB o Base.

## Aislamiento, activación y migración

La expansión requiere simultáneamente las variables de servidor `VERCEL_ENV=preview`, `CARMELITA_PREVIEW_ISOLATED=true` y `CARMELITA_EVM_TESTNET_EXPANSION_ENABLED=true`. El valor predeterminado del último indicador es `false`. Los controles de conexión de Preview siguen exigiendo la base aislada configurada; el indicador no sustituye esa comprobación. BNB y Base permanecen fuera del uso habilitado cuando el indicador está apagado.

La migración aditiva `0020_wallet_networks` mantiene las identidades en `agent_wallets` y añade `agent_wallet_networks`. Conserva los campos anteriores para compatibilidad, incorpora claves que vinculan billetera y propietario, evita dos identidades EVM por usuario y rechaza colisiones de direcciones EVM sin distinguir mayúsculas. El backfill copia la asociación existente y sus fechas; no crea billeteras Privy. Las ambigüedades se rechazan sin fusionar registros.

La migración se aplicó únicamente a la base de Preview alrededor de **07:08 UTC**. La repetición terminó sin nuevas migraciones. El corte posterior de **07:08:45.963 UTC** mostró:

| Comprobación | Resultado |
| --- | --- |
| Identificadores, propietarios y direcciones existentes | Sin cambios |
| Usuarios / identidades de billetera | 2 / 6 |
| Asociaciones de red, antes del nuevo bootstrap | 6 |
| Entradas del historial de migraciones | 21 |
| Registros de pagos / acciones / solicitudes de faucet | 0 / 0 / 0 |

**Las diez asociaciones reales todavía no se habían demostrado en ese corte.** Se esperan después del bootstrap autenticado de los dos usuarios en la nueva Preview. Las diez asociaciones de los fixtures SQL son evidencia de persistencia, no reemplazan ese recorrido de aplicación.

## Evidencia comprobada

| Control | Estado | Evidencia y alcance |
| --- | --- | --- |
| Instalación limpia | Aprobado | Node `24.14.0`, npm `11.6.1`; instalación completada sin modificar el lockfile. El log conserva advertencias de dependencias transitivas y limpieza. |
| Lint | Aprobado | Sin errores ni advertencias en el corte local registrado. |
| Suite local | Aprobado con dos omisiones explícitas | Corte final incluyendo interfaz de aceptación, compatibilidad administrativa e idioma compartido: 507 pruebas, 505 aprobadas, 0 fallos y 2 omitidas. |
| Build | Aprobado | Compilación, verificación TypeScript y generación de páginas completadas. |
| Persistencia en PostgreSQL real | Aprobado | 13/13 comprobaciones, incluidos backfill, repetición, conservación de identidad y rechazo de conflictos entre propietarios. |
| Concurrencia en PostgreSQL real | Aprobado | Transacciones distintas `7204` y `7205`, con aproximadamente 768 ms de solapamiento; resultado de una identidad EVM y tres asociaciones. |
| Limpieza de fixtures | Aprobado | Eliminación del esquema exclusivo de cada ejecución verificada; ambos intentos registraron limpieza aprobada. |
| RPC oficiales | Aprobado | Comprobaciones de lectura a las 07:07:59.989 UTC: Fuji 43113, BNB Testnet 97 y Base Sepolia 84532. |
| Preview protegida: versión, aislamiento y lectura pública | Aprobado | Corte 07:20:36 UTC sobre `1c5cbbd`: raíz, `/agent` y `/preview-acceptance` HTTP 200; APIs de billeteras y saldo EVM sin sesión HTTP 401. Recurso aislado verificado mediante fingerprint. |
| GitHub Actions | Aprobado para `ac7cba6` | [Ejecución 34199171635](https://github.com/CaBsCrypto/carmelita/actions/runs/34199171635): instalación limpia, lint, suite y build en Linux, incluida la revisión administrativa. Los controles del siguiente commit incluyen también la sincronización de idioma. |
| Nueva Preview con dos usuarios | Pendiente | Falta repetir sesiones Privy con los códigos introducidos por el usuario y comprobar seis identidades y diez asociaciones reales en el despliegue final. |

Las dos pruebas locales omitidas requieren activación externa explícita: el smoke del MCP oficial de Avalanche necesita `AVALANCHE_MCP_LIVE=1`; el smoke de Dexalot Testnet necesita `DEXALOT_LIVE=1`. No se ejecutaron como parte de la suite local y no se contabilizan como aceptación externa aprobada.

La instalación inicial usó accidentalmente npm global `11.9.0` y falló al validar el lockfile. Se corrigió el ejecutor para utilizar npm `11.6.1`, sin alterar las dependencias ni reparar el lockfile con la versión incorrecta. La instalación válida corresponde exclusivamente a las versiones fijadas.

El primer intento SQL produjo **12/13**: las transacciones no se habían solapado, por lo que la comprobación de concurrencia falló correctamente. Se añadió una ventana de un segundo al fixture para hacer medible la ejecución simultánea. La repetición produjo **13/13**; el intervalo observado demuestra solapamiento de transacciones, no es una medición de rendimiento del servicio.

Los registros completos se conservan localmente en `work/`, excluido de Git: `evm-clean-install-pinned.txt`, `evm-qa-delivery.txt`, `evm-sql-acceptance.json`, `evm-sql-acceptance-final.json`, `evm-rpc-probe.json`, `evm-preview-code-health.json` y los snapshots `evm-preview-before.json` / `evm-preview-after.json`. Los cortes previos tenían 494, 501 y 503 pruebas; el último añade las cuatro comprobaciones del idioma compartido. Los fixtures reproducibles y su ejecutor están versionados. Este documento omite correos, identidades de usuario, direcciones de billetera y credenciales.

Graphify recibió la actualización AST final: 409 archivos analizados, 2.796 nodos, 6.528 relaciones y 140 comunidades. El analizador `tree_sitter_sql` no está instalado: 21 archivos SQL no aportaron relaciones al grafo; la migración se comprobó mediante SQL y pruebas. No se declara completa la cobertura SQL ni la extracción semántica de documentos.

## Cierre pendiente y reversión

La clasificación de este corte es:

- **Verificado:** instalación con versiones fijadas, lint, suite local, build, migración aislada, invariantes de identidad y concurrencia SQL, y lectura de los tres RPC.
- **Implementado pendiente de aceptación:** nuevo bootstrap, selector de cinco redes, registro administrativo e interfaz de aceptación limitada a billeteras en el despliegue final.
- **Experimental:** disponibilidad de BNB Testnet y Base Sepolia dentro de la Preview controlada.
- **Planificado:** aceptación de envíos, tokens adicionales, puentes, pagos y Mainnet. Esta entrega no los habilita como capacidades aceptadas.

Antes del cierre deben identificarse el despliegue final de la misma PR y el recorrido autenticado de los dos usuarios. Los controles conjuntos posteriores a los cambios de interfaz ya aprobaron. Deben verificarse direcciones idénticas tras recarga/reinicio de sesión, cinco asociaciones por usuario, propiedad correcta, permisos administrativos y ausencia de duplicados o actividad financiera nueva. Un RPC saludable o un fixture aprobado no equivale a esa aceptación humana.

Para revertir la ampliación:

1. Establecer `CARMELITA_EVM_TESTNET_EXPANSION_ENABLED=false` exclusivamente en el ámbito de la rama Preview.
2. Desplegar nuevamente la versión anterior validada en el proyecto de prueba y verificar el commit efectivo y su alias de Preview. Mantener el dominio de producción intacto.
3. Conservar la tabla aditiva, las asociaciones y las billeteras. No ejecutar una migración destructiva inversa ni borrar identidades; los campos anteriores mantienen la asociación de Fuji para la versión previa.
4. Verificar nuevamente el acceso a Stellar, Fuji y Solana, el rechazo de BNB/Base en el recorrido habilitado y los mismos identificadores y propietarios.

Todos los cambios y pruebas de esta entrega corresponden a Carmelita y su Preview aislada. No se ejecutaron fondos, trustlines, pagos, reservas ni cambios en Bazaar o producción. La consulta de producción confirmó que `carmelita-agent.vercel.app` sigue en el despliegue `dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG`, anterior a esta entrega.

## Referencias oficiales de configuración

Consultadas el 8 de septiembre de 2026:

- [Privy: configuración de redes EVM](https://docs.privy.io/basics/react/advanced/configuring-evm-networks): parámetros `defaultChain` y `supportedChains`, y configuración de RPC por red.
- [BNB Chain: configuración de billeteras](https://docs.bnbchain.org/bnb-smart-chain/developers/wallet-configuration/): Testnet 97, tBNB, RPC y explorador oficiales.
- [Base: conexión a la red](https://docs.base.org/get-started/connect-to-base): Base Sepolia 84532 y RPC `https://sepolia.base.org`.

Los RPC comprobados son los del catálogo versionado: `https://api.avax-test.network/ext/bc/C/rpc`, `https://data-seed-prebsc-1-s1.bnbchain.org:8545` y `https://sepolia.base.org`.
