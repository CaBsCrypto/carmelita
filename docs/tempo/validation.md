# Validación de Tempo Moderato

**Estado vigente: aceptación parcial; Fase A completa pendiente.** A obtuvo descubrimiento y saldo real desde ChatGPT conectado al Preview correcto. B completó login, asociación repetida y lectura real en UI. No se ejecutó su MCP con grant QA independiente. Faltan negativos reales entre propietarios y entre recursos OAuth. Fase B no iniciada; no hubo firma, fondeo, pagos ni wallets nuevas.

Grabación: el PM autorizó después una ventana específica soloA, máximo06:19UTC. La UI obtuvo lectura nueva06:14:27.476Z, bloque39375318/0PathUSD; [RPC histórico independiente](recording/pinned-ui-recording-20261013.json) coincide. El conector devolvió solicitud de reautenticación/reintento, sin balance MCP nuevo. Excepción Vercel cerró automáticamente06:18:08.860Z; grant nuevoA y origen Privy se retiraron posteriormente al máximo, baseline12 verificada06:23:34.117Z (hora UI exacta desconocida). No cierre completo a tiempo ni B adicional probados. [Registro](recording/recording-window-20261013.json), [paquete grabable](recording/README-entrega.md).

## Entorno y revisión

| Campo | Evidencia |
| --- | --- |
| Repositorio / rama | CaBsCrypto/carmelita / `feat/tempo-testnet-mcp` |
| Base después de fetch | `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542` |
| SHA del Preview probado | `5a5fec953911292abc93973723c1bb76469d79f3` |
| Runtime integrado | `b268649a8e4dc72b7bd5993bdc68da7d1e6b6862`; después solo fixture React/documentación |
| Preview READY | `dpl_2fLJAdDjcxvtqkNccRwuFJ3GpEPL` |
| URL inmutable | https://agente-asistente-2rklylqyj-cabscryptocontacto-6028s-projects.vercel.app |
| Endpoint de la App privada | https://carmelita-chat-first-qa.vercel.app/api/mcp/agent |
| Base QA, huella verificada | `bfd2efdf0f2fec5299c643ab9ef012c2648d8baa2d83297ff3f924b6bd123299` |
| PR draft, sin merge | [#58](https://github.com/CaBsCrypto/carmelita/pull/58) |
| Regresión CI en 5a5fec9 | [Run 38344703439](https://github.com/CaBsCrypto/carmelita/actions/runs/38344703439), SUCCESS |
| Versiones instaladas | Node 24.14.0, npm local 11.9.0 / manifest 11.6.1, viem 2.52.0, Privy React 3.35.0 / Node 0.26.0 |

Cuatro especialistas participaron con propiedad de archivos y ramas separadas; root fue único integrador. QA revisó código distinto del que implementó, y Wallet/RPC contrastó las lecturas reales independientemente. Se preservaron cambios ajenos del checkout principal. Horas en UTC, fecha 13 de octubre de 2026. Evidencia pública y hashes sanitizados: [preview-qa-20261013.json](evidence/preview-qa-20261013.json).

## Lecturas autenticadas y comparación RPC

| Canal / propietario | Hora de consulta | Bloque | Dirección | Resultado y contraste |
| --- | --- | --- | --- | --- |
| ChatGPT web / A | `04:44:01Z`, precisión a segundos | `39366472` | `0x7A33b72BddF1d6D01c279b6cC9049c5E751f9d07` | 42431, PathUSD 6, bruto/decimal `0`; RPC histórico independiente coincidió a `05:26:51.617Z` |
| Conector MCP en esta conversación / A | `04:44:31.979Z` | `39366523` | Misma A | `available`, 42431, PathUSD 6, bruto/decimal `0`; RPC independiente coincidió a `04:45:28.679Z` |
| UI QA / B | `05:05:28.271Z` | `39368582` | `0xE4c4E0Bfa8B1F1Cdc94803987f4732d0A1B141D9` | 42431, PathUSD 6, bruto/decimal `0`; RPC independiente coincidió a `05:09:51.315Z` |
| Último regreso UI / A | `05:25:13.896Z` | `39370525` | Misma A, sin B | `0 PathUSD`; RPC independiente confirmó bloque/dirección/balance a `05:39:26.020Z` |

Contrato verificado: `0x20c0000000000000000000000000000000000000`, código `0xef`, name/symbol PathUSD, seis decimales. Los cuatro contrastes de RPC usaron bloques explícitos; Wallet/RPC guardó un [recibo independiente nuevo](evidence/pinned-rpc-20261013.json) a `05:39Z`. El último A tiene hash/timestamp/metadatos añadidos por RPC; la UI observada mostraba dirección, bloque, hora y saldo. No se presentan esos campos adicionales como otra observación UI. Saldo cero no acredita fondeo, actividad ni wallet desplegada.

Procedencia: root observó conversación web, UI/Privy y SQL final; no se exportó transcript/vídeo ni recibo SQL final separado. El JSON identifica los recibos locales ignorados por Git y las observaciones independientes. La evidencia RPC publicada acredita cadena/balance, no por sí sola OAuth ni propiedad.

La [conversación web de A](https://chatgpt.com/c/6acdb6c2-413c-83e9-a081-e596f320a021), App **Carmelita Tempo QA**, pidió descubrimiento/status/balances. La primera lectura (`04:43:21Z`) informó `tempo_rpc_unavailable`; no se determinó su causa exacta ni se convirtió en saldo cero. Un reintento de balances solamente produjo el resultado anterior. El conector de esta conversación ejecutó después `read_personal_wallets` a `04:44:27.235Z` y `read_personal_wallets_balances({networks:["tempo:moderato"]})`. Son dos observaciones diferentes del mismo propietario.

La ruta real del [explorador de A](https://explore.testnet.tempo.xyz/address/0x7A33b72BddF1d6D01c279b6cC9049c5E751f9d07) mostró la dirección y cero transacciones. No se verificó allí el balance TIP-20; ese balance proviene del servidor/RPC.

## Propiedad y asociación persistida

Privy autenticado y SQL de solo lectura verificaron, para A y B, una identidad canónica de Ethereum, Stellar y Solana, con IDs/direcciones coincidentes. Ambas EVM existían antes de la prueba. El POST explícito Tempo reutilizó cada wallet; se repitió mediante **Confirmar asociación existente**. El SQL final mantuvo exactamente una identidad EVM y un binding Tempo activo por propietario, con el mismo ID y dirección. La identidad canónica se publica solo como hash en la evidencia.

A cerró sesión, volvió a entrar y conservó dirección. La secuencia UI A–B–A mostró direcciones propias y volvió a A. La última lectura A ocurrió desde la sesión controlada ya abierta, después de restaurar protección pública; no se identifica el mecanismo de acceso como un bypass específico. **B no tiene prueba de relogin independiente ni lectura MCP bajo un grant QA nuevo.** Esta secuencia visual y el SQL no sustituyen los negativos de IDs/contexto manipulados.

El consentimiento del runtime corregido valida SQL/listas Privy del propietario sin persistir perfil, provisionar, consultar Horizon, activar Stellar ni solicitar Friendbot. Aislamiento inválido falla antes de dependencias y no recurre al provisionador. En este modo Providers desactiva creación automática Ethereum/Solana y migración. El login seguro se hizo en `/preview-acceptance`; no se usó el bootstrap heredado.

## OAuth: revocación observada y bloqueo de B

A obtuvo consentimiento QA con **agent:read + agent:context**, PKCE S256 y sin OIDC. Stytch mostró esos dos scopes efectivos. El issuer Stytch existente es compartido; no se cambió su configuración global.

El cliente público `connected-app-test-7a38394d-e24d-47fc-960f-a3dbcf224667` también tenía un grant previo de A con read/openid/email/offline_access. Su actor, fecha y recurso originales son desconocidos. Se retiró antes del consentimiento nuevo; **no puede atribuirse exclusivamente a esta App QA**, ni afirmarse que todos los tokens productivos quedaron intactos. Otros dos grants distintos observados de A se conservaron.

Después de revocar el grant QA nuevo de A, una única petición del conector devolvió cero datos de wallet. El log independiente del Preview registró `POST /api/mcp/agent` **401** a `04:46:37.048Z`, request ID `mprcs-1791866797048-c9a0700fbc9b`, dentro del intervalo de esa llamada. El conector no expuso ID de token ni request ID de su respuesta: el resultado es una **correlación de petición/log**, no captura directa de una repetición del mismo token. Su handler abrió reautenticación y devolvió “Authentication … was requested and accepted”; el grant reapareció y se retiró otra vez. El último control de A lo mostró ausente.

B ya tenía **siete scopes** en ese mismo cliente: plan/read/context/conversation/openid/email/offline_access. No se concedió ni revocó ese permiso. Stytch deduplica clientes DCR públicos con metadatos idénticos: crear otra App ChatGPT no garantiza otro client ID. La revocación afecta la pareja sujeto + connected_app_id, no una sola App ni un recurso. [Tipos de cliente](https://stytch.com/docs/connected-apps/oauth-learn-more/client-types), [DCR](https://stytch.com/docs/api-reference/consumer/api/connected-apps/application-management/dynamic-client-registration), [consentimiento](https://stytch.com/docs/connected-apps/resources/consent-management).

El PM autorizó por separado un cliente público QA con metadatos únicos y otra App privada. Se registró `connected-app-test-502859eb-f3bb-4972-8423-4c08d7833a04` a `05:48:42.397Z` (HTTP201), distinto del compartido, callback soportado, auth method none/PKCE, sin secret. Root comprobó ausencia de grants A/B antes del intento y después del cierre. El formulario **Carmelita Tempo QA aislada** tenía el ID nuevo, read/context y OIDC off; ChatGPT rechazó crearlo con «No se permiten aplicaciones personalizadas en este contexto. Comprueba tus permisos en el área de trabajo o los ajustes de seguridad». No se creó App ni se consintió. Settings mostró Personal; la App QA anterior tiene scope USER. La causa específica no se determinó; no se cambiaron permisos globales ni se usó otro cliente como alternativa. [Recibo](evidence/dedicated-qa-attempt-20261013.json).

El PM decidió **entregar el avance con la App nueva pendiente**. El cliente público queda como configuración sin grants; B conserva sus siete scopes previos. El manager de la App existente no permite editar su client ID. Una prueba futura necesita resolver el contexto de creación de ChatGPT y una ventana autorizada; el último acceso está cerrado.

Limitación separada: `STYTCH_CONNECTED_APPS_EXPECTED_AUDIENCE` es opcional en el código; la inspección actual de la rama (`05:14:11.253Z`) lo encontró sin configurar, y el inventario actual no contiene esa clave. Eso no demuestra el valor runtime del deployment ni que otro recurso sea aceptado. La prueba negativa entre recursos **no se ejecutó**. Un client ID distinto separa grants/revocación; por sí solo no demuestra aislamiento de audiencia.

## Ventanas, cierre y coste

Dos builds autorizados, ambos usados; ninguna nueva publicación durante la renovación:

| Preview | Tiempo API de máquina / CPU | Equivalente si facturable |
| --- | --- | --- |
| Primer f573, `dpl_2fUtySGNT6d3YU6HnKCghL7H8Fne` | 120000 / 480000 ms: 2 minutos / 8 CPU-min | US$0,028 |
| Corregido 5a5fec9, `dpl_2fLJAdDjcxvtqkNccRwuFJ3GpEPL` | 180000 / 720000 ms: 3 minutos / 12 CPU-min | US$0,042 |
| Total | 5 minutos / 20 CPU-min | **US$0,070 si facturable**, no factura |

Standard 4 CPU fijo y concurrencia adicional/Elastic apagados se conservaron. [Pricing oficial](https://vercel.com/docs/pricing#builds) limita la facturación Standard a on-demand/Elastic; Functions y otros servicios son aparte. Fuente sanitizada: [build-pricing.json](evidence/build-pricing.json).

- Primer f573: excepción abierta `03:16:52.884Z`, retirada `03:34:25.575Z`; origen Privy retirado `03:34:40.609Z`, dentro del límite.
- Corregido: ventana `04:40:35.400Z–05:00:35.400Z`; excepción cerrada antes del límite y baseline Privy verificada `04:59:26.772Z`.
- Renovación autorizada sin build: `05:02:09.809Z–05:22:09.809Z`; excepción retirada `05:22:38.316Z`, **28,507 segundos tarde**. El origen Privy se retiró después; hora UI exacta no registrada. Primera comprobación pública de los 12 orígenes originales: `05:23:39.836Z`.
- Intento de App separada autorizado, sin build: `05:51:05.504Z–06:11:05.504Z` máximo. Cierre anticipado de excepción `05:54:32.906Z` tras el rechazo de creación. Origen Privy retirado, hora UI exacta no registrada; 12 orígenes originales verificados `05:55:40.940Z`. El guard de cierre temprano fue preparado y detenido tras el cierre manual verificado; no ejecutó la retirada.

QA independiente confirmó a `05:25:06.571Z` baseline Privy de 12 y origen QA ausente; a `05:25:07.868Z`, health público 302 a protección; a `05:25:16.236Z`, excepción QA ausente, alias apuntando al Preview 5a y producción `dpl_GpjPYjyeXDwhrwZMiwRzRRVcAaeH` con sus cinco alias, protección general, máquina y filtro intactos. No se inició un tercer build, se fusionó main o se pausó producción.

La huella de las diez variables de rama QA no cambió. El inventario global pasó de 224 a 254 entradas; no existe snapshot completo inicial para atribuir las otras diferencias. No se modificaron variables en esta renovación. **No se afirma inmutabilidad de todo el inventario global/productivo** a partir de esos datos.

## Pruebas locales y CI

| Prueba | Resultado / naturaleza |
| --- | --- |
| `tests/tempo-rpc.test.ts` | 9 PASS: red, bloque único, metadata, código, precisión/cero, timeout/error, sanitización; fixtures RPC |
| `tests/tempo-wallet-onboarding.test.ts` | 9 PASS: owner, asociación repetida, no creación, SQL contract, auth/selectores; fixtures Privy/HTTP |
| `tests/tempo-mcp-owner-read.test.ts` | 7 PASS: scopes/schemas, owner A–B–A, filtro, TIP-20, proyección; fixtures MCP |
| `tests/tempo-feature-rollback.test.ts` | 3 PASS: default off, aislamiento, producción bloqueada, rollback sin borrar; local |
| OAuth existente: helper y ruta/Providers reales con fronteras simuladas | 36 PASS: identidades faltantes/conflictos, aislamiento primero, sin fallback/perfil/provision/fetch/Horizon ni grant al fallar |
| Suite final y CI de 5a5fec9 | **1114 tests: 1112 PASS, 0 FAIL, 2 probes opt-in SKIP** |
| Lint, TypeScript, Next build | PASS local y CI; build local fuera del sandbox tras SWC access denied, sin nuevo build Vercel |

Los tests sintéticos no acreditan lecturas ni revocaciones reales. Los probes omitidos corresponden a official MCP y Dexalot; no a una prueba fallida de Tempo. Snapshot `app/queries/acceptance-runtime.json` regenerado y revisado; manifests/evidencias históricos no se reescribieron. Sus 36 entradas siguen sujetas a revalidación cuando cambió el fingerprint.

Comandos de regresión ejecutados: `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`; focales: cuatro archivos Tempo y OAuth existente. Graphify AST actualizado después del fixture: 3941 nodos, 10275 relaciones, 169 comunidades, 22 SQL no parseados. No se añade migración Tempo. La nueva documentación no modifica runtime.

## Historial previo y límites

El primer corte local `6c07143e897f32619365ab027aed65d5acaa4135` pasó 1076/1078 tests, dos probes omitidos. El [probe RPC público](evidence/public-rpc.json) leyó una dirección de control, no al propietario: bloque 39343638 a `00:51:31.307Z`, PathUSD6, bruto 40000000000000 / decimal 40000000. No se usó ese probe como E2E.

La App antigua Carmelita QA apuntaba a otra URL y devolvió “Protected by Vercel Authentication”. Se conservó. El primer Preview f573 tuvo health/metadata verificados y login A, pero dos consentimientos fueron rechazados por revisión automática por posible Friendbot. Ese rechazo no prueba ausencia de un grant anterior: el descubierto más tarde consta arriba. La corrección eliminó preparación automática solo en el modo Tempo aislado, conservando el flujo legacy de otros modos.

## Pendientes de aceptación

1. Resolver el rechazo de creación de la App privada en ChatGPT; después MCP real de B con grant QA separado y mínimo, sin tocar sus siete scopes previos; completar su relogin estable.
2. Negativos reales bidireccionales de owner/IDs/address/context entre A y B. La secuencia UI y tests sintéticos no sustituyen esos ataques.
3. Validación real de audiencia/recurso entre entornos y efecto exacto de la configuración con Stytch.
4. Repetición de revocación con correlación directa de la petición/token si se exige cerrar ese criterio estricto.
5. Negativo RPC de red equivocada y rollback flag off/on hospedados: tests locales PASS; no simular otro RPC ni iniciar publicación sin autorización.
6. Vídeo de unos 90 segundos no grabado; [recorrido de demo con resultados reales](demo.md) preparado.

Fase A no se marca done con estos pendientes. Pagos siguen fuera de alcance.
