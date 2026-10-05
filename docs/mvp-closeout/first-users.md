# Primeros usuarios de Carmelita

Versión de trabajo: 5 de octubre de 2026. Base local al preparar esta guía: `8c5b11f73f15f5d5add3f5f23ddd01fabf2db6c0`. El coordinador debe completar el SHA y el despliegue realmente probado antes de aprobar un piloto; esta guía no acredita publicación.

Carmelita permite consultar tus billeteras registradas, descubrir el catálogo público de Bazaar y revisar tu actividad propia. El historial de conversaciones tiene un permiso adicional. La compra de servicios desde ChatGPT y el historial privado de Bazaar siguen bloqueados.

## Dónde comenzar

**`/connect-chatgpt` y `/services` son rutas nuevas de la candidata y todavía no están publicadas en producción.** Hasta verificar su promoción, pruébalas únicamente en el origen local o Preview indicado por el coordinador. Los destinos canónicos previstos para esas rutas se usarán sólo después de comprobar la promoción y su SHA desplegado.

| Entrada | Destino canónico de referencia |
| --- | --- |
| Inicio | [carmelita.browns.studio](https://carmelita.browns.studio/) |
| Alta o acceso propio | [Ingresar a Carmelita](https://carmelita.browns.studio/agent) |
| Conexión manual — ruta nueva; promoción pendiente | `https://carmelita.browns.studio/connect-chatgpt` |
| Catálogo público — ruta nueva; promoción pendiente | `https://carmelita.browns.studio/services` |
| Recurso MCP personal | `https://carmelita.browns.studio/api/mcp/agent` |

Estos destinos no acreditan que producción ejecute el SHA candidato ni que ya disponga de las rutas nuevas. La Preview de PR46 es un entorno QA separado y protegido. El coordinador facilita su URL y acceso a los testers; no se publica un enlace de bypass. Para probar una Preview hay que seleccionar su recurso MCP explícitamente. La guía de la candidata muestra la URL MCP de producción y no cambia por visitar una Preview.

Si la protección de Preview impide que ChatGPT descubra el MCP, registra ese bloqueo. No desactives la protección ni atribuyas una consulta a producción como prueba de la candidata.

La conexión se realiza desde ChatGPT web con una cuenta y un espacio de trabajo compatibles. En Settings, activa Developer mode en Security and login; luego, en Plugins, añade una conexión con el endpoint MCP y revisa las herramientas descubiertas. La disponibilidad depende de la cuenta y las políticas del espacio de trabajo. Si faltan esas opciones, registra el bloqueo y consulta a su administrador. [Instrucciones oficiales de OpenAI, revisadas el 5 de octubre de 2026](https://developers.openai.com/plugins/deploy/connect-chatgpt).

Cuando aparezca la autenticación de Carmelita, usa OAuth e ingresa con Privy con tu misma identidad Carmelita. Revisa la aplicación y los permisos; puedes denegar. Tras autorizar, utiliza Continuar para volver a ChatGPT. No se ha acreditado una instalación directa en un clic ni una conexión exitosa de una segunda cuenta independiente para esta candidata.

## Prueba independiente en diez pasos

Usa cuentas A y B realmente distintas, con sesiones o perfiles separados. A y B son seudónimos del registro de QA. No reutilices el token o la conexión de A para probar B. Una dirección registrada no demuestra saldo, activación ni fondos disponibles; las redes EVM pueden compartir una dirección.

1. **Identifica la versión.** Registra SHA confirmado por el coordinador, origen web, recurso MCP seleccionado, ambiente —producción o QA—, fecha, navegador y dispositivo. Si no se conoce el SHA desplegado, marca la prueba como pendiente de versión.
2. **Abre la landing.** Elige ES, EN o PT y comprueba las entradas Conectar Carmelita con ChatGPT y Explorar servicios. Revisa con teclado y móvil que puedas leer y activar los controles.
3. **Ingresa como A con Privy.** Si ya tienes billeteras, conserva esa identidad y las direcciones existentes. Espera la preparación y revisa los registros de Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet. Anota los estados pendientes; no los presentes como listos.
4. **Conecta A manualmente.** Sigue la guía, selecciona el origen correcto, usa OAuth y la misma cuenta Carmelita. Revisa los permisos antes de aceptar. Si cambió el despliegue o sus herramientas, actualiza la conexión y empieza una conversación nueva.
5. **Consulta billeteras en ChatGPT.** Selecciona Carmelita y pregunta: «Muéstrame mis billeteras registradas». Compara en privado redes y direcciones con la web de A y verifica los exploradores. Registra únicamente las redes y el resultado saneado.
6. **Descubre Bazaar.** Pregunta: «¿Qué servicios publica Bazaar y cuáles están disponibles?». Contrasta con /services y su fecha de consulta. La observación de referencia contiene dos servicios históricos, dos suites declaradas y skills no disponibles. Si el catálogo cambia, registra la respuesta real. No tiene que aparentar un catálogo completo.
7. **Prueba permisos e historial propios.** Pregunta por tu actividad reciente con `agent:read`; una lista vacía es un resultado válido. La conversación privada de Carmelita requiere `agent:conversation` y consentimiento visible adicional. Sin ese permiso debe rechazarse; si decides concederlo, comprueba sólo tu conversación existente. No es el historial completo de ChatGPT ni el de compras Bazaar.
8. **Prueba B desde el alta.** Con una segunda identidad real, repite alta, OAuth y lectura en una sesión separada. Comprueba que obtiene únicamente sus registros y actividad. Verifica con el coordinador que respuestas pendientes de A no aparecen en B. No basta con abrir otro chat de la cuenta A.
9. **Prueba recuperación en QA protegido.** Con el coordinador, interrumpe una consulta inocua o su respuesta. Conserva un borrador sin datos sensibles. Ante el error, usa Reintentar carga o Recuperar historial: debe leer la conversación mediante GET, mantener el borrador en ese componente y no reenviar automáticamente el mensaje. Si el servidor guardó un mensaje antes de perderse la respuesta, debe recuperarse. Confirma el método sin copiar cabeceras ni tokens. No se promete conservar un borrador tras recargar toda la página o cerrar el navegador.
10. **Comprueba celular, zoom y revocación.** Tras conectar en web, utiliza la misma cuenta ChatGPT de A en el teléfono y selecciona el mismo conector. Prueba billeteras, catálogo e historial con su permiso. Repite con B si su cliente lo permite. Verifica zoom al 200 % medido, revoca la conexión desde Carmelita y comprueba que la sesión revocada pierde acceso. Si el cliente no ofrece el conector, registra ese bloqueo; la prueba móvil no pasa por funcionar en desktop.

El flujo no requiere financiar billeteras para consultar registros o catálogo. No pruebes firmas, transferencias ni compras como parte de estos diez pasos.

## Qué registrar

| Campo | Valor a completar |
| --- | --- |
| SHA final desplegado y evidencia de correspondencia | Pendiente |
| Origen web / ambiente | Pendiente |
| Endpoint MCP y nombre del conector seleccionado | Pendiente |
| Usuario seudónimo A o B / permisos consentidos | Pendiente |
| Fecha y dispositivo / versión del cliente | Pendiente |
| Redes presentes / registro pendiente o registrado | Pendiente |
| Caso / resultado observado / pendiente y motivo | Pendiente |
| Captura saneada o evidencia privada del coordinador | Pendiente |

Conserva tokens, códigos, cookies, claves, magic links y firmas fuera de este registro. No publiques emails, IDs de propietario, direcciones personales ni capturas de conversaciones privadas. Para comprobar pertenencia compara esos datos en privado y registra el resultado con A/B.

## Si algo queda pendiente

Si una autorización vence o queda incierta, inicia una conexión nueva desde ChatGPT y revisa su estado; no repitas decisiones inciertas de forma automática. Si falla una consulta, informa paso, origen, SHA, red y texto de error saneado. Un proveedor caído o un catálogo parcial debe seguir mostrándose como tal. Una consulta de saldo no disponible no equivale a saldo cero.

## Financiación Testnet: sólo cuando exista un servicio aceptado

Esta preparación es independiente de las pruebas de lectura y requiere confirmación del usuario:

- Obtener su dirección Stellar existente desde Carmelita; comprobar Testnet y activar esa misma cuenta si falta.
- Verificar el USDC exacto: código e issuer o contrato SAC del requisito aceptado. El símbolo USDC de la ficha no basta.
- Revisar y aprobar la trustline correspondiente. Confirmar que el activo del faucet coincide; si no coincide, detenerse.
- En [Sozu Faucet](https://faucet.sozu.capital/), indicar la dirección existente: omitirla puede generar otra billetera. Verificar saldo y activo en esa dirección.

No se realizan solicitudes de fondos, trustlines o firmas automáticamente. Los requisitos y la observación del faucet están en [Contrato Bazaar](./bazaar-contract.md). Mainnet necesita una entrega y autorización propias; los fondos Testnet no se convierten en fondos Mainnet.

La aceptación y sus pendientes se registran en [Matriz de evidencia](./evidence-matrix.md).
