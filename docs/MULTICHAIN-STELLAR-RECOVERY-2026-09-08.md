# Carmelita: cierre multichain y recuperación Stellar

Fecha: **8 de septiembre de 2026, UTC**. Propuesta existente: [PR #28](https://github.com/CaBsCrypto/carmelita/pull/28).

**Corte histórico de implementación y pruebas.** La continuación fechada está en [aceptación de sesiones y recibos del 9 de septiembre](ACCEPTANCE-SESSIONS-RECEIPTS-2026-09-09.md) y en el [cierre posterior del pago Stellar, entrega, repetición, recuperación y aislamiento](STELLAR-PAYMENT-ACCEPTANCE-2026-09-09.md). Cada informe conserva su versión y resultados; estos cortes no se reemplazan ni se reatribuyen.

**Estado en este corte: recuperación implementada, migración QA aplicada y aceptación visible pendiente.** Los controles locales y SQL se detallan por corte a continuación. La evidencia de la Preview `ae96e705c418f4b9dc1dcf34a5415fd8099e89cf` corresponde al hito multichain anterior y no acredita este nuevo recorrido Stellar.

Código consolidado: `912db90115eef6ea29130b848b2f8132e7bd254a`, después de `caa0256` (cierre comprobado de sesiones) y `5891c6b` (persistencia, verificación y recuperación). La actualización documental posterior no cambia ese código. El nuevo despliegue y los recorridos visibles se registrarán con su propia versión; no se atribuyen a la Preview anterior.

Todos los cambios corresponden a Carmelita. Los fixtures SQL se ejecutaron dentro de esquemas sintéticos exclusivos de la base Preview aislada, con limpieza verificada. Después de aprobar los controles conjuntos, la migración 0021 se aplicó por separado a QA a las 08:48 UTC. No se ejecutaron firmas, pagos, fondos, trustlines ni modificaciones de Bazaar o producción.

## Evidencia anterior y cierre pendiente

El documento [ampliación EVM en Preview](MULTICHAIN-EVM-PREVIEW-2026-09-08.md) conserva sus cortes iniciales. Posteriormente, sobre `ae96e70`, se verificó:

| Corte anterior | Resultado y límite |
| --- | --- |
| Usuario A, 07:43:25 UTC | 14/14 comprobaciones de billeteras, lecturas, permisos y estabilidad tras recarga. |
| Usuario B, 08:03:04 UTC | 14/14 comprobaciones equivalentes. La recuperación de una sesión Privy existente no se contó como un nuevo logout/login. |
| PostgreSQL y registro administrativo, 08:00:18 UTC | 30/30 comprobaciones de sólo lectura: dos usuarios, seis identidades originales, diez asociaciones, cinco redes por usuario, propietarios intactos y ausencia de duplicados. |
| Resumen administrativo consultado | `wallets=6`, `uniqueWallets=6`, `networkAssociations=10`, `completeUsers=2`, sin usuarios pendientes. La consulta interna no acredita una sesión administrativa visible. |
| Registros financieros y migraciones | Cero pagos, acciones Stellar, solicitudes de faucet e intenciones de comercio; historial con 21 migraciones. |

Los archivos locales `work/evm-user-a-browser.json`, `work/evm-user-b-browser.json` y `work/evm-user-b-db.json` identifican esos cortes. No se publica aquí su información personal ni el baseline que contiene las identidades originales.

Continúan pendientes, por cada usuario, un cierre e inicio de sesión explícitos en la versión final, seguido de recuperación del bootstrap y comparación de las mismas billeteras. También falta el acceso visible del administrador al registro final. La aceptación anterior de chat y memoria está documentada por separado en [el informe de usuarios reales](real-user-preview-acceptance-2026-09-08.md), asociado a `162db80`; no se modifica ni se atribuye al código nuevo.

Para conservar las referencias de billeteras, mantener la misma pestaña y origen de Preview. La pantalla de aceptación guarda su referencia en `sessionStorage`, separada por usuario, commit, despliegue y fingerprint de base. Si falta la referencia, la comparación queda pendiente: no se debe reemplazarla y afirmar que se conservó la anterior. La recarga o el montaje del panel no prueban por sí solos un nuevo login.

El cierre debe observar «Sin sesión» después de cerrar Privy y administración, comprobar que la sesión administrativa ya no esté autenticada, y después iniciar sesión explícitamente con el usuario elegido. No se exige un OTP adicional si Privy completa su propio flujo autorizado. Tras volver a `/agent`, repetir las lecturas y el control independiente contra el baseline original. Los códigos y tokens permanecen en el flujo de la aplicación.

La administración final utiliza `/admin/login` y `/admin/wallets`, con la allowlist Privy existente. El runner antiguo por contraseña no autentica esa configuración y sus supuestos de conteo todavía corresponden a tres filas por usuario. No se debe usar como evidencia final de cinco redes. Entrar al registro administrativo no requiere abrir `/agent` ni aprovisionar billeteras para el administrador.

## Implementación de recuperación

La demo conserva su alcance: recurso oficial de Stellar Testnet, petición `GET`, x402 versión 2, esquema `exact`, USDC Testnet permitido, importe máximo de **0.01 USDC** y comisiones patrocinadas. La petición se fija junto con red, activo, importe, destinatario, vencimiento y hash; los cambios de condiciones se rechazan antes de ejecutar. No se convierte la demo en un consumidor de URLs arbitrarias.

La preparación verifica que la cuenta Stellar exista, tenga la trustline del USDC permitido y saldo suficiente. Una precondición ausente bloquea el recorrido de pago; su comprobación no solicita fondos automáticamente. La confirmación concreta del usuario y la firma Privy siguen perteneciendo al flujo visible de Carmelita.

La migración aditiva `0021_x402_recovery` añade a `agent_x402_payments`:

| Campo | Propósito |
| --- | --- |
| `payment_state` | Distingue `pending`, `confirmed` y `uncertain`. |
| `delivery_state` | Distingue entrega `pending` y `received`. |
| `execution` | Conserva la ejecución firmada y sus condiciones en el servidor antes de contactar al proveedor. |
| `verification` | Conserva la comprobación independiente de la transacción y su autorización. |
| `resource_body` | Conserva el resultado completo, además del extracto de presentación. |
| `reconciliation_cursor` | Permite continuar una búsqueda de evidencia sin reemplazar el progreso de una consulta posterior. |

La migración no convierte un `status=confirmed` histórico en una prueba independiente: conserva esos campos antiguos y asigna `payment_state=uncertain` a los registros previos que pudieron ejecutarse. La entrega comienza pendiente hasta disponer del cuerpo completo y su evidencia. Reaplicar la migración no rebaja estados verificados por el nuevo recorrido ni reescribe migraciones anteriores.

El almacenamiento obtiene la ejecución mediante una actualización atómica de `prepared` a `signing`, junto con toda la evidencia firmada. Sólo una solicitud puede obtenerla. Todas las escrituras exigen el propietario del pago. Un resultado incierto obliga a reconciliar la misma operación; no habilita una nueva firma o envío automático.

Los dos modos del ejecutor histórico `scripts/x402-replay-proof.ts` quedan deshabilitados antes de leer configuración o contactar a cualquier destino. Ese ejecutor seleccionaba producción implícitamente y aceptaba una firma por variable de entorno. La ejecución y repetición de aceptación se realizan ahora en la Preview visible. Los helpers puros de prueba siguen disponibles para escenarios locales con dependencias simuladas.

La cabecera de liquidación se guarda antes de leer el cuerpo, para no perder su referencia si esa lectura falla. El resultado completo y su SHA-256 se guardan antes de declarar la entrega verificada. Un recibo del proveedor es una afirmación que debe contrastarse: por sí solo no establece el hash canónico ni confirma el pago.

La ausencia de una cabecera puede resolverse con prueba independiente de la autorización en Stellar y el cuerpo persistido. Una cabecera contradictoria no puede convertirse en una entrega verificada sólo porque su hash coincida: se comprueban también éxito, red y pagador. Los hashes se normalizan sin cambiar su identidad.

La reconciliación consulta el RPC de Stellar Testnet y contrasta red, autorización, nonce, activo, importe, emisor, destinatario y transacción. También identifica el pagador efectivo de comisiones, incluidas cuentas multiplexadas, y exige que sea distinto del usuario. Sus dependencias son de lectura; no vuelve a firmar ni enviar. El nonce conserva el rango Int64 firmado de Soroban. El estado confirmado no se degrada por respuestas tardías y el cursor sólo avanza desde el punto observado por la consulta.

La interfaz conserva una referencia al pago por usuario, vuelve a consultar su estado después de recuperar la sesión y muestra pago y entrega por separado. La respuesta pública entrega el contenido completo solamente cuando está verificado; el extracto de 4.000 caracteres no sustituye al cuerpo cuyo hash se conserva. El contenido externo se presenta como texto. La evidencia firmada completa permanece en el servidor. El Gateway externo continúa limitado a lectura y planificación.

## Cortes específicos anteriores a la validación final

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| Store local | 9/9 aprobadas | Validación de entrada, nonce Int64, SHA y cuerpo completo, filtrado por propietario, evidencia de verificación y cursor. |
| SQL real, 08:36:12.490 UTC | 17/17 aprobadas | Migración sobre tablas sintéticas, repetición, compatibilidad histórica, recuperación, aislamiento y limpieza. |
| Concurrencia SQL | Aprobada | Transacciones `12304` y `12303`, con aproximadamente 988 ms de solapamiento y una sola ejecución firmada persistida. |
| Carrera de reconciliación y respuesta HTTP | Aprobada | Confirmar el pago antes de recibir cabecera/cuerpo permite conservar después la entrega compatible, sin reemplazar la prueba de pago. |
| Cuerpo alterado o recibo de otra transacción | Rechazados como cierre exitoso | El pago puede estar verificado, pero el estado general continúa requiriendo reconciliación. |
| Lint específico y TypeScript | Aprobados en el corte del store | No sustituyen los controles del conjunto final. |
| Instalación limpia, suite completa y build del conjunto | Pendientes en este corte documental | La consolidación y revisión posterior incluyen cambios adicionales; registrar sus resultados y SHA final por separado. |
| Pago Stellar Testnet con entrega y repetición | Pendiente | Ninguna prueba SQL firma, paga ni acredita una entrega real del proveedor. |

La evidencia SQL sanitizada se conserva en `work/x402-store-sql-acceptance-final.json`. El ejecutor `scripts/x402-store-sql-acceptance.ts` exige `--execute` y `assertPreviewIsolation`; sin activación no construye una conexión. Crea únicamente un esquema `carmelita_x402_qa_…` con identificador aleatorio y marca propia, fija ese esquema en cada transacción y verifica su pertenencia antes de eliminarlo. No aplica migraciones a `public` ni al historial real de `drizzle`.

Las cifras 17/17 y 9/9 pertenecen al corte anterior a la normalización final del hash de transacción. La repetición posterior con normalización produjo 18/18 SQL a las 08:47:10 UTC. Estos cortes se conservan; el siguiente cuadro identifica la validación final.

## Validación final local y migración QA

Cierre local: **08:56:20 UTC**, código `912db90`. [Resultados por comprobación](audits/stellar-recovery-preview-2026-09-08/evidence.json) conservan fecha, versión, entorno y estado; la aceptación general permanece pendiente.

| Comprobación | Estado | Evidencia y límite |
| --- | --- | --- |
| Instalación limpia | Aprobado | Node 24.14.0 y npm 11.6.1; `npm ci` terminó sin cambiar dependencias ni lockfile. |
| Lint | Aprobado | Cero errores y advertencias sobre el conjunto final. |
| Suite local | Aprobado | 563 pruebas: 561 aprobadas, cero fallos y dos omisiones externas explícitas. |
| Compilación | Aprobado | Build completo, verificación TypeScript y generación de páginas. |
| SQL real final, 08:53:32 UTC | Aprobado | 23/23; recibos contradictorios, ausencia de cabecera, cuerpo persistido y ambos órdenes de llegada. |
| Concurrencia SQL final | Aprobado | Transacciones 13315/13314, aproximadamente 985 ms de solapamiento, un ganador y limpieza exacta. |
| Patrocinio y reconciliación local | Aprobado | 17 pruebas del reconciliador, incluida comisión a cargo del usuario rechazada, cuentas multiplexadas y fee bump patrocinado. |
| Ejecutor histórico | Bloqueado correctamente | Ambos modos CLI rechazan antes de cualquier consulta o ejecución; las pruebas puras no ejecutan transacciones. |
| Migración 0021 en QA, 08:48:17 UTC | Aprobado | Aplicación independiente y repetición sin nuevas entradas: 22 migraciones. |
| Identidades antes y después de migrar | Aprobado | Dos usuarios, las mismas seis billeteras originales, diez asociaciones y cero pagos, acciones o solicitudes de faucet. |
| Graphify AST | Actualizado parcialmente | 430 archivos, 2.914 nodos, 6.938 relaciones y 146 comunidades; 22 archivos SQL sin extracción por ausencia de `tree_sitter_sql`. |
| CI y nueva Preview | Pendiente en este corte | Los controles remotos se registran sólo tras observar el despliegue exacto. |
| Cierre/inicio explícitos y ambos administradores | Pendiente | No sustituidos por recarga, consulta directa de base o sesión anterior. |
| Pago real, recuperación y aislamiento | Pendiente | Primero debe cerrarse multichain y aprobarse la operación concreta en Carmelita y Privy. |

La primera ejecución conjunta detectó que el comprobador de cobertura SQL no reconocía `ADD COLUMN IF NOT EXISTS`. Se corrigió su parser y se repitieron todos los controles. Las pruebas externas omitidas siguen siendo los smokes de Avalanche MCP (`AVALANCHE_MCP_LIVE=1`) y Dexalot Testnet (`DEXALOT_LIVE=1`); no cuentan como aceptación externa.

Los logs de instalación conservan advertencias transitivas, limpieza de npm y 63 vulnerabilidades informadas por npm audit (1 baja, 36 moderadas y 26 altas). No se aplicó una actualización automática de dependencias ni se presenta esta entrega como cierre de esa auditoría.

Evidencia local adicional, excluida de Git: `stellar-recovery-npm-ci.log`, `stellar-recovery-qa-delivery.log`, `x402-store-sql-acceptance-strictreceipt.json`, `stellar-recovery-db-before.json`, `stellar-recovery-db-after.json` y `stellar-recovery-graphify-final.log`. El grafo se actualizó con el runtime Python instalado; la cobertura semántica de documentos y SQL no se declara completa.

## Límite de recuperación y siguiente aceptación

**Un pago verificado puede seguir con entrega pendiente.** Si la respuesta del proveedor se perdió antes de persistir su cuerpo, la consulta de cadena puede demostrar el débito, pero no reconstruye por sí sola el contenido. Carmelita conserva el pago para investigación y no inicia otro cobro. Tampoco presenta un cuerpo alterado o un recibo inconsistente como resultado completo.

El orden restante es:

1. Cerrar instalación, lint, suite y build del código consolidado; registrar commit, despliegue y evidencia real. Aplicar la migración revisada sólo a la base QA aislada mediante el paso separado del build.
2. Completar los nuevos ciclos de sesión de usuario A y usuario B y la revisión visible del administrador. Mantener seis identidades originales, diez asociaciones y ninguna actividad financiera nueva durante este cierre.
3. Consultar cuenta Stellar, trustline y saldo. Si falta un requisito que implique fondos o una transacción, prepararlo como acción separada con su aprobación concreta.
4. Presentar un pago Stellar Testnet con recurso, importe, activo, destinatario y vencimiento visibles. Obtener la aprobación de esa operación y su firma Privy.
5. Verificar un solo débito, la entrega persistida y su recibo. Repetir la misma operación y recuperar la sesión o una respuesta incierta sin segundo débito; comprobar también que el otro usuario no puede acceder al pago.

Hasta completar esos pasos, la clasificación es **verificado** para las pruebas específicas fechadas, **implementado pendiente de aceptación** para el nuevo recorrido, **experimental** para su disponibilidad en Preview y **planificado** para el consumo posterior desde Bazaar. Travala, Notion/OAuth, otros pagos y Mainnet mantienen aceptación independiente.
