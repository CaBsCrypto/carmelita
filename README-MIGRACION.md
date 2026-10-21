# Migración de Carmelita: tempo-backend

Preparada el 21 de octubre de 2026 (America/Santiago) para continuar desde una rama separada. El repositorio existente verificado es [https://github.com/CaBsCrypto/carmelita](https://github.com/CaBsCrypto/carmelita), propiedad de **CaBsCrypto**, con visibilidad **pública**. El usuario autorizó publicar código y documentación revisados. La cuenta autenticada CaBsCrypto tiene permiso de push/admin. La rama predeterminada comprobada es `main`.

| Dato | Valor |
| --- | --- |
| Rama de esta copia | [`codex/migracion-tempo-backend-20261021-b61e42`](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-tempo-backend-20261021-b61e42) |
| Referencia fuente | `refs/heads/codex/tempo-backend` |
| SHA fuente | `ab7a8407bb2e22b13e8ca39c9a05f65089883f9d` |
| Padre del commit de migración | `ab7a8407bb2e22b13e8ca39c9a05f65089883f9d` |
| Alcance | Tema independiente conservado desde su propia rama de origen. |

El commit de migración tiene como padre el SHA fuente `ab7a8407bb2e22b13e8ca39c9a05f65089883f9d`. Conserva esa línea de trabajo y los commits salientes revisados; no incorpora un merge de main ni cambios de otros worktrees.

## Estado

**Continuación: BLOCKED.** Faltan recuperar y comprobar configuración/accesos de prueba y ejecutar el flujo en la notebook. La publicación, el SHA final recibido desde GitHub y la verificación de recuperación se informan en el resumen posterior; este commit no intenta contener su propio hash. Una revisión estática y un manifiesto no acreditan arranque ni aceptación.

No se instalaron dependencias ni se ejecutaron scripts, hooks, aplicaciones, pruebas, builds, migraciones de base de datos o despliegues para preparar esta transferencia. La comprobación de integridad usa herramientas de preparación propias, lecturas Git y SHA-256, sin ejecutar la aplicación.

## Procedencia y trabajo separado

La raíz de trabajo estaba en `codex/wallet-preparation-worker` con HEAD `bded46951ebf9ae104636d69692247bd9e3c3b15`, upstream local `origin/main`, 12 archivos modificados sin stage y 18 nuevos; no había cambios staged, conflictos, renombres ni eliminaciones. La migración principal parte de ese HEAD real. El `main` de GitHub se comprobó en `f0e422ad228923bc7bc179d8e9dca4a803e16a9e`: estaba **99 commits por delante** del HEAD de trabajo. La referencia remota local estaba desactualizada; no se usó como prueba del estado del servidor.

El worktree OAuth tenía dos modificaciones y dos archivos nuevos, sin stage. No se mezclaron con los cambios de la raíz. Se inventariaron las ramas locales y 28 worktrees registrados; tres worktrees externos quedaron sin inspeccionar sus contenidos. Los restantes worktrees internos estaban limpios salvo cachés del trabajo de video. No se publican indiscriminadamente todas las ramas ni tags.

El stash histórico `5342652cb0f469b641e0fc2096f6c8f97519370d` permanece en la PC original. Sus 29 rutas ya estaban presentes en versiones iguales o posteriores; no se aplicó, borró ni publicó. Cuatro historias locales contenían material dudoso de QA/MVP o rutas personales: se conservaron originales y se prepararon alternativas saneadas para una decisión específica. La tabla identifica ramas previstas; **el resumen final determina cuáles se publicaron y sus SHA**, por lo que un enlace previsto puede no existir todavía.

| Rama prevista | Tratamiento |
| --- | --- |
| [codex/migracion-carmelita-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-carmelita-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-oauth-consent-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-oauth-consent-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-mvp-beta-saneada-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-mvp-beta-saneada-20261021-b61e42) | Alternativa saneada; publicación sujeta a autorización específica y resumen final. |
| [codex/migracion-personal-apps-bazaar-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-personal-apps-bazaar-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-pilot-chat-routing-fix-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-pilot-chat-routing-fix-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-pilot-graph-tools-saneada-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-pilot-graph-tools-saneada-20261021-b61e42) | Alternativa saneada; publicación sujeta a autorización específica y resumen final. |
| [codex/migracion-pilot-provider-diagnosis-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-pilot-provider-diagnosis-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-pilot-script-qa-saneada-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-pilot-script-qa-saneada-20261021-b61e42) | Alternativa saneada; publicación sujeta a autorización específica y resumen final. |
| [codex/migracion-tempo-backend-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-tempo-backend-20261021-b61e42) | Esta copia. Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-tempo-contracts-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-tempo-contracts-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-tempo-qa-saneada-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-tempo-qa-saneada-20261021-b61e42) | Alternativa saneada; publicación sujeta a autorización específica y resumen final. |
| [codex/migracion-tempo-wallet-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-tempo-wallet-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |
| [codex/migracion-videos-20261021-b61e42](https://github.com/CaBsCrypto/carmelita/tree/codex/migracion-videos-20261021-b61e42) | Contenido revisado; confirmar publicación y SHA en el resumen final. |

## Contenido incluido y saneamiento

Se seleccionaron explícitamente fuentes, configuración no secreta, lockfiles, pruebas y assets necesarios del tema. `MIGRACION-SANEAMIENTO.json` registra las rutas omitidas, sustituciones y archivos de trabajo incorporados. En esta copia se retiran entornos con valores, configuración local del agente y evidencia operativa identificada; se usan placeholders para bindings remotos y rutas personales en documentación. Los cambios de código actual seleccionados se conservan, con normalización de CRLF a LF cuando corresponde. No se reescribe el árbol ni el índice de origen.

No se trasladan `node_modules`, cachés, salidas regenerables, sesiones/perfiles del navegador, valores de secretos, dumps, bases locales ni uploads privados. Las carpetas ignoradas y repositorios anidados bajo `work/`, respaldos y rutas externas no se incluyen sólo por estar cerca: no se identificaron como dependencias de los 30 cambios principales. Ese material y las versiones originales permanecen locales; no se afirma que esté todo respaldado en GitHub.

Se revisan los commits que cada referencia nueva haría alcanzables, además del árbol final. Retirar un archivo del árbol no borra sus versiones en ancestros ya públicos. Estos ancestros no se reescriben. Los historiales locales dudosos no se añaden como ancestros de las alternativas saneadas. La revisión realizada no es una garantía absoluta de ausencia de secretos.

## Requisitos y servicios pendientes

La PC de origen usa Windows 11 AMD64. El sistema, arquitectura, editor y permisos de la notebook aún no se comprobaron. Leer `.nvmrc`, `package.json` y lockfiles de **esta rama**; los temas pueden tener versiones distintas. La raíz activa fija Node `24.14.0` y npm `11.6.1`; el npm observado en la PC original era `11.9.0`, diferencia que debe corregirse siguiendo el pin del proyecto. Referencias de la raíz activa: Next `16.2.6`, React `19.2.6`, TypeScript `5.9.3`, Drizzle ORM `0.45.2`, Drizzle Kit `0.31.10`, Privy React `3.35.0` y Privy Node `0.26.0`.

Reinstalar dependencias y binarios nativos para la plataforma de destino; no copiar los de la PC original. SWC, Sharp, LightningCSS y Workerd dependen de la plataforma según el lockfile. Los árboles incluidos no requieren submódulos ni objetos LFS; no se instaló ni habilitó LFS. Los archivos revisados quedan por debajo de 100 MiB. [Límites de archivos de GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

`.env.example` y `MIGRACION-VARIABLES.json` contienen **nombres y placeholders**, nunca valores. No todas las variables son obligatorias: elegir las del flujo que se autorice. Neon/PostgreSQL es un servicio remoto; compartir una cuenta no migra una base local ni configura la conexión. Recuperar por canal seguro `DATABASE_URL` o el alias que use esta rama (`DATABASE_URL_DATABASE_URL`, `DATABASE_URL_UNPOOLED`), y accesos Privy/Stytch necesarios. El fallback a localhost:5432 no demuestra que exista una base local funcional. Notion, UNBLCK, OpenAI/OpenRouter y proveedores de mercado/RPC dependen del flujo elegido. No usar credenciales de producción para una prueba por comodidad.

Las conexiones ya cifradas en la misma base necesitan **la misma `CONNECTOR_ENCRYPTION_KEY`**, de 32 bytes codificados en base64 para AES-256-GCM. Su recuperación portátil y sus permisos siguen pendientes. No regenerarla, resetear datos ni desactivar protección para forzar el arranque. No se exportaron filas, bases o volúmenes. Reautenticar sesiones: localStorage, sessionStorage y perfiles no se trasladan. No se identificó una dependencia obligatoria de la PC original encendida para las fuentes principales; hay que demostrarlo con una prueba de independencia en destino.

El servidor local normalmente usa el puerto 3000; revisar el puerto elegido y los callbacks antes de arrancar. La extensión del navegador espera localhost:3000; algunos scripts de aceptación usan 3001. No se configuraron túneles, Docker ni servicios locales en la notebook, ni se comprobó su disponibilidad.

## Trabajo específico de esta rama

Esta rama conserva exclusivamente el tema «tempo-backend». Revisar los README y scripts específicos incluidos antes de continuar. No asumir compatibilidad con los cambios actuales de wallet preparation ni combinarla con otros snapshots. Las historias de personal apps, backend, contratos, wallet, diagnóstico, routing y QA siguen siendo trabajos independientes.

`personal-apps-bazaar` y wallet preparation contienen migraciones diferentes numeradas 0022. Cualquier integración futura necesita reconciliar la secuencia de Drizzle y revisar esquema/datos; no aplicar ambas automáticamente. Los resultados operativos antiguos no acreditan la aceptación del código actual.

## Automatizaciones revisadas

`quality.yml` escucha pushes a `main` y eventos `pull_request`. Un push a una de estas nuevas ramas sin abrir PR no coincide con ese filtro. Se comprobó protección de main con revisión/check `local-quality`, sin force-push ni borrado. No se alteraron protecciones. Los workflows PR57 figuraban en registros históricos de Actions, pero sus YAML no estaban en el main verificado.

La conexión Vercel comprobada corresponde a este repositorio y producción `main`: Previews desactivadas, Ignored Build Step que omite ramas distintas de main, recursos Standard fijos y concurrencia adicional desactivada. No se modificó CI ni hosting para saltar controles. La restricción de costes de `AGENTS.md` sigue vigente. Un PR futuro puede iniciar instalación, QA y build; integrar o empujar a main puede publicar. Requiere autorización independiente. Los efectos observados después del push se documentan en el resumen final; no se presupone que suscriptores o integraciones invisibles no reciban notificaciones.

## Integridad y lectura siguiente

`MANIFIESTO-MIGRACION.json` enumera rutas relativas, tamaños, modos Git y SHA-256 de todos los archivos trasladados, salvo el propio manifiesto y los metadatos Git. Los hashes se calculan sobre **bytes de blobs Git**. Un checkout con `core.autocrlf=false` evita diferencias por conversión automática de fin de línea.

`MIGRACION-VERIFICAR.py` usa la biblioteca estándar y comandos Git de lectura. Revisar su fuente y procedencia antes de ejecutarlo; no es parte de la aplicación. Comparar el SHA recibido contra el resumen final y verificar también la lista completa de archivos. Lee [PROMPT-RECEPTOR.md](PROMPT-RECEPTOR.md) antes de preparar el entorno. Mantener el original y el stash hasta confirmar la prueba en la notebook.
