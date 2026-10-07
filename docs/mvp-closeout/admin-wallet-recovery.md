# Recuperación administrativa de wallets Testnet

El panel privado `/admin/wallets` permite completar un registro existente cuyo onboarding quedó incompleto. No crea otra cuenta ni otorga un permiso OAuth.

## Operación

1. Iniciar sesión con una identidad administrativa autorizada.
2. Localizar el registro exacto por su DID. Abrir **Recuperar preparación de wallets** y pulsar **Comprobar cuenta**.
3. Revisar el correo devuelto por Privy y el DID mostrado. No asociar un correo supuesto ni buscar wallets por correo.
4. Pulsar **Completar wallets de esta cuenta**. La acción vuelve a verificar identidad y correo, registra al operador y recupera las tres familias de wallets con la provisión idempotente existente.
5. Comprobar las direcciones y asociaciones en el registro actualizado. Una wallet Stellar pendiente de activación o fondos no equivale a un registro faltante.
6. El propietario puede consultar desde su conexión ChatGPT vigente si mantiene `agent:read` y el enlace al mismo DID. Una autorización vencida o revocada debe renovarse mediante el flujo OAuth normal.

## Controles y recuperación de fallos

- Sólo registros existentes y activos. Origin exacto y sesión administrativa vigente en ambas operaciones.
- El correo confirmado se utiliza para detectar una inspección obsoleta; el propietario siempre se identifica mediante el DID verificado por Privy.
- Una respuesta parcial, un conflicto, una identidad distinta o un error de persistencia no anuncian recuperación completada.
- Si la solicitud vence o se pierde su respuesta, actualizar el registro antes de reintentar. Los avances persistidos y las direcciones existentes se recuperan con las mismas claves de idempotencia.
- Creación, último ingreso y estado del perfil se conservan. La intervención se registra como `wallet.recovery.*`, no como un inicio de sesión del usuario.
- No se financian cuentas, preparan trustlines, firman transacciones ni modifican permisos de asistentes.

Los tests y el build verifican estos controles técnicamente. La confirmación de un registro real y su consulta posterior desde ChatGPT son evidencias separadas; no se sustituyen por fixtures.
