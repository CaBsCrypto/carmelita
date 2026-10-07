# Recuperación administrativa de wallets Testnet

El panel privado `/admin/wallets` permite completar un registro existente cuyo onboarding quedó incompleto. No crea otra cuenta ni otorga un permiso OAuth.

## Operación

1. Iniciar sesión con una identidad administrativa autorizada.
2. Localizar el registro exacto por su DID. Abrir **Recuperar wallets y activación Stellar Testnet** y pulsar **Comprobar cuenta**. La opción también está disponible para cuentas registradas con Stellar pendiente.
3. Revisar el correo devuelto por Privy y el DID mostrado. No asociar un correo supuesto ni buscar wallets por correo.
4. Pulsar **Completar wallets y activar Stellar Testnet**. La acción vuelve a verificar identidad y correo, registra al operador y recupera las tres familias de wallets con la provisión idempotente existente. Si Horizon confirma que falta la cuenta Stellar, solicita XLM Testnet a Friendbot para su misma dirección.
5. Comprobar las direcciones y asociaciones en el registro actualizado. Una wallet Stellar pendiente de activación o fondos no equivale a un registro faltante.
6. El propietario puede consultar desde su conexión ChatGPT vigente si mantiene `agent:read` y el enlace al mismo DID. Una autorización vencida o revocada debe renovarse mediante el flujo OAuth normal.

## Controles y recuperación de fallos

- Sólo registros existentes y activos. Origin exacto y sesión administrativa vigente en ambas operaciones.
- El correo confirmado se utiliza para detectar una inspección obsoleta; el propietario siempre se identifica mediante el DID verificado por Privy.
- Una respuesta parcial, un conflicto, una identidad distinta o un error de persistencia no anuncian recuperación completada.
- Si la solicitud vence o se pierde su respuesta, actualizar el registro antes de reintentar. Los avances persistidos y las direcciones existentes se recuperan con las mismas claves de idempotencia.
- Creación, último ingreso y estado del perfil se conservan. La intervención se registra como `wallet.recovery.*`, no como un inicio de sesión del usuario.
- La activación recibe XLM Testnet del Friendbot oficial, sin valor real. No prepara trustlines, solicita USDC, firma con la wallet del usuario ni modifica permisos de asistentes.

Los tests y el build verifican estos controles técnicamente. La confirmación de un registro real y su consulta posterior desde ChatGPT son evidencias separadas; no se sustituyen por fixtures.

## Registro y activación Stellar

Una fila persistida con estado legacy `active` o `pending` es una wallet registrada en Carmelita. Las consultas devuelven `registrationState: "registered"` y la incluyen en la cobertura de redes registradas. `walletReadiness.complete` sólo describe esa cobertura interna, no la existencia de cuentas en cadena ni su saldo. El estado almacenado se conserva.

`pendingRegistration` queda vacío para wallets ya registradas. `pendingActivation` se conserva por compatibilidad como indicador legacy con `pendingActivationScope: "legacy_registry_status_not_live"`; no es una lectura actual de Stellar.

Para comprobar activación, consultar `read_personal_wallets_status` o `read_personal_wallets_balances`. Una respuesta Horizon 404 indica `onChainAccountExists: false` y `status: "not_activated"`: **registrada en Carmelita; cuenta todavía no activa en Stellar Testnet**. Si Horizon falla, devolver `onChainAccountExists: null` y `unavailable`, conservando el registro sin inventar ausencia o saldo cero. Un estado legacy `pending` también puede coexistir con una cuenta activa si la lectura actual lo confirma.

## Activación automática de la misma dirección

El registro autenticado, la preparación posterior al consentimiento OAuth y la recuperación administrativa comparten el mismo helper de activación. Primero recuperan y persisten la identidad canónica, luego consultan Horizon Testnet. Una cuenta ya existente no solicita fondos. Una lectura desconocida o fallida tampoco solicita Friendbot: sólo una ausencia confirmada permite intentarlo.

La reserva de activación se guarda en `agent_testnet_faucet_claims` para el DID y dirección exactos, con activo `XLM` y `claimWindow` `stellar-activation:<address>`. `amount: 0` identifica una reserva de activación sin cantidad solicitada; no representa XLM entregados ni un saldo. No comparte reservas ni código con el faucet USDC. Las solicitudes simultáneas se resuelven con una inserción/actualización atómica, un plazo de reintento y actualización condicional de la reserva. Una respuesta incierta conserva el registro y no provoca un segundo envío inmediato.

Friendbot tiene un plazo acotado y Horizon vuelve a consultar la misma dirección antes de informar `active`. Una respuesta HTTP 2xx, copiar la URL o tener una dirección válida no prueban activación. Si se pierde la respuesta, el reintento primero comprueba si la cuenta ya existe. No se sustituyen ni regeneran las wallets.

`testnetActivation` distingue activación, solicitud emitida, error seguro y plazo de reintento. `fundsMoved` es `false` sin solicitud, `true` sólo con hash válido y existencia confirmada, y `null` cuando la recepción no está comprobada. La auditoría conserva esa incertidumbre; un registro completo puede coexistir con activación pendiente. El bootstrap tiene un presupuesto de 60 segundos, mientras las consultas conservan sus plazos existentes.

La activación ocurre durante la preparación autorizada de la cuenta. Las consultas MCP continúan siendo de lectura y `agent:read` no autoriza pagos. Mainnet y la trustline USDC requieren otra entrega.
