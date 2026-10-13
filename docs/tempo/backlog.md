# Tempo Moderato — backlog y contratos

Coordinador/integrador: Codex root. Base verificada tras `git fetch origin --prune`: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`, remoto `https://github.com/CaBsCrypto/carmelita.git`. Rama nueva de integración: `feat/tempo-testnet-mcp`. El árbol original contiene trabajo ajeno y permanece intacto. Checkouts separados; solo el coordinador crea commits e integra. Ningún push, merge a main o despliegue autorizado todavía.

Fecha inicial: 12 de octubre de 2026, Chile (13 de octubre UTC). Plazo comunicado: 13 de octubre 03:59 Chile / 06:59 UTC. Primer ciclo acotado a cerrar contratos y validar P0 localmente; sin estimar aceptación hospedada antes de disponer de un Preview autorizado.

## Contratos acordados

- Identidad siempre desde autenticación de servidor/MCP; entradas de lectura no aceptan owner, dirección, wallet ID ni RPC arbitrarios. `networks` solo filtra registros del propietario.
- Red `tempo:moderato`, CAIP-2 `eip155:42431`, RPC `https://rpc.moderato.tempo.xyz`; mainnet 4217 excluida.
- Asociación explícita reutiliza wallet EVM Privy validada y canónica; no firma, fondeo, claves adicionales ni creación de wallet como efecto de lectura. Red persistida como texto; esquema existente suficiente.
- Flag servidor `CARMELITA_TEMPO_TESTNET_ENABLED=true` exige `CARMELITA_PREVIEW_ISOLATED=true` y Preview o desarrollo local explícito. Producción siempre deshabilitada. `Providers.tempoTestnetEnabled` recibe decisión del servidor, sin flag público adicional.
- Catálogo distingue `balanceKind=tip20`, `feeModel=tip20`, `readOnly=true`. `nativeAsset=USD` es etiqueta heredada del catálogo, nunca prueba de moneda nativa ni balance de gas.
- `readTempoWallet(address, { signal?, fetch?, rpcUrl?, timeoutMs? })` devuelve unión de estado `available|disabled|misconfigured|wrong_network|unavailable`. Solo éxito incluye chain ID verificado, token verificado y balance atómico/formateado en strings, bloque real (número decimal string/hash/timestamp) y hora ISO. Fallos conservan token/bloque nulos con códigos sanitizados; jamás saldo cero inventado.
- MCP conserva nombres y scopes, añade lectura TIP-20 a balances/status y Tempo al contexto. Saldo nativo se marca no aplicable. Pagos deshabilitados.

## Tarjetas

Cada responsable mantiene un máximo de una tarea de implementación activa. Ready exige entradas, contrato, permisos, archivos exclusivos y prueba reproducible. Done exige revisión independiente, integración, validación y evidencia del entorno/commit; un mock no demuestra aceptación real.

| ID / prioridad | Objetivo y responsable | Entradas → salida | Dependencias | Archivos exclusivos | Aceptación / evidencia | Estado / bloqueo |
|---|---|---|---|---|---|---|
| T01 P0 | Fuentes, versiones y contratos — tempo_architecture | Docs oficiales + manifest/lock/exports → catálogo, tipos y Privy supportedChains | Base verificada | app/wallets/types.ts; app/wallets/networks.ts; app/providers.tsx | 42431/RPC/explorador contrastados, token con fuente, versiones exactas, flags fail closed | in_progress; token y ruta explorador pendientes de comprobación |
| T02 P0 | Wallet, asociación y RPC — tempo_wallet (tras T01) | Contratos + identidad Privy → asociación estable y lectura real | T01 integrado | app/wallets/tempo.ts; app/wallets/tempo-onboarding.ts; app/wallets/tempo-status.ts; app/api/agent/wallets/tempo/route.ts; app/wallets/privy.ts; app/api/agent/wallets/route.ts; app/wallets/evm-onboarding.ts; app/wallets/evm-status.ts; app/wallets/evm-rpc.ts; app/agent/wallet-readings.ts; app/agent-chat-balances.ts | Idempotencia, Privy owner válido, metadata/code/balance en bloque fijado, timeout/red equivocada/zero precisos | blocked; T01 |
| T03 P0 | MCP propietario — tempo_backend | Auth existente + DTO lectura → tools compatibles | T01 + firma T02 acordada | app/mcp/agent-context.ts; app/queries/personal.ts | Filtro dueño, schemas strict, provider IDs ocultos, native no aplicable, errores sanitizados | blocked; T01 |
| T04 P0 | QA independiente — tempo_qa | Contratos + incrementos → tests y registro honesto | T01; integración T02/T03 para ejecución | tests/tempo-rpc.test.ts; tests/tempo-wallet-onboarding.test.ts; tests/tempo-mcp-owner-read.test.ts; tests/tempo-feature-rollback.test.ts; docs/tempo/validation.md; docs/tempo/demo.md | Mocks separados de RPC real, owner A/B, token revocado, regresión y review | ready para diseño; ejecución depende de incrementos |
| T05 P0 | Integración/UI/documentación — root | Incrementos revisados → diff usable | T01/T02/T03 | app/layout.tsx; app/agent/registry-wallet-panel.tsx; app/agent/registry-wallet-model.ts; .env.example; docs/tempo/README.md; docs/tempo/backlog.md; scripts/tempo-rpc-evidence.ts | Dirección y token coherentes, register explícito, configuración reproducible y rollback sin borrar | in_progress; se confirma panel actual, wallet-center no está montado |
| T06 P0 | Preview + ChatGPT real — root y QA | SHA probado + Preview aislado + plugin actualizado → evidencia punta a punta | T02–T05 + autorización publicación/entorno | docs/tempo/validation.md (QA); docs/tempo/README.md (root) | Usuario real, misma dirección, chain ID/bloque/hora/balance contrastados y explorers; segunda identidad/revocación real | blocked; no Preview de este SHA ni publicación autorizada; revisar coste/builds y permisos concretos |
| T07 P1 | Pago — fuera de implementación | Fase A aceptada + aprobación propuesta → envío único/receipt | T06 done y autorización separada | Ninguno | Propuesta/fees/aprobación/idempotencia/receipt | blocked; P0 pendiente. No implementar |

## Evidencia inicial

RPC público de solo lectura consultado 2026-10-13T00:31:55Z: `eth_chainId=0xa5bf` (42431), bloque `0x2584e8d`, hash `0x5dcaacc72c0804a3cba16eff945ee60448c0837e1e26482d012137fb78e51def`, timestamp `0x6acd7bfa`. Sin firma, transacción ni prueba de propiedad. Las consultas necesitaron egress fuera del sandbox DNS; no se recibió ningún secreto.

Vercel producción existente consultada en modo lectura: proyecto `agente-asistente`, última producción `dpl_GpjPYjyeXDwhrwZMiwRzRRVcAaeH`; no acredita Preview Tempo. Revisión de coste vigente exige petición explícita para nueva publicación y ventana de QA acordada. No cambiar filtro, máquina, concurrencia ni límites.
