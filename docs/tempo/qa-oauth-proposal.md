# Permisos QA separados — ejecución parcial

Propuesta autorizada por el PM. **Cliente público nuevo creado; App rechazada por ChatGPT; cero grants nuevos.** Preview existente: `5a5fec953911292abc93973723c1bb76469d79f3`, deployment `dpl_2fLJAdDjcxvtqkNccRwuFJ3GpEPL`. No otro build, merge ni publicación productiva.

Cliente `connected-app-test-502859eb-f3bb-4972-8423-4c08d7833a04`, registro HTTP201 a `05:48:42.397Z`, método none, sin secreto. Se comprobaron grants A/B ausentes. El formulario de App estaba completo con read/context y OIDC off, pero Crear mostró «No se permiten aplicaciones personalizadas en este contexto». Settings mostró Personal; no se identificó una causa más específica ni se cambiaron permisos globales.

La ventana autorizada sobre el mismo Preview comenzó `05:51:05.504Z`, máximo `06:11:05.504Z`; se cerró temprano `05:54:32.906Z` tras el rechazo. Origen Privy retirado y baseline12 comprobada `05:55:40.940Z`. El PM pidió **entregar el avance con la App nueva pendiente**. [Recibo del intento](evidence/dedicated-qa-attempt-20261013.json).

## Motivo y autorización necesaria

B ya tiene siete scopes en el cliente público reutilizado por la App actual. Stytch deduplica metadatos DCR públicos idénticos, y la revocación afecta todos los tokens de la pareja usuario/cliente. Cambiar o revocar ese grant podría afectar su acceso anterior. El manager soportado de la App actual no permite cambiar su client ID.

La sección 5 del encargo técnico requiere aprobación independiente para «cualquier creación o ampliación de acceso persistente». Esa aprobación se recibió para el cliente público, App privada mínima y ventana20min sin build; no autoriza ampliar permisos globales de ChatGPT. Todos los accesos temporales están cerrados. No se creó ninguna clave ni secreto nuevo.

## Alcance autorizado y pasos pendientes

- Registrar un cliente **público** Stytch con metadatos únicos: nombre `Carmelita Tempo QA isolated 20261013 5a5fec9`, URI del alias QA, callback `https://chatgpt.com/connector_platform_oauth_redirect` y `token_endpoint_auth_method=none`. No client secret; PKCE S256.
- Comprobar que el client ID difiere de los existentes y carece de grants A/B antes de conceder acceso. Si coincide, detener ese consentimiento; no revocar el cliente compartido.
- Crear la App privada **Carmelita Tempo QA aislada** con ese ID proporcionado y endpoint `https://carmelita-chat-first-qa.vercel.app/api/mcp/agent`. Authorization endpoint exclusivamente QA; issuer/token endpoint Stytch existentes, sin editar su configuración global.
- Solicitar solo `agent:read` y `agent:context`; sin OIDC, offline_access, plan ni conversation. Usuarios de prueba existentes A/B y wallets actuales.
- Tras verificar SHA/aislamiento y preparar el cierre, abrir una ventana nueva **máxima de 20 minutos**, únicamente sobre el alias QA y su origen Privy. Standard 4 CPU fijo, extras apagados; **cero builds nuevos**. Functions se contabilizan aparte.
- Verificar B MCP, estabilidad y negativos de aceptación que puedan ejecutarse con los permisos existentes. Revocar únicamente los grants de ese cliente nuevo y retirar origen Privy/excepción QA al terminar o antes del límite. Conservar los siete scopes previos de B y los otros grants observados.

El cliente público permanece registrado sin grants; la App privada continúa pendiente y no se creó. No se publica la App ni se habilitan firma, wallets, pagos o fondos.

## Límite que sigue pendiente

El client ID distinto permite retirar permisos de prueba por separado. **No prueba aislamiento de audiencia entre recursos o entornos.** La inspección actual de la rama no encontró el pin opcional de audiencia; no se capturó su valor runtime del Preview ni se ejecutó una prueba negativa entre recursos. Validarlo puede requerir una corrección o publicación posterior que esta propuesta no autoriza. No se marcará Fase A completa mientras falten sus criterios.

Fuentes: [DCR Stytch](https://stytch.com/docs/api-reference/consumer/api/connected-apps/application-management/dynamic-client-registration), [consentimiento/revocación](https://stytch.com/docs/connected-apps/resources/consent-management). Estado y datos ya ejecutados: [validación](validation.md), [evidencia](evidence/preview-qa-20261013.json).
