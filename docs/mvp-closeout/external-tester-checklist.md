# Checklist externo: conexión ChatGPT y wallets propias

Actualizado el **8 de octubre de 2026**. CGPT-01 completó alta, autorización y listado de wallets, según la prueba real reportada el 7 de octubre. **Celular, cancelación, revocación, reconexión y aislamiento siguen pendientes.** Este checklist sirve para completarlos con CGPT-01 y una segunda identidad CGPT-02.

## Antes de empezar

- El coordinador registra entorno, origen, endpoint y SHA del código desplegado. Producción comprobada al preparar la jornada: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542` en `https://carmelita.browns.studio`. Reconfirmar antes de cada sesión; el SHA del PR documental no sustituye ese dato.
- Usa tu cuenta ChatGPT y una identidad Carmelita propia. El permiso para agregar un MCP depende de la cuenta y del espacio de trabajo de ChatGPT; crear una cuenta no lo garantiza.
- Puedes registrarte en la autorización Carmelita iniciada desde ChatGPT. Usa siempre la misma identidad y su correo verificado; no crees otra para resolver una incidencia ni sustituyas wallets existentes.
- Usa un perfil o sesión separado del coordinador y del otro tester. No compartas tokens, cookies, códigos ni conexiones.
- Esta jornada no abre una Preview nueva ni provoca fallos en producción. La indisponibilidad de proveedores se comprueba con tests locales controlados. Una eventual prueba QA hospedada necesita origen aislado y ventana autorizada propia.

## Prueba básica y móvil

1. Abre [la landing](https://carmelita.browns.studio/) y elige la acción de conexión con ChatGPT. Sigue [la guía](https://carmelita.browns.studio/connect-chatgpt) sin ayuda paso a paso. Registra cualquier explicación adicional necesaria.
2. Copia `https://carmelita.browns.studio/api/mcp/agent` para esta prueba productiva. Comprueba que no contiene tokens. Si se asigna otro entorno, usa únicamente el endpoint explícito de ese entorno.
3. Agrega Carmelita en ChatGPT, elige OAuth e inicia sesión o crea tu cuenta Carmelita durante la autorización. Revisa los permisos y autoriza sólo los que quieras compartir. Copiar la URL no significa conexión completada.
4. En un chat nuevo, selecciona Carmelita y pregunta **«Muéstrame mis billeteras registradas»**. Espera estas cinco redes: Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet.
5. Compara las direcciones con tu cuenta Carmelita **en privado**. Avalanche, Base y BNB deben compartir tu dirección EVM; Solana y Stellar tienen sus propias direcciones. Una wallet registrada no demuestra saldo disponible.
6. Pregunta **«¿Está activa mi cuenta Stellar Testnet?»**. Sólo una comprobación actual de la red debe presentarla activa. Si aparece pendiente o indisponible, registra ese resultado y continúa las lecturas disponibles; no generes otra wallet. XLM es nativo, sin trustline. No pruebes USDC ni firmas.
7. Pregunta **«¿Qué servicios publica Bazaar y cuáles están disponibles?»** y **«Muéstrame mi actividad reciente»**. Catálogo parcial, proveedor indisponible o actividad vacía son resultados válidos si se explican. No pruebes compras o ejecución de servicios.
8. En tu celular, usa la misma cuenta ChatGPT y la misma conexión Carmelita. Selecciona el conector y repite wallets, estado Stellar, catálogo y actividad. Registra modelo de dispositivo, versión del cliente, fecha y resultado. Si no aparece el conector, registra el bloqueo; escritorio no aprueba este caso.

## Cancelación, revocación y reconexión

1. Inicia una autorización nueva y **cancela antes de aceptar**. Comprueba que vuelve a un estado claro y no anuncia una conexión completada. No aceptes permisos para superar el caso de cancelación.
2. Reintenta desde ChatGPT con tu misma identidad Carmelita. Tras autorizar, compara en privado las direcciones con el registro anterior; deben conservarse.
3. Ingresa con tu identidad Carmelita en [`/agent`](https://carmelita.browns.studio/agent), abre **Cuenta → Conexiones → Chats conectados a Carmelita** y pulsa **Revocar acceso** en la conexión ChatGPT. Confirma la decisión, anota la hora y realiza una consulta privada nueva desde ChatGPT. Debe pedir autorización o rechazar el acceso; una respuesta anterior almacenada en el chat no prueba que el token siga vigente. Si la sección no aparece o no carga, registra el bloqueo.
4. Vuelve a conectar sólo si decides aprobar otro consentimiento. Consulta de nuevo las cinco redes y confirma que conserva las mismas direcciones. Desconectar sólo en ChatGPT no sustituye la revocación desde Carmelita.

## Segunda identidad y cambio de sesión

CGPT-02 repite el recorrido desde su propia identidad y sesión. Cada persona compara sus datos de forma privada: ninguna debe recibir las wallets ni la actividad de la otra. Abrir otro chat de CGPT-01 no crea una segunda identidad.

El coordinador comprueba además el cambio de usuario en el chat web Carmelita y el descarte de una respuesta pendiente de la sesión anterior. Los plazos, errores y respuestas tardías se ejercitan con transportes controlados **localmente**; no se bloquean servicios ni se modifica producción para provocar el caso. Registra por separado evidencia técnica y observación humana.

El historial de conversaciones Carmelita requiere permiso adicional. No equivale al historial completo de ChatGPT ni al historial de compras Bazaar; `agent:read` no lo concede automáticamente.

## Registro de resultados

| Campo | Qué registrar |
| --- | --- |
| Caso / estado | Aprobado, Fallido o Pendiente; motivo concreto |
| Versión | SHA desplegado, origen, entorno y endpoint sin credenciales |
| Persona | CGPT-01 o CGPT-02; ningún correo ni ID de propietario |
| Sesión | Fecha y zona horaria, navegador o cliente y dispositivo |
| Resultado | Redes presentes, estados de registro/activación y comparación privada de pertenencia o continuidad |
| Permisos | Scopes consentidos y resultado de cancelación/revocación |
| Ayuda o fallo | Paso que necesitó ayuda y mensaje saneado |

No compartas contraseñas, códigos OAuth, tokens, cookies, claves, magic links ni firmas. No publiques capturas de URLs de autorización, correos, direcciones, IDs de propietario o conversaciones privadas. Conserva la comparación privada y registra sólo su resultado.

**Aceptación:** una persona externa completa el recorrido siguiendo la guía; móvil, revocación y continuidad de direcciones pasan sobre un despliegue identificado; dos identidades mantienen aislamiento. Teclado, 320 px y zoom al 200 % tienen su evidencia técnica propia. Los resultados se incorporan a la [matriz](./evidence-matrix.md); no se anuncian aprobados antes de recibirlos.
