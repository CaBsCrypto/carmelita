# Guardar Tempo desde ChatGPT con la EVM existente

Flujo preparado para la App Carmelita: «Asocia mi wallet EVM existente a Tempo Moderato y muestra mi saldo PathUSD». ChatGPT llama `associate_tempo_testnet_wallet` con `{ "explicitUserConfirmation": true }` después de esa instrucción explícita. El propietario se deriva del token autenticado; no se aceptan dirección, owner, walletId, red ni RPC enviados por el cliente.

La herramienta requiere **ambos** permisos OAuth: `agent:read` y el nuevo `agent:wallet:associate`. Comprueba el EVM canónico de SQL contra Privy para el mismo propietario y exige una lectura real válida de Moderato 42431 antes de guardar su asociación. Reutiliza la dirección e identidad existentes. No crea wallets, firma, fondea, usa faucet ni mueve fondos. La asociación es un registro de Carmelita; no es una transacción en Tempo.

La respuesta pública contiene la asociación guardada, dirección, 42431, contrato PathUSD/TIP-20, decimales 6, saldo atómico y formateado exactos, bloque/hash/hora y explorador. Si el RPC falla o devuelve otra red, no se guarda y se devuelve un error; nunca se sustituye por cero ni por una lectura anterior. Si la persistencia falla, no se declara éxito. Un fallo de transporte al guardar puede dejar el resultado incierto: repetir la misma instrucción conserva la misma identidad y clave única de asociación, sin una segunda wallet. `associationPersisted:true` confirma el éxito de persistencia; `registryChanged:true` indica la operación, incluso en un reintento, y no afirma que se creó una fila nueva.

`read_tempo_existing_evm_wallet` complementa el flujo con `agent:read` e input vacío. Permite leer usando la EVM existente aunque Tempo todavía no esté asociado. No guarda nada y devuelve `tempoRegistrationChecked:false` / `registryChanged:false`. Los lectores anteriores continúan mostrando las asociaciones persistidas. Pedir guardar y recibir solamente una consulta no equivale a completar la asociación.

## Acceso y activación pendientes

La App debe estar conectada mediante OAuth y la EVM canónica existente debe estar registrada en Carmelita. El consentimiento de conexión conserva sus comprobaciones actuales de las tres wallets existentes; este cambio no agrega onboarding de usuarios con una sola EVM. La autorización inicial o incremental puede abrir la pantalla de consentimiento del proveedor. Después de conceder el nuevo permiso, la asociación se solicita desde el chat sin visitar la página de wallets. No se puede omitir el consentimiento legítimo.

El código añade el scope a la lista aceptada en JWT/metadata y un desafío `insufficient_scope` con `_meta["mcp/www_authenticate"]` y descripción. Los permisos predeterminados de conexión, PAT y fallback Privy **no** se amplían. Los tokens anteriores no ganan el permiso de asociación.

La inspección del panel Stytch del proyecto Consumer Test que usa Carmelita el 13 de octubre confirmó únicamente `agent:read`, `agent:plan`, `agent:context` y `agent:conversation` como scopes personalizados. **El scope nuevo todavía no está configurado allí.** Propuesta de configuración mínima:

```json
{
  "resource_id": "tempo_wallet_association",
  "actions": ["associate"],
  "scope": "agent:wallet:associate",
  "description": "Associate your existing EVM wallet with Tempo Moderato when explicitly requested; no wallet creation, signing or funds",
  "permissions": [{ "resource_id": "tempo_wallet_association", "actions": ["associate"] }]
}
```

Este ejemplo describe la política propuesta, no un payload API ya ejecutado. Stytch exige que el usuario tenga el permiso RBAC correspondiente para poder conceder el scope. Un rol específico permite un piloto con cuentas existentes; añadir ese permiso a `stytch_user` permite que todos los usuarios lo soliciten y requiere aprobar ese alcance. En ambos casos, el token de la App sólo lo obtiene mediante consentimiento explícito. No se modificaron roles, grants ni scopes en el proveedor durante la preparación. [Referencia Stytch](https://stytch.com/docs/connected-apps/oauth-learn-more/oauth-scopes).

El guard adicional `CARMELITA_TEMPO_CHAT_ASSOCIATION_ENABLED=true` debe configurarse sólo en el entorno autorizado. Está apagado por defecto y depende también del gate Tempo existente; en producción requiere `CARMELITA_TEMPO_TESTNET_ENABLED=true` y `CARMELITA_TEMPO_PRODUCTION_READ_ENABLED=true`. No se agregaron variables de entorno hospedadas. Rollback: apagar únicamente el flag de asociación; conserva wallets, registros y lecturas.

Después de publicar se debe refrescar discovery de la App para verificar que aparecen ambos tools y solicitar el scope adicional mediante el flujo OAuth soportado. No se promete actualización automática de una conversación antigua. [Autenticación de herramientas ChatGPT](https://developers.openai.com/plugins/build/auth).

## Validación y límites

Pruebas locales del helper con fronteras SQL/Privy/RPC inyectadas: scopes y confirmación antes de IO, identidad A–B–A, EVM ausente/ajena, red/token/saldo/bloque inválidos, errores RPC sin escritura, persistencia repetible, preservación del estado del usuario y salidas sin emails/IDs privados. El SQL de persistencia existente mantiene la identidad y unicidad de la asociación; el test de reintentos usa una frontera simulada y no prueba concurrencia real en SQL.

El fixture importa la ruta MCP real y simula autenticación y helpers externos. Comprueba esquemas estrictos, metadata, permisos, forwarding del propietario y cancelación, y rechazo de tokens revocados o input manipulado. No certifica un balance real, OAuth incremental hospedado ni aislamiento real B. Las consultas de producción anteriores son evidencia histórica de la versión publicada, no una ejecución de estos tools nuevos.

Comandos reproducibles desde el checkout:

```powershell
npm ci
npm run qa:local
```

La PR registra resultados de la suite, build y CI para el commit exacto. Sólo se actualiza el snapshot de ejecución; el manifiesto y la evidencia histórica de aceptación conservan sus bytes y no se recertifican. Sin QA reabierta, nuevos grants, migración DB ni builds hospedados durante la preparación.
