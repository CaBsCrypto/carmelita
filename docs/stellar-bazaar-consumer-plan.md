# Carmelita como consumidora de Stellar Bazaar

Revisión: 7 de septiembre de 2026. Alcance: entender ambos proyectos y preparar la integración; no implementar ni ejecutar pagos. Restricción del usuario: editar exclusivamente Carmelita; Bazaar permanece como referencia de solo lectura, sin cambios de código, configuración, datos ni despliegue. Prioridades actualizadas en [la auditoría y hoja de ruta](auditoria-y-hoja-de-ruta-2026-09-07.md).

## Objetivo

El usuario pide una tarea a Carmelita. Carmelita descubre un servicio en Stellar Bazaar, explica qué entrega y cuánto cuesta, solicita aprobación, firma con la wallet del usuario, consume el proveedor y devuelve el resultado con evidencia verificable.

Bazaar aporta descubrimiento y contratos de servicio. Carmelita conserva identidad, contexto, selección, política de gasto, autorización, firma y seguimiento. El proveedor entrega el resultado; su facilitador verifica y liquida el pago.

## Base revisada

- Carmelita: `CaBsCrypto/carmelita`, commit `c163e15`, clonado en la raíz de este proyecto.
- Bazaar: `CaBsCrypto/stellar-bazaar-x402`, commit `1324f82`, clonado en `stellar-bazaar-x402/` como referencia local independiente. No incorporar esta carpeta a un commit o despliegue de Carmelita; antes de implementar, excluirla expresamente desde la configuración de Carmelita sin modificar ni mover Bazaar.
- Revisión estática de código y documentación. No se instalaron dependencias, ejecutaron suites ni verificaron despliegues o transacciones históricas en la red.
- No hay grafo `graphify-out/graph.json` en ninguno de los clones. El ejecutable local de graphify no arranca; el análisis se realizó directamente sobre las fuentes.

## Qué existe y qué falta

| Área | Evidencia actual | Consecuencia |
|---|---|---|
| Aplicación | Next.js 16, React 19, Privy, Neon/Drizzle, LangGraph, MCP | Integrar en el agente existente |
| Pagos Stellar | `app/x402/protocol.ts` implementa inspección 402, requisitos congelados y pago preparado | Reutilizar el protocolo y el firmante de Carmelita |
| Recurso de pago | `app/x402/assets.ts` fija la demo oficial; `app/api/agent/x402/route.ts` prepara esa URL | Hace falta selección validada de proveedor e inputs |
| Autorización | La ruta exige confirmación y mantiene pagos/eventos persistentes | Extender el vínculo a servicio, versión, ficha e input |
| Compatibilidad | Ambos usan `@x402/stellar`, USDC Testnet y `exact`; Bazaar configura 10000 unidades = 0.001 USDC | Hay base común; verificar reto y versión efectivos antes de firmar |
| Catálogo en Carmelita | `app/connections/data.ts` menciona x402 Bazaar de Coinbase | Crear identidad diferenciada para Stellar Bazaar |
| Descubrimiento Bazaar | REST `/api/discovery/search?query=...` y siete herramientas MCP de lectura | Descubrir no ejecuta ni paga |
| Precio y activo | ServiceCard v0 usa precio decimal y activo como texto; el reto usa importe atómico y contrato | Normalizar con enteros y verificar contrato; el símbolo USDC no basta |
| Entrega | Bazaar define `bazaar.paid-delivery-envelope/v1` y recuperación | Separar pago, entrega y conciliación |

Fuentes de Bazaar: `lib/types.ts`, `lib/bazaar-agent-client.ts`, `lib/x402-config.ts`, `lib/paid-delivery-envelope.ts`, `docs/MCP_DISCOVERY.md`, `docs/E2E_TESTNET_READINESS_GATE.md`.

## Decisiones de integración

1. Empezar por REST para buscar y normalizar resultados. Añadir MCP con el SDK y su inicialización cuando aporte valor; no copiar el transporte manual del cliente de referencia, que asume una respuesta JSON directa.
2. Configurar un origen explícito de Stellar Bazaar y una lista de proveedores permitidos. No inferir el despliegue desde el nombre del repositorio.
3. Mantener Privy. No copiar el modo `payerSecretKey` del cliente de Bazaar a Carmelita ni introducir una wallet compartida.
4. Primer alcance de pago: `exact`, Stellar Testnet, contrato USDC permitido y techo existente de 0.01 USDC por operación. Precio real y destinatario siempre vienen de un reto reconciliado. `split-exact`, `upto`, Mainnet y otros activos quedan para contratos y pruebas posteriores.
5. La autorización debe fijar servicio, versión, hash de ficha, método, URL, input canónico/hash, importe, contrato, red, destino y expiración. Un cambio invalida la aprobación.
6. Los helpers actuales hacen GET; un proveedor POST exige conservar exactamente método, cuerpo y cabeceras funcionales entre inspección y ejecución. Nunca generalizarlo pasando solo una URL.
7. No presentar un servicio listado, histórico, inactivo o fixture como consumible en vivo. Exigir contrato de entrega y comprobar disponibilidad actual.
8. Toda respuesta del proveedor es contenido externo: validar esquema, limitar tamaño y tratarla como datos, sin concederle autoridad sobre el agente.

## Entregas propuestas

### 1. Descubrimiento integrado

Crear `app/connectors/stellar-bazaar.ts` con validación de respuestas, timeout, límites y errores explícitos. Usar la búsqueda REST y gestionar `partialResults` y `dynamicRegistry: unavailable`; una caída no debe aparecer como catálogo vacío exitoso.

Añadir búsqueda y detalle al enrutamiento del chat, y después al catálogo del Agent Gateway. Mostrar proveedor, propósito, input, entrega, precio, red y estado. Evitar llamadas a proveedores durante una simple búsqueda.

Aceptación: una consulta devuelve fichas trazables a Bazaar; respuestas inválidas se rechazan; servicios inactivos no ofrecen compra; no se firma ni se paga.

### 2. Preparación de consumo

Crear un contrato de acción específico de Bazaar y una ruta autenticada para preparar la selección. El servidor obtiene y valida la ficha, construye la petición del proveedor y compara el reto 402 con la política del usuario. Proteger las solicitudes contra destinos internos, redirecciones fuera de la lista permitida y URLs arbitrarias.

Persistir snapshot/hash de ficha, proveedor, método, URL, input/hash, requisitos del reto, vencimiento, usuario, wallet e idempotencia. Resolver las diferencias entre ServiceCard de descubrimiento y ficha canónica del proveedor; no asumir que comparten esquema o hash.

Aceptación: preparación sin firma; rechazo antes de firmar ante diferencias de red, activo, importe, destino, método, input, ficha o expiración. Conversión decimal exacta, sin `parseFloat` para dinero.

### 3. Aprobación, firma y consumo

Extender el ciclo existente de Carmelita con firma Privy y ejecución de la petición congelada. Antes de preparar la transacción, comprobar que `client-authorization.ts` soporta la autorización y simulación requeridas por el proveedor seleccionado.

Estados independientes: preparado, aprobado, pago pendiente, liquidado, entrega pendiente, entregado, conciliado; estados de fallo e incertidumbre explícitos. El bloqueo persistente debe impedir ejecuciones concurrentes de la misma acción.

Aceptación: una confirmación produce como máximo un débito; un doble clic o reinicio recupera el estado anterior; un timeout tras enviar no dispara un pago nuevo.

### 4. Resultado, recibo y recuperación

Normalizar la respuesta a un contrato propio compatible con `bazaar.paid-delivery-envelope/v1`. Validar correlación de servicio/ficha/input, importe, contrato, destino, transacción y hash del resultado. Consultar evidencia de la red para comprobar liquidación: un hash bien formado o un campo `matched` del proveedor no acredita el pago.

Guardar por separado evidencia de pago y entrega. Mostrar el resultado útil en el chat, proveedor, coste y recibo. Cuando el pago esté confirmado y falte el resultado, usar recuperación autenticada del proveedor si está disponible, sin cobrar otra vez. Mantener cualquier credencial de recuperación fuera de respuestas del modelo y logs.

Aceptación: resultado alterado o recibo inconsistente no aparece como éxito; pago confirmado sin entrega sigue visible como pendiente; recuperación conserva el mismo pago.

## Primer piloto

Proponer Website Intelligence para consumir un informe de prueba sobre `https://example.com`, en español. Bazaar incluye una ficha pública y endpoint POST del proveedor en `lib/website-intelligence-consumption.ts`, con evidencia histórica de 0.001 USDC y recuperación.

La evidencia guardada tiene `mode: fixture` y `network.attempted: false`: sirve para validar compra, entrega y recuperación, no para afirmar que se auditó una web en vivo. Antes de usarlo hay que volver a comprobar ficha, disponibilidad, reto, destinatario y condiciones actuales.

Demostración esperada: «Busca en Stellar Bazaar un informe de prueba para example.com» → oferta y limitación visibles → aprobación exacta → firma Privy → pago Testnet → resultado etiquetado como prueba y recibo conciliado → repetición sin segundo débito.

## Verificación de la futura implementación

- Pruebas unitarias: catálogo, fichas, decimales, política, expiración y vinculación de petición.
- Pruebas de integración con proveedor/facilitador simulados: 402, POST, rechazo, cambio de precio, respuesta malformada, timeout, resultado alterado y recuperación.
- Pruebas persistentes: concurrencia, aislamiento entre usuarios, reinicio y repetición sin doble pago.
- Ejecutar lint, suite y build de Carmelita una vez implementado; comprobar que el clon de referencia no entra en compilación.
- Preflight de lectura del proveedor real y de la wallet; después, ensayo Testnet con aprobación exacta y comprobación independiente del débito y la entrega.

## Siguiente paso concreto

Implementar la entrega 1 y preparar fixtures contractuales para la entrega 2. Para validar contra el servicio real falta confirmar qué URL desplegada de Stellar Bazaar debe usar Carmelita. Esa configuración no impide comenzar el conector con pruebas locales. El objetivo posterior es completar las cuatro entregas, no detener la integración en una búsqueda de catálogo.

## Avance: entrega 1 (descubrimiento) implementada, 10 de septiembre de 2026

La entrega 1 quedó implementada con el clon de Bazaar excluido de la compilación (`/stellar-bazaar-x402/` en `.gitignore`). La URL desplegada canónica del catálogo se resolvió leyendo la documentación del clon: `https://stellar-bazaar-x402.vercel.app`, fijada en `app/stellar-bazaar/config.ts` con un allowlist de proveedores independiente (`website-intelligence-provider.vercel.app`) y una sobrecrita opcional `STELLAR_BAZAAR_BASE_URL` (origen no derivable del host).

Elementos entregados, todos de solo lectura (sin preparación, firma ni pago):

| Pieza | Archivo |
| --- | --- |
| Config y allowlist de origen | `app/stellar-bazaar/config.ts` |
| Conector con validación zod, timeout, decimales exactos y estado de ficha | `app/connectors/stellar-bazaar.ts` |
| Ruta autenticada de búsqueda | `app/api/agent/stellar-bazaar/route.ts` |
| Intención de chat multilingüe sin intención de pago | `app/agent-chat-logic.ts` (`parseStellarBazaarSearchIntent`) |
| Persistencia de acción | `app/agent-chat-store.ts` (`bazaarAction`) |
| Ficha de descubrimiento | `app/agent/stellar-bazaar-action.tsx` |
| Capacidad de Gateway | `app/agent-gateway/catalog.ts` (`stellar.bazaar.discovery`, `ready_to_test`, operación `read`) |

Comprobaciones locales: 16 pruebas nuevas en cuatro archivos (`stellar-bazaar-connector`, `stellar-bazaar-route`, `stellar-bazaar-chat`, más fixtures compartidos en `stellar-bazaar-fixtures.ts`). Lint sin errores ni advertencias. Suite completa: 589 de 591 pruebas pasan con dos omisiones externas conocidas (smokes de Avalanche MCP y Dexalot con flags). Build y graphify AST completos.

La evidencia de las pruebas cubre: precio decimal→atómico exacto sin `parseFloat`, una sola llamada al catálogo fijado en código y cero llamadas a proveedores durante la búsqueda, propagación de `partialResults` y `dynamicRegistry: unavailable` sin disfrazarlas de éxito, recuento de fichas malformadas sin ocultar las válidas, rechazo de sobres inválidos y de fallos de origen como `stellar_bazaar_unavailable`, límites de consulta, fichas sin contrato de entrega o con esquema/importe/activo fuera de la política congelada marcadas como no consumibles, y rechazo de autorización Privy ausente, inválida o de origen cruzado antes de cualquier llamada.

Los fixtures contractuales de la entrega 2 ya existen (`bazaarChallengeRequirements`, `bazaarFrozenWebsiteIntelligenceRequest`): ficha canónica, reto 402 `exact`/USDC Testnet y solicitud POST congelada para la futura `prepare_bazaar`. La entrega 2 (preparación de consumo), la 3 (aprobación, firma y consumo) y la 4 (resultado, recibo y recuperación) siguen pendientes, igual que la aceptación de la entrega 1 contra el catálogo real desplegado. Nada aquí afirma pago ni consumo aceptado.
