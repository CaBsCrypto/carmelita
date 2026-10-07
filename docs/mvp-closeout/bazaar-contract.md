# Bazaar: contrato observado y requisitos de consumo

Fecha: 5 de octubre de 2026. La implementación de este sprint permite consultar el catálogo y mostrar bloqueos comprobados. No implementa una vinculación de comprador, firma nativa, compra ni historial privado de Bazaar.

## Lo hospedado

La observación de sólo lectura conservada en `work/mvp-closeout-20261005/bazaar-public-contract.json` comprobó HTTP 200 en ambos endpoints, el 5 de octubre de 2026 a las 03:28–03:29 UTC. No llamó proveedores ni solicitó pagos.

| Superficie | Estado observado |
| --- | --- |
| `https://bazaar.browns.studio/api/mcp` | Versión `0.5.0`; `read-only`; `writes: []`; `paidCall: false`; `signing: false` |
| `https://bazaar.browns.studio/api/discovery/resources` | Dos ServiceCards v0; `partialResults: true`; `dynamicRegistry: unavailable` |
| Servicio histórico de guiones | `ai-video-scriptwriter`, publicado como metadato de catálogo; proveedor no validado por este ejercicio |
| Guionista de la siguiente versión | Publicación y aceptación hospedada pendientes; no equivale automáticamente al servicio histórico |
| Entrega declarada | Síncrona, sin retención duradera; esto no acredita entrega real ni recuperación privada |

El MCP observado anuncia `get_operation_history`, pero el nombre de una herramienta no acredita una sesión privada vinculada con la identidad Carmelita. No se llamó a esa herramienta ni se usaron credenciales ajenas.

El candidato local de Bazaar contiene un contrato `0.7.0`, workspaces privados y un diario con pagos **reportados sin verificar**. No se considera publicado ni aceptado por lo que anuncia ese código. La inspección fue de sólo lectura y excluyó secretos, cuentas privadas y cambios en ese repositorio.

## Contrato consumible en Carmelita

`app/bazaar/readiness.ts` exporta un DTO `carmelita.bazaar-readiness/v1`, usado por las consultas y las fichas del catálogo. Separa publicación de la disponibilidad operativa. Una declaración positiva del proveedor permanece `not_verified`; una negativa puede indicar `unavailable`. Servicios, suites y skills permanecen `executable: false`.

Los bloqueos de compra están fijados por la versión de Carmelita; una respuesta remota, un argumento del modelo o una variable de disponibilidad no los pueden levantar:

- Compatibilidad de comercio en ChatGPT sin resolver.
- Firma de la operación exacta dentro de ChatGPT sin validar.
- Aceptación de compra en el despliegue hospedado pendiente.
- Contrato aceptado de asociación entre sujeto OAuth y propietario Bazaar ausente.

Preparación, ejecución, estado privado e historial privado son fases separadas y permanecen deshabilitadas. No se publican nuevos tools de compra, aprobación o ejecución. `agent:read` sólo autoriza las lecturas permitidas de Carmelita; nunca permite gastar ni otorga por sí mismo acceso al historial de otra aplicación.

`app/bazaar/contract.ts` contiene requisitos de consumidor, no un protocolo anunciado por Bazaar ni nuevas rutas. Su normalizador de reportes es local: conserva orden, pago y entrega como estados separados, nunca fabrica un recibo y nunca convierte una entrega o un reporte de pago en un pago confirmado. Rechaza versiones desconocidas, datos de credenciales y supuestas confirmaciones. Un reporte sin versión o vencido sigue sin autorizar reintentos de compra.

## Qué debe aceptar Bazaar antes de vincular y comprar

El requisito versionado `carmelita.bazaar-consumption/v1` exige cuatro operaciones distintas; sus rutas, issuer y scopes deberán provenir del contrato hospedado aceptado, no inventarse en Carmelita:

| Operación | Condición mínima |
| --- | --- |
| Preparar | Propietario obtenido en servidor; congelar servicio, entrada, activo completo, importe, red, destinatario y vencimiento; aún sin permiso de gasto |
| Ejecutar | Permiso de escritura separado, aprobación de los términos exactos y firma comprobable; expiración y reintento que recupera el original |
| Estado | Lectura del propietario autorizado; estado de orden, evidencia de pago y entrega separados |
| Historial | Lectura privada del mismo propietario, resultados duraderos y recuperación tras pérdida de respuesta |

La asociación debe resolver y verificar en servidor el sujeto OAuth del usuario y el propietario Bazaar correspondiente. Debe respetar consentimiento, audiencia, issuer, vencimiento y revocación. No aceptar selectores de propietario enviados por el modelo, coincidencias de email, direcciones de billetera o un booleano `connected` como prueba. Un magic link de lectura histórica tampoco concede escritura ni compra. La vinculación OAuth existente de Carmelita con Privy no crea automáticamente una vinculación con Bazaar.

El `plan_action` actual del MCP personal persiste planes sin preparar transacciones, sin firma y con `continuationUrl: null`. No se añade una capacidad de compra Bazaar ni se convierte ese plan en handoff de pago. Cambiar esa frontera requiere revisión y aceptación separadas.

Las consultas compartidas `list_capabilities`, `get_capability` y `list_avalanche_capabilities` proyectan las entradas financieras y de puentes como `status: blocked`, conservando su estado de implementación en `implementationStatus`. Usan una lista cerrada de campos: no devuelven instrucciones heredadas de compra ni checkout, evidencia narrativa, workflows o handoffs anidados. `nativeChannelBoundary` declara preparación, aprobación, firma, ejecución y handoff deshabilitados en ChatGPT. Las consultas de precios, saldos y demás lecturas conservan sus datos y errores. Este cambio afecta la descripción del catálogo consultable, no los handlers financieros propios de la aplicación.

## Compatibilidad y consulta preparada

Los [App Developer Terms](https://openai.com/policies/developer-apps-terms/) incluyen conectores personalizados y restringen facilitar transferencias monetarias, cripto y financieras mediante sus servicios. Las [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) restringen la venta de productos y servicios digitales. Se revisaron el 5 de octubre de 2026; no encontramos una excepción explícita para Testnet. La ausencia de valor monetario no se interpreta como autorización.

El borrador [openai-compatibility-inquiry.md](./openai-compatibility-inquiry.md) está preparado y sin enviar. Mientras ese requisito siga pendiente, no se anuncian botones de compra ni una alternativa de checkout que eluda la restricción. Una generación gratuita o simulada no se presentará como compra realizada.

## Financiación Testnet de la dirección existente

La página pública de [Sozu Faucet](https://faucet.sozu.capital/) comprobada el 5 de octubre de 2026 permite indicar una dirección existente C…/G…; omitirla puede generar una billetera nueva. Para este piloto se debe proporcionar exactamente la dirección Stellar registrada del usuario y conservarla. No se ejecutó ningún comando del faucet ni se generó una billetera.

1. Obtener la dirección propia desde el registro autenticado de Carmelita. Activar esa cuenta Testnet si no existe, mediante su recorrido de confirmación.
2. Verificar el activo completo de los requisitos de pago aceptados: red, código e issuer o contrato SAC. El texto «USDC» de una ficha de catálogo no identifica por sí solo el activo.
3. Revisar y aprobar la trustline exacta, cuando corresponda, mediante el flujo del usuario. Comprobar que el USDC ofrecido por Sozu coincide con ese activo; si no coincide, detener la financiación para ese servicio.
4. Solicitar fondos para la misma dirección y verificar allí el saldo y el activo. Nunca solicitar secretos en el chat ni sustituir el issuer por uno con el mismo símbolo.

No se realizaron trustlines, transferencias ni cambios de configuración. Mainnet requiere una entrega y autorización propias: puede conservar identidad y dirección, pero necesita comprobar red, activo, trustline, fondos reales y límites. Los fondos Testnet no se convierten en Mainnet.

## Validación local

`node --import tsx --test tests/bazaar-contract.test.ts`: seis casos aprobados. Incluyen falsa disponibilidad del proveedor, identidad forjada, magic link y `agent:read` sin gasto, reportes vencidos o sin protocolo y entrega sin pago verificado. Estas pruebas no acreditan firma nativa, aceptación hospedada, una compra real ni aislamiento remoto entre compradores.
