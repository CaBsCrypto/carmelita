# Tempo desde ChatGPT con la EVM existente

Flujo preparado: el usuario pide en Carmelita «Usa mi wallet EVM existente en Tempo Moderato y consulta PathUSD». `read_tempo_existing_evm_wallet` recibe input vacío y deriva el propietario del token autenticado con `agent:read`. Resuelve el EVM canónico de SQL, lo compara con las wallets Privy del mismo propietario y consulta el RPC público42431.

No requiere una asociación Tempo persistida ni una visita a la página de wallets. No crea wallets, modifica el registro, firma ni solicita fondos. Es una capacidad de lectura de la misma identidad EVM en Tempo; **no equivale a registrar una asociación nueva**. `tempoRegistrationChecked:false` y `registryChanged:false` mantienen esa distinción. Las herramientas antiguas continúan mostrando únicamente las asociaciones persistidas.

La App debe estar conectada con OAuth y la EVM canónica existente debe estar registrada en Carmelita. El consentimiento de conexión conserva sus requisitos actuales; esta entrega no modifica autenticación, scopes, permisos del proveedor ni onboarding. Si falta la EVM o SQL/Privy no coinciden, devuelve un error explícito, sin crear o recuperar otra wallet.

La respuesta pública contiene dirección, red42431, PathUSD/TIP-20, contrato verificado, decimales6, saldo atómico/formateado exacto, bloque/hash/hora y explorador. Un fallo RPC conserva error, token/bloque nulos; no se sustituye por cero ni una lectura anterior. No se aceptan dirección, owner, walletId, red o RPC enviados por el cliente. Las salidas omiten IDs internos, emails y detalles del proveedor.

El catálogo nuevo requiere actualizar discovery de ChatGPT después de publicar. Es un cambio de herramientas del mismo servidor/App; no exige un permiso de asociación ni una App nueva. No se promete que ChatGPT refresque una conversación antigua sin ese paso.

Validación focal: helper real con fronteras SQL/Privy/RPC inyectadas; autenticación antes de dependencias, propietarios A–B–A, canonical ausente, selección Privy real, red/contrato/saldo/bloque inválidos, datos privados añadidos y errores saneados. Fixture de ruta verifica el registro MCP real, schema estricto, authInfo, annotations readonly y ausencia de mutaciones. Estas pruebas no certifican un balance real ni aislamiento hospedado B.

La suite completa, build y CI se registrarán en la PR. La evidencia histórica de otras consultas se conserva sin recertificación; solo se actualiza el snapshot de ejecución actual. Sin QA reabierta, wallets nuevas, cambios OAuth, migración DB ni builds hospedados durante la preparación.

Si más adelante se exige guardar la asociación desde el chat, debe añadirse una acción mutante independiente con permiso explícito y confirmación; nunca introducir escritura automática dentro de estos lectores.
