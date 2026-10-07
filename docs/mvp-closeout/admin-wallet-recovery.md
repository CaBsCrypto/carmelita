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

## Registro y activación Stellar

Una fila persistida con estado legacy `active` o `pending` es una wallet registrada en Carmelita. Las consultas devuelven `registrationState: "registered"` y la incluyen en la cobertura de redes registradas. `walletReadiness.complete` sólo describe esa cobertura interna, no la existencia de cuentas en cadena ni su saldo. El estado almacenado se conserva.

`pendingRegistration` queda vacío para wallets ya registradas. `pendingActivation` se conserva por compatibilidad como indicador legacy con `pendingActivationScope: "legacy_registry_status_not_live"`; no es una lectura actual de Stellar.

Para comprobar activación, consultar `read_personal_wallets_status` o `read_personal_wallets_balances`. Una respuesta Horizon 404 indica `onChainAccountExists: false` y `status: "not_activated"`: **registrada en Carmelita; cuenta todavía no activa en Stellar Testnet**. Si Horizon falla, devolver `onChainAccountExists: null` y `unavailable`, conservando el registro sin inventar ausencia o saldo cero. Un estado legacy `pending` también puede coexistir con una cuenta activa si la lectura actual lo confirma.

Crear o financiar una cuenta Stellar es una operación separada sobre la misma dirección. La corrección de etiquetas no ejecuta esa operación ni cambia permisos.
