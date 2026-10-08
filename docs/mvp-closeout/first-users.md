# Primeros usuarios de Carmelita en ChatGPT

Guía actualizada el **8 de octubre de 2026**. Producción comprobada al preparar el cierre: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`. La prueba externa CGPT-01 completó registro, autorización y consulta de wallets. Móvil, revocación, reconexión y aislamiento continúan pendientes en la [matriz de aceptación](./evidence-matrix.md).

## Dónde comenzar

| Entrada | Destino productivo |
| --- | --- |
| Landing | [Carmelita](https://carmelita.browns.studio/) |
| Guía paso a paso | [Conectar con ChatGPT](https://carmelita.browns.studio/connect-chatgpt) |
| Acceso directo a tu cuenta | [Ingresar a Carmelita](https://carmelita.browns.studio/agent) |
| Catálogo | [Explorar servicios](https://carmelita.browns.studio/services) |
| URL del servidor MCP | `https://carmelita.browns.studio/api/mcp/agent` |

Usa una cuenta ChatGPT propia con permiso para agregar un MCP personalizado. La disponibilidad depende de tu cuenta y las políticas del espacio; crear una cuenta no garantiza ese permiso. Si la opción no aparece, usa la ayuda de la guía o consulta al administrador del espacio.

Tu identidad Carmelita puede existir antes o crearse durante la autorización iniciada desde ChatGPT. Usa la misma identidad y un correo verificado para conservar tus wallets. No necesitas preparar otra cuenta o reemplazar una wallet existente para conectarte.

## Conectar y probar

1. Abre la guía desde la landing y copia la URL MCP indicada arriba. La guía ofrece abrir la sección correspondiente de ChatGPT; la instalación y el consentimiento son manuales.
2. Agrega Carmelita como conexión MCP y elige OAuth. Inicia sesión o crea tu cuenta Carmelita en la autorización, revisa los permisos y autoriza sólo los que quieras compartir. Puedes cancelar.
3. Continúa de vuelta a ChatGPT, abre un chat nuevo y selecciona Carmelita. Copiar la URL o abrir la guía no significa que la conexión haya quedado autorizada.
4. Pregunta **«Muéstrame mis billeteras registradas»**. Deben aparecer Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet. Compara tus direcciones privadamente con tu cuenta Carmelita.
5. Pregunta **«¿Está activa mi cuenta Stellar Testnet?»**. La preparación intenta activar la misma dirección con XLM Testnet si la red confirma ausencia. Una respuesta pendiente o indisponible debe conservarse como tal; una wallet registrada no prueba saldo ni activación.
6. Puedes preguntar **«¿Qué servicios publica Bazaar y cuáles están disponibles?»** y **«Muéstrame mi actividad reciente»**. Un catálogo parcial o una actividad vacía no son un éxito de compra o ejecución.

Avalanche, Base y BNB comparten una dirección EVM; Solana y Stellar usan sus propias direcciones. Registrar estas redes no las financia todas. XLM es nativo y no necesita trustline; USDC y sus firmas quedan para una entrega independiente. Véase [Guía Stellar](../privy-stellar-testnet.md).

`agent:read` autoriza consultas, no pagos. El historial de conversaciones Carmelita necesita consentimiento adicional y no equivale al historial completo de ChatGPT ni al de compras Bazaar. Claude, ejecución de servicios y compras siguen su aceptación por separado.

## Completar la prueba externa

El [checklist vigente](./external-tester-checklist.md) explica móvil, cancelación/reintento, revocación desde Carmelita, reconexión con las mismas direcciones y prueba con otra identidad. Si revocas, una consulta privada nueva debe perder acceso; un mensaje anterior guardado en ChatGPT no comprueba acceso vigente.

Ante un problema, registra paso, entorno, SHA identificado, fecha, cliente y mensaje saneado. No compartas contraseñas, cookies, tokens, códigos, magic links, firmas, correos, DID o direcciones personales. Compara pertenencia y continuidad de datos de forma privada y registra sólo el resultado.

Para un entorno QA, el coordinador debe entregar su endpoint explícito e identificar su SHA. Visitar una Preview que copie producción no acredita QA. Esta jornada conserva producción y no crea builds ni deploys hospedados.

El recorrido demostrado y los límites para 500 LatAm se resumen en [Milestone ChatGPT](./chatgpt-milestone.md).