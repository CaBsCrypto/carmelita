# Preparación de rutas con Stellar para el bazar

Fecha de investigación: 2026-09-29 UTC. Base: main `1a412285affd0ff6c17b53ec32a702654674b8ba`.

## Entrega y contratos

Catálogo cerrado de ocho rutas direccionales. El endpoint existente `POST /api/agent/bridge/cctp` añade `{"action":"routes"}` después de validar la sesión Privy. No consulta saldos, crea billeteras, prepara XDR/calldata, firma, persiste ejecuciones ni envía transacciones. No cambia el Gateway de ChatGPT ni sus permisos. Las operaciones anteriores conservan su contrato y ruta Fuji → Stellar.

`buildBridgeResearchPlan` es una función interna sin efectos para evaluar direcciones y cantidades; no es una cotización ni autorización. Reutiliza el plan existente de Fuji cuando corresponde. Las comisiones, importe recibido y vencimiento son `null` hasta disponer de una cotización validada. No deben mostrarse como cero o como garantía. CCTP usa seis decimales en el mensaje; Stellar representa siete: conversión exacta por factor diez, rechazando polvo que exija redondear. Las identidades de activo son contrato/mint/emisor y código, nunca solamente símbolo.

| Ruta | Documentación de soporte | Implementación | Aceptación on-chain |
|---|---|---|---|
| Fuji → Stellar Testnet | Consultada | Parcial existente; plan reutilizado | Pendiente |
| Stellar Testnet → Fuji | Consultada | Descriptor y validación, ejecutor pendiente | Pendiente |
| Base Sepolia ↔ Stellar Testnet | Consultada | Descriptores y validación, ejecutores pendientes | Pendiente |
| Solana Devnet ↔ Stellar Testnet | Consultada | Descriptores y validación; programas y ejecutores pendientes | Pendiente |
| BNB Testnet ↔ Stellar Testnet | USDC no soportado por CCTP | Bloqueada | No ejecutada |

Todos los descriptores tienen `executionEnabled:false` y `acceptedOnchain:false`. Esto no deshabilita ni amplía el ejecutor experimental anterior; informa el estado de esta nueva preparación. La documentación no acredita disponibilidad RPC, liquidez ni un puente completado.

## Evidencia primaria y ficha BNB

- [Circle: soporte, activos y dominios](https://developers.circle.com/cctp/concepts/supported-chains-and-domains): BNB admite USYC en CCTP, no USDC. USYC sólo tiene soporte CCTP entre Ethereum y BNB; no constituye una ruta directa a Stellar ni se sustituye por USDC.
- [Circle: activos Testnet](https://developers.circle.com/stablecoins/usdc-contract-addresses): referencias exactas de USDC para Fuji, Base Sepolia, Solana Devnet y Stellar Testnet.
- [Circle: contratos EVM](https://developers.circle.com/cctp/references/contract-addresses), [programas Solana](https://developers.circle.com/cctp/references/solana-programs), [contratos Stellar](https://developers.circle.com/cctp/references/stellar-contracts): revisar despliegue y versión antes de construir un ejecutor. No reutilizar un contrato de Mainnet.
- [Stellar: USDT0](https://developers.stellar.org/launch/usdt0), [despliegues USDT0](https://docs.usdt0.to/technical-documentation/deployments): despliegue Stellar documentado en Mainnet, vía LayerZero/OFT. No se ha acreditado una ruta Testnet para nuestras redes. USDC, USDT, USDT0 y USYC no son identidades intercambiables.

| Campo de alternativa BNB | Evidencia actual / condición para desbloquear |
|---|---|
| Proveedor | Ninguno aprobado para BNB Testnet ↔ Stellar Testnet USDC |
| Activo origen/destino | No verificado; exigir contrato/mint/emisor y precisión exactos |
| Contratos y transporte | No verificados; exigir despliegues oficiales de ambos entornos y de cualquier salto intermedio |
| Comisiones | Desconocidas; exigir cotización desglosada de gas, puente y conversión |
| Liquidez | Desconocida; exigir capacidad y mínimo recibido de una cotización vigente |
| Destino | Cuenta Stellar del propietario validada o wallet BNB registrada, según dirección |
| Recuperación | No acreditada; exigir búsqueda por mensaje/nonce/hashes y recuperación sin segundo débito |
| Decisión | Mantener bloqueada; no añadir puentes o swaps por tanteo |

## Recuperación requerida antes de implementar nuevos ejecutores

Separar consulta de ruta, ejecución de puente y compra. El recibo de puente no concede autorización de pago. No ejecutar compras al terminar una transferencia.

Reutilizar las garantías del almacén CCTP existente, pero no asumir que sus columnas EVM/XDR sirven para Solana o sentido inverso. Antes de ampliar ejecución, revisar una migración aditiva específica si el modelo lo requiere. Esta PR no aplica ni añade migraciones.

Cada ejecución futura deberá guardar propietario, clave de idempotencia, ruta y versión, IDs originales, activos exactos, cantidad, condiciones y vencimiento aprobados. Guardar reclamación atómica de etapa antes de enviar; vincular un único payload/hash/nonce con comparación de estado. Una respuesta tardía no reemplaza evidencias anteriores. Firmas exclusivamente mediante Privy con aprobación concreta.

Después del débito: origen enviado → origen confirmado → atestación pendiente → destino preparado → destino enviado → destino confirmado. Timeout o respuesta incierta conserva hash/payload y pasa a conciliación; nunca vuelve a preparada ni genera otro débito. Conciliar consulta la cadena y las evidencias persistidas. Una atestación debe coincidir en dominios, emisor de mensaje, activo, importe, remitente, destinatario, nonce y tarifas; un hash recibido solo no prueba entrega. Verificar recibo exitoso y transferencia final exacta en destino.

El catálogo no crea tareas de ejecución. Mantener la ruta existente fijada mientras no pasen regresiones y SQL aislado para cada adaptador nuevo. No financiar ni crear trustlines para resolver requisitos ausentes.

## Validación y puertas de publicación

Pruebas locales nuevas: ocho rutas, separación de estado, rechazo Mainnet y destinos arbitrarios, identidad de activo, precisión ida/vuelta, direcciones por familia, BNB bloqueada y ausencia de cotizaciones ficticias. Suite CCTP anterior: atestaciones alteradas, reanudación por hash, restricciones de firma, cuarentena y persistencia antes de envío.

Pendiente para nuevos ejecutores: SQL real de doble clic/concurrencia, reinicio y respuesta tardía; consultas RPC para chain ID/genesis/network passphrase y contratos desplegados; activación, trustline y gas consultados; ensayo de ambas direcciones; aceptación on-chain autorizada por separado. Las pruebas anteriores basadas en lectura de código no sustituyen estas pruebas SQL ni una transferencia real.

No promover esta preparación como puente operativo. Orden de implementación y aceptación: Fuji ida/vuelta, Base ida/vuelta, Solana ida/vuelta; BNB sólo tras acreditar alternativa. USDT0 y adaptación del contrato de pago del bazar son una revisión posterior separada. Mantener USDC Testnet actual, sin alterar Bazaar.

## Evidencia de esta rama

- 2026-09-30 UTC: lint sin errores ni advertencias; suite final 666 pruebas, 664 correctas, cero fallos y dos omisiones externas; build completo aprobado. Build conserva advertencia local de Next.js por múltiples lockfiles en worktrees, sin modificar configuración compartida.

- 2026-09-30T01:56:44Z: lecturas RPC públicas reales en Fuji y Base Sepolia. `eth_chainId` coincide; `eth_getCode` observa bytecode no vacío para USDC, TokenMessengerV2 y MessageTransmitterV2 en cada red. No acredita versión/identidad del bytecode ni transferencia; `acceptedOnchain:false`. Verificador sólo permite destinos RPC del catálogo y métodos de lectura.
- Instalación limpia con Node 24.14.0 y npm 11.6.1, `npm ci --ignore-scripts --no-audit --no-fund`: aprobada. Se omitieron scripts de instalación; advertencias preexistentes de dependencias deprecadas y paquetes OpenZeppelin que declaran pnpm. npm global 11.9.0 no valida este lockfile; no se modificó el lockfile para resolverlo.
- Graphify query/update: bloqueados por el launcher que referencia Python312 eliminado. Se revisaron fuentes; no se afirma actualización del grafo.
- Omisiones externas preservadas: smoke MCP oficial y Dexalot Testnet, requieren configuración/activación explícita. No equivalen a aceptación de puentes.
- Sin lecturas de conexiones privadas, bases de producción, cambios Privy, firmas, financiación, trustlines, migraciones, compras ni transacciones. No se publica en producción esta PR durante la preparación.
