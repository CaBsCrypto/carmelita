# Demo para 500 LatAm: tres minutos

> **Documento histórico: corte del 5 de octubre de 2026.** Conserva el guion y las observaciones de esa fecha; no describe el estado actual de PR46 o producción. Para presentar el alcance actual, consultar la ficha del [milestone ChatGPT](./chatgpt-milestone.md) y la [política de builds](./vercel-build-policy.md). No ejecutar sus pasos de Preview, fusión o publicación hasta revisar Billing y acordar una publicación concreta.

Carmelita propone ser una pasarela de aplicaciones desde la conversación: una identidad propia, descubrimiento de servicios y permisos claros. La primera demostración implementada cubre consultas y catálogo. La compra nativa, la asociación privada de comprador con Bazaar y el nuevo Guionista siguen pendientes; no se presentan como funciones terminadas.

Base documental local: `8c5b11f73f15f5d5add3f5f23ddd01fabf2db6c0`, 5 de octubre de 2026. Antes de presentar, completar el SHA, el despliegue y las pruebas humanas de la [matriz](./evidence-matrix.md). La demo no prueba por sí sola un lanzamiento ni aceptación de 500 LatAm.

## Preparación

**`/connect-chatgpt` y `/services` son rutas nuevas de la candidata, todavía no publicadas en producción.** Los enlaces canónicos previstos se utilizarán sólo después de una promoción verificada; no presentar la guía como una página productiva ya funcional.

- Mostrar la candidata en el origen local o Preview46 QA protegida y declarar cuál se muestra. Utilizar producción canónica sólo después de verificar la promoción. Confirmar versión y recurso MCP seleccionado. El lector del catálogo siempre consulta el Bazaar canónico.
- Si la protección de Preview impide conectar desde ChatGPT, declarar ese paso pendiente; no desactivar la protección ni cambiar silenciosamente a producción.
- Ensayar el acceso Privy y OAuth con una cuenta propia y un espacio ChatGPT compatible. Preparar una conversación sin datos personales. El tiempo de alta y consentimiento puede exceder tres minutos; ensayar esa parte antes sin omitirla del recorrido.
- Tener abiertas landing, guía, /services y ChatGPT. La URL canónica MCP es `https://carmelita.browns.studio/api/mcp/agent`; una Preview se conecta por su propio endpoint.
- Revisar las respuestas reales del día. Si hay un fallo, mostrarlo y explicar el estado. No sustituirlo por una respuesta generada o una compra simulada.
- Para recuperación, preparar en QA una interrupción controlada de una consulta de lectura. Etiquetarla como prueba QA. Si se usa una captura de una prueba anterior, indicar origen, fecha y versión; no atribuirla al despliegue vivo.

La instalación sigue siendo manual y depende de cuenta/workspace. No hay instalación directa ni segunda cuenta independiente aceptadas en esta candidata. Su guía `/connect-chatgpt` enlaza la [fuente oficial de OpenAI](https://developers.openai.com/plugins/deploy/connect-chatgpt). Tras verificar la promoción, los destinos canónicos serán `https://carmelita.browns.studio/connect-chatgpt` y `https://carmelita.browns.studio/services`.

## Recorrido

| Tiempo | Mostrar | Explicación breve |
| --- | --- | --- |
| 00:00–00:20 | Landing: dos entradas principales | «Carmelita conecta tu identidad y tus consultas con ChatGPT. Hoy podemos revisar billeteras y descubrir servicios de otros proyectos.» |
| 00:20–01:00 | Guía, acceso Privy y consentimiento OAuth de la misma cuenta | «La conexión es manual. El servidor verifica al usuario y cada permiso se revisa. Consultar no autoriza a gastar.» Terminar con Continuar y seleccionar Carmelita en ChatGPT. |
| 01:00–01:35 | Pregunta: «Muéstrame mis billeteras registradas» | Mostrar las cinco redes: Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet. El estado del registro y la activación en red son distintos; no inventar balances. Ocultar direcciones personales al compartir. |
| 01:35–02:15 | Pregunta por servicios Bazaar y contraste en /services | Mostrar el estado parcial real, las dos fichas históricas y sus importes Testnet declarados, las dos suites como flujos declarados y skills no disponibles. «Publicar una ficha no certifica que podamos ejecutarla.» |
| 02:15–02:40 | Actividad propia; conversación sólo con consentimiento adicional | «La actividad es lectura propia. Compartir conversación requiere agent:conversation; sin ese permiso se rechaza.» Un historial vacío es válido. No mostrar historial privado de Bazaar. |
| 02:40–03:00 | Recuperación de la consulta interrumpida en QA | Usar Reintentar carga o Recuperar historial. Mostrar lectura GET, borrador conservado y ausencia de reenvío automático. «Podemos recuperar lo guardado; no damos por completada una operación porque se perdió su respuesta.» |

Si OAuth o la red consumen más tiempo, extender la demostración o declarar qué paso quedó pendiente. No anunciar el recorrido completo si se omitió un paso necesario.

## Catálogo que puede mostrarse

La observación canónica de referencia del 5 de octubre contiene:

| Elemento | Lo comprobado | Límite |
| --- | --- | --- |
| Swap Risk Quote (Sandbox) | Ficha histórica; importe declarado 0.001 USDC en Stellar Testnet | Proveedor no aceptado por esta consulta; no se ejecuta ni se paga |
| AI Video Scriptwriter & Creative Director | Ficha histórica ai-video-scriptwriter; importe declarado 0.02 USDC en Stellar Testnet | No equivale al nuevo Guionista de 0.01; no acredita entrega ni compra |
| Identidad de marca / Lanzamiento de campaña | Dos suites declaradas por el proveedor | Sin ejecutor de suites ni pagos o entregas comprobados |
| Skills Bazaar | Información no disponible en el contrato conectado | Una publicación futura será documentación, no ejecución automática |
| Guionista nuevo | Publicación y aceptación hospedada pendientes | No aparece como primer servicio aceptado ni comprable |

Las cantidades son datos del catálogo observado, no cotizaciones Mainnet ni prueba de financiación. Si cambian las fichas, usar el resultado actual con su fecha.

## Qué falta para el recorrido de compra

Se necesitan compatibilidad aplicable con OpenAI, firma de la operación exacta dentro del cliente, contrato hospedado aceptado de Bazaar y asociación segura del sujeto OAuth con su propietario Bazaar. Después deben probarse preparación, ejecución, estado e historial privados por separado, con aprobación exacta, vencimiento y reintentos sin duplicar cobros.

Orden creada, entrega y pago confirmado son estados diferentes. `agent:read`, una dirección escrita en el chat o un magic link de historial no concede permiso de compra. No se ofrecerá checkout como sustitución del bloqueo ni una generación gratuita presentada como compra real. La [consulta de compatibilidad](./openai-compatibility-inquiry.md) está preparada y sin enviar.

## Cierre propuesto

«Nuestro siguiente paso es incorporar un servicio aceptado de un proyecto externo y validar el uso con personas independientes. Buscamos feedback sobre el valor de descubrir y usar aplicaciones desde la conversación. Esta primera demo ya permite evaluar identidad, consultas y descubrimiento; la compra tiene requisitos externos y técnicos todavía abiertos.»

El usuario decide el envío y presenta el material a 500 LatAm. No se ha enviado ningún mensaje ni expediente automáticamente.

## Agenda de cierre

El objetivo de 72 horas termina el **8 de octubre de 2026 a las 00:27, America/Santiago**. Es una meta de trabajo, no un lanzamiento automático.

| Frente | Responsable | Condición de cierre |
| --- | --- | --- |
| Versión y publicación | Scrum Master / A9 | SHA final, suite requerida, build, CI y despliegue correspondientes; rollback conservado |
| Primeros usuarios | Usuario y tester independiente | Dos cuentas reales, móvil, permisos, aislamiento y recuperación registrados |
| Presentación | Usuario / A10 | Demo ensayada, evidencia saneada y alcance declarado |
| Compra y nuevo Guionista | OpenAI / Bazaar / validación del cliente | Requisitos resueltos y recorrido real aceptado; permanece bloqueado mientras falten |
| Financiación Testnet | Usuario | Misma dirección Stellar, activo exacto y trustline revisados; sin ejecución automática |
| Mainnet | Entrega posterior | Autorización y comprobaciones propias de red, activo, fondos reales y límites |

Si la compra sigue bloqueada al terminar las 72 horas, entregar el cierre técnico de lectura y catálogo con esa limitación visible. Cerrar ramas o completar el plazo no sustituye la aceptación.
