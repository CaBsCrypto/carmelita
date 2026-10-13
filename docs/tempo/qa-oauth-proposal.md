# Decisión pendiente: permisos QA de Tempo separados

Propuesta preparada; **sin cliente nuevo, App nueva, grant B ni ventana nueva ejecutados**. Preview existente: `5a5fec953911292abc93973723c1bb76469d79f3`, deployment `dpl_2fLJAdDjcxvtqkNccRwuFJ3GpEPL`. No otro build, merge ni publicación productiva.

## Motivo y autorización necesaria

B ya tiene siete scopes en el cliente público reutilizado por la App actual. Stytch deduplica metadatos DCR públicos idénticos, y la revocación afecta todos los tokens de la pareja usuario/cliente. Cambiar o revocar ese grant podría afectar su acceso anterior. El manager soportado de la App actual no permite cambiar su client ID.

La sección 5 del encargo técnico requiere aprobación independiente para «cualquier creación o ampliación de acceso persistente». Lo propuesto agrega un cliente OAuth público y otra App privada; el permiso previo para reutilizar la App existente no cubre esa ampliación. Los accesos temporales anteriores están cerrados. No se requiere ninguna clave ni secreto nuevo.

## Resultado concreto propuesto

- Registrar un cliente **público** Stytch con metadatos únicos: nombre `Carmelita Tempo QA isolated 20261013 5a5fec9`, URI del alias QA, callback `https://chatgpt.com/connector_platform_oauth_redirect` y `token_endpoint_auth_method=none`. No client secret; PKCE S256.
- Comprobar que el client ID difiere de los existentes y carece de grants A/B antes de conceder acceso. Si coincide, detener ese consentimiento; no revocar el cliente compartido.
- Crear la App privada **Carmelita Tempo QA aislada** con ese ID proporcionado y endpoint `https://carmelita-chat-first-qa.vercel.app/api/mcp/agent`. Authorization endpoint exclusivamente QA; issuer/token endpoint Stytch existentes, sin editar su configuración global.
- Solicitar solo `agent:read` y `agent:context`; sin OIDC, offline_access, plan ni conversation. Usuarios de prueba existentes A/B y wallets actuales.
- Tras verificar SHA/aislamiento y preparar el cierre, abrir una ventana nueva **máxima de 20 minutos**, únicamente sobre el alias QA y su origen Privy. Standard 4 CPU fijo, extras apagados; **cero builds nuevos**. Functions se contabilizan aparte.
- Verificar B MCP, estabilidad y negativos de aceptación que puedan ejecutarse con los permisos existentes. Revocar únicamente los grants de ese cliente nuevo y retirar origen Privy/excepción QA al terminar o antes del límite. Conservar los siete scopes previos de B y los otros grants observados.

Los metadatos del cliente y la App privada permanecen como configuración sin grants al cerrar. No se publica la App ni se habilitan firma, wallets, pagos o fondos.

## Límite que sigue pendiente

El client ID distinto permite retirar permisos de prueba por separado. **No prueba aislamiento de audiencia entre recursos o entornos.** La inspección actual de la rama no encontró el pin opcional de audiencia; no se capturó su valor runtime del Preview ni se ejecutó una prueba negativa entre recursos. Validarlo puede requerir una corrección o publicación posterior que esta propuesta no autoriza. No se marcará Fase A completa mientras falten sus criterios.

Fuentes: [DCR Stytch](https://stytch.com/docs/api-reference/consumer/api/connected-apps/application-management/dynamic-client-registration), [consentimiento/revocación](https://stytch.com/docs/connected-apps/resources/consent-management). Estado y datos ya ejecutados: [validación](validation.md), [evidencia](evidence/preview-qa-20261013.json).
