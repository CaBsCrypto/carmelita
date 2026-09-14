# Carmelita: validación y hoja de ruta

Fecha: 7 de septiembre de 2026. Código revisado: `c163e15`.

## Conclusión

Carmelita tiene una base amplia de identidad, wallets, chat, memoria, permisos y acciones Testnet. La suite verifica mucha lógica, pero el código actual no está listo para una nueva publicación: la instalación reproducible falla y WebMCP bloquea la compilación. La aplicación pública responde; eso no demuestra que ejecute este mismo commit ni que todos los recorridos autenticados funcionen.

La prioridad es recuperar una base publicable, verificar el recorrido de un usuario y luego completar el consumo desde Stellar Bazaar. Todo cambio será exclusivamente en Carmelita. Bazaar es una dependencia externa de solo lectura: no modificar su código, configuración, datos ni despliegue.

## Cómo se validó

Se revisaron código, pruebas y documentación del repositorio. No había cambios en archivos versionados al iniciar. Las pruebas se ejecutaron sobre una copia temporal obtenida con `git archive HEAD`, sin el clon anidado de Bazaar ni secretos locales. Entorno: Windows, Node 24.14.0, npm 11.9.0.

La instalación `npm ci --ignore-scripts --no-audit --no-fund` falló: faltan `@emnapi/core@1.10.0` y `@emnapi/runtime@1.10.0` en el lockfile. Para continuar la auditoría se resolvieron dependencias únicamente en la copia temporal con `npm install --ignore-scripts`. Por tanto, los resultados posteriores corresponden al código del commit con una resolución reparada de dependencias, no a una instalación limpia reproducible del lockfile original. El repositorio principal no recibió esa reparación.

El primer inicio del ejecutor de tests fue bloqueado por el entorno restringido (`uv_os_get_passwd`); el reintento autorizado pudo ejecutar la suite. Graphify tampoco pudo arrancar por su referencia a un intérprete local; no existe `graphify-out/graph.json`. Se realizó revisión directa.

## Resultados observados

| Comprobación | Resultado | Qué demuestra y qué no |
|---|---|---|
| Instalación limpia | Falla | La reproducibilidad debe corregirse y probarse con versiones de Node/npm fijadas |
| Suite `npm test` | 410 casos: 408 pasan, 0 fallan, 2 omitidos | Lógica y contratos automatizados; no certifica pagos ni sesiones reales |
| Lint | 1 error, 1 advertencia | Error en `app/agent/webmcp-inspector.tsx:57`; advertencia de import no usado en `tests/aave-fuji.test.ts` |
| Build | Compila bundles, falla TypeScript | Conflicto entre declaraciones de `Document.modelContext` en `app/webmcp-client.ts` y `app/webmcp-registry.tsx:4` |
| Diagnóstico público | 6/6 pasan | Página `/agent`, health, descubrimiento MCP, constantes, reto 402 oficial y saldo del distribuidor |
| CoinGecko | Cotización XLM recibida usando el conector | Lectura real desde este entorno; no prueba persistencia de watchlist |
| Travala | Búsqueda falla; petición observada devuelve HTTP 401 | El acceso sin autenticación del conector actual no funciona en esta comprobación; investigar requisitos de acceso antes de atribuir causa definitiva |
| Flujos autenticados | No ejecutados | Login, persistencia por usuario, OAuth, firmas y acciones quedan pendientes de aceptación real |

Los dos tests omitidos son el smoke del MCP oficial de Avalanche y el smoke de Dexalot Testnet. `npm test` solo incluye `tests/*.test.ts`: no incluye `tests/rendered-html.test.mjs`, que corresponde a la salida Sites y no se ejecutó. No hubo auditoría visual completa de navegador ni prueba de despliegue nuevo.

El health público declara Postgres, x402 Testnet habilitado y Mainnet deshabilitado. Su implementación devuelve varias constantes y `backend.mode()`; no es un chequeo exhaustivo de conectividad a base de datos, firmas o proveedores. El distribuidor tenía 18 USDC Testnet y 9999.9999500 XLM al consultar. El reto oficial exigía 0.0100000 USDC. Son observaciones puntuales, no garantías futuras.

Evidencia reproducible de las ejecuciones: [tests](audits/2026-09-07/audit-tests.txt), [lint](audits/2026-09-07/audit-lint.txt), [build](audits/2026-09-07/audit-build.txt), [diagnóstico público](audits/2026-09-07/audit-doctor.txt), [Travala](audits/2026-09-07/audit-travala.txt), [HTTP Travala y CoinGecko](audits/2026-09-07/audit-readonly.txt).

## Inventario funcional

“Implementado” significa que existe código revisado; “verificado hoy” exige una observación real en esta auditoría. Las afirmaciones históricas de la documentación se mantienen separadas.

| Función | Estado sustentado | Falta para considerarla validada de extremo a extremo |
|---|---|---|
| Entrada web, guía y traducciones | `/agent` responde HTTP 200; componentes EN/ES/PT | Revisión visual, móvil, navegación y errores de usuario |
| Login Privy y bootstrap | Implementados; pruebas de onboarding y contrato | Login real con dos usuarios, wallets idempotentes y acceso denegado entre cuentas |
| Wallet Stellar | Implementada; documentación reporta uso histórico | Verificar dirección, balances, trustline y recuperación de sesión por usuario |
| Avalanche Fuji | Registro experimental; onboarding, transferencias, Pangolin y x402 tienen código y tests | Recepción de fondos, aprobación, transacción y recibo real por cada flujo que se ofrezca |
| Solana Devnet | Experimental; onboarding, consulta y transferencia implementados | Aceptación real de wallet, fondos, firma y reintento |
| Base Sepolia / BNB Testnet | `rollout: planned` en `app/wallets/networks.ts` | No ofrecer como redes operativas |
| Chat y memoria personal | Stores, recuperación, políticas y tests implementados | Persistencia tras reinicio, corrección/borrado y aislamiento en Neon real |
| Planificador con modelo | Implementado y opt-in; `mode: plan-only` en `app/agent-planner.ts` | Configuración efectiva y evaluación de lenguaje libre; no confundir planificación con ejecución autónoma |
| Cotizaciones | CoinGecko verificado hoy; fallback CoinMarketCap cubierto con tests | Validar fallback real con su configuración y UX cuando ambos fallen |
| Watchlist | Implementada con persistencia por usuario | Alta/lectura tras nueva sesión; alertas programadas no demostradas |
| Travala | Tests locales pasan, búsqueda externa falla 401 | Resolver acceso/protocolo; repetir búsqueda real. Reservas y pagos no forman parte del conector |
| Notion | OAuth PKCE, tokens cifrados, MCP y orquestación implementados | Conectar, buscar, revocar y probar pérdida de acceso con cuenta real |
| UNBLCK | Book/cancel, aprobación y replay implementados; prueba histórica documentada | Revalidar vinculación y disponibilidad; reservar/cancelar solo con acción específica autorizada |
| Telegram | Bot, webhook y enlace de identidad implementados | Configuración y aceptación real. La Mini App devuelve `signing.available: false` |
| Stellar x402 | Reto y saldo verificados; firma, persistencia y guardas probadas localmente | Pago aprobado de usuario real y confirmación independiente de débito, entrega y repetición sin segundo cargo |
| DeFindex | Código y tests; depósito XLM histórico documentado | Repetir aceptación; USDC requiere activo/issuer y fondos exactos |
| Soroswap | Cliente y tests; documentación reporta falta de protocolos Testnet en revisión anterior | Revalidar disponibilidad externa actual y probar quote/build/send antes de habilitar compra |
| CCTP Fuji → Stellar | Preparación y ejecución por etapas implementadas, tests de binding y recuperación | Ensayo completo approve/burn/attest/mint con recibos; documentación indica E2E on-chain pendiente |
| Autopilot | Política y límites; valor predeterminado `policy_only`, firmante delegado no listo | No anunciar ejecución autónoma; diseñar y validar delegación antes de ofrecerla |
| Agent Gateway MCP/REST | Catálogo, lectura, scopes y planes; descubrimiento público responde | Prueba autenticada PAT/OAuth, revocación, aislamiento y errores. Gateway no expone firma ni envío |
| Stytch OAuth | Resource server, consentimiento y enlace de identidad implementados | Configuración real, login externo, renovación, revocación y scopes; existencia de tests no demuestra despliegue habilitado |
| WebMCP | Módulos y tests con objetos simulados; bloquea build/lint actual | Unificar contrato, probar registro/limpieza en navegador compatible y mantener alternativa sin WebMCP |
| Comercio genérico / MCP proveedor | Administración y flujo de intención implementados; liquidación `simulated-settled` | No vender el sandbox como fulfillment real; validar proveedor y entrega por separado |
| Admin, waitlist y conexiones | Rutas, UI y tests de autorización/validación | Aceptación con roles reales, exportación y persistencia sin exponer datos |
| MPP Router / Stellar 8004 | Catálogo de descubrimiento y borrador de registro | No confundir descubrimiento con compra ni borrador con registro on-chain |
| Gmail, Drive, Calendar, Trello, ArcusX | Planificados en documentación/catálogo | Implementación y aceptación propias; no son conectores ya operativos |
| Consumo de Stellar Bazaar | Plan local; sin conector implementado | Descubrimiento, selección de proveedor, autorización de petición dinámica y conciliación de entrega |

Fuentes principales: `app/wallets/networks.ts`, `app/agent-planner.ts`, `app/agent-autopilot.ts`, `app/api/telegram/mini/session/route.ts`, `app/agent-gateway/catalog.ts`, `app/mcp/stytch-oauth.ts`, `app/commerce-backend.ts`, `app/x402/*`, `app/connectors/*`, `tests/*` y documentos de las capacidades.

## Inconsistencias que corregir

1. `docs/product-status.md` está fechado el 22 de julio. Describe planificación general y OAuth externo como pendientes, pero ya hay implementaciones posteriores. Actualizarlo usando esta matriz sin convertir implementación en prueba de producción.
2. La insignia de 126 tests del README no refleja los 410 casos ejecutados. Registrar cantidad, resultado, fecha y alcance; evitar un número estático sin trazabilidad.
3. Travala aparece como lectura pública activa, pero el conector recibió 401. Marcar aceptación pendiente hasta resolverlo.
4. El éxito de tests WebMCP simulados convive con un fallo real de tipos y lint. La puerta de integración debe ejecutar instalación limpia, tests, lint y build.
5. El clon local `stellar-bazaar-x402/` está bajo la raíz de Carmelita. Sus patrones `**/*.ts`/`**/*.tsx` y lint general pueden incluirlo. Excluirlo desde la configuración de Carmelita y del empaquetado, sin modificar ni mover Bazaar. Esta auditoría evitó el problema usando un snapshot de Carmelita.

## Hoja de ruta priorizada

### P0 — recuperar una base publicable

Trabajo en Carmelita: reparar lockfile con versiones de herramientas definidas; unificar tipos y registro WebMCP; corregir el efecto del inspector y el import sobrante; excluir la referencia Bazaar de compilación/lint/empaquetado; ajustar la documentación de estado.

Salida: instalación limpia, 0 fallos de tests, lint sin errores y build completo en un entorno nuevo. Identificar commit desplegado y registrar su relación con el commit validado. No resolver el fallo deshabilitando TypeScript o las reglas de calidad.

### P1 — validar el recorrido principal con usuarios

Prioridad: login → wallet Stellar → saldo/trustline → aprobación x402 → firma → resultado y recibo → recarga/reintento. Repetir con dos usuarios para verificar aislamiento. Comprobar persistencia real y fallo/timeout durante ejecución. Resolver Travala o mostrar su indisponibilidad honestamente. Validar Notion y el acceso MCP/OAuth en recorridos separados.

Salida: evidencias fechadas por paso, sin secretos; un débito por acción; reintento sin segundo pago; acceso ajeno denegado; recuperación explícita de resultados ambiguos. La sesión y el consentimiento para una acción financiera deben proporcionarse mediante el flujo de la aplicación, no pegando secretos en el chat.

### P2 — preparar Carmelita para consumir Stellar Bazaar

Aplicar el [plan de consumo](stellar-bazaar-consumer-plan.md) únicamente en Carmelita:

1. Conector de descubrimiento y fichas con estados verificables; origen Bazaar configurable.
2. Preparación de petición que fija proveedor, ficha/hash, método, URL, input/hash, activo, importe, destino y vencimiento.
3. Firma Privy y ejecución usando la aprobación exacta; persistencia e idempotencia existentes ampliadas.
4. Resultado y recibo conciliados, recuperación sin nuevo cobro y exposición segura en chat.

Salida: un servicio descubierto se consume desde Carmelita con aprobación, resultado verificado y repetición sin doble débito. Antes: pruebas contractuales con respuestas simuladas; después: ensayo Testnet contra un proveedor actualmente disponible. No hace falta modificar Bazaar ni crear servicios allí. Website Intelligence es solo un candidato de prueba, no un requisito ni una auditoría web en vivo ya demostrada.

### P3 — ampliar capacidades con pruebas independientes

Validar Avalanche y Solana; después completar CCTP E2E y recuperación por etapa. Continuar aceptación de DeFindex/Soroswap según disponibilidad externa. Activar Telegram y completar su firma solo si se prioriza ese canal. Cada capacidad conserva etiqueta experimental hasta tener su propia prueba real.

Salida: recibos y aceptación por capacidad; no considerar todo el soporte multichain validado por una transferencia aislada.

### P4 — expansión de producto

Autopilot delegado, nuevos conectores, Mainnet y modelos de comercio avanzados requieren decisiones propias y evidencia previa. No son dependencias necesarias para el primer consumo Testnet desde Bazaar.

## Decisión para continuar

El siguiente trabajo concreto es P0. Después, el camino mínimo que demuestra valor es el recorrido Stellar con usuario real y un consumo desde Bazaar. La auditoría y hoja de ruta están completas; las reparaciones y aceptación pendientes son trabajo posterior explícitamente identificado, no funciones ya verificadas.
