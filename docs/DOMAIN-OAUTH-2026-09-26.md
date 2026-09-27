# Dominio y acceso MCP — 26 de septiembre de 2026

## Verificado

- `carmelita.browns.studio` agregado al proyecto Vercel `agente-asistente`.
- CNAME observado y aceptado: `6b20facb8d69c10e.vercel-dns-017.com`; configuración sin conflictos.
- HTTPS `/api/health` devuelve 200 con `status: ok` mediante curl con verificación normal de certificado. Algunas consultas Node presentaron ECONNRESET; no se deshabilitó TLS.
- `/.well-known/oauth-protected-resource` devuelve 404 `not_found`: OAuth aún no está aceptado en el nuevo origen.
- Producción conserva la candidata `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`, base `dcbb20ef520cb167b582f51263c0660793d94161`, reparación `82a49092ecfd8f22bd195040b9da52735f94532a`.
- El complemento consulta `https://carmelita-oauth-preview.vercel.app/api/mcp/agent` y devuelve 403. Su alias corresponde a `dpl_CUx5VCh8SRivBk9EvZLvnd6Vt9es` y figura en la regla publicada de bloqueo legacy. No se retiró ese bloqueo.

## Pendiente

Completar verificación de conexiones efectivas del candidato y publicación compatible según el runbook de 0020/0021 antes de trasladar OAuth. La captura privada, inspección y ensayo se completaron el 27/09, según la evidencia siguiente.

Después: configurar origen público, Privy y consentimiento Stytch; actualizar endpoint del complemento; reautorizar y probar lectura, segunda cuenta y revocación. No se declara acceso a wallets resuelto ni se han ejecutado pagos, creado wallets o modificado datos por esta tarea.

## Avance del 27 de septiembre

- Captura privada completada después de probar el receptor con valores ficticios; archivo ignorado por Git con sólo las dos conexiones, ACL restringida a MGC y receptor cerrado. No se publicaron contraseñas. Neon vuelve a enmascarar la contraseña al cambiar pooling: ambas variantes se verificaron por separado.
- Inspección de sólo lectura PASS sobre `bef7eb89ec674152e39da9a077908af50f5192c3`: 20 entradas de historial, ocho billeteras, ocho pagos, sin conflictos ni cambios de identidad. Evidencia privada `work/production-inspect-20260927.json`.
- La integración Vercel `store_mCfXUjKnQpMBh2RB` identifica el recurso Neon `cool-king-07562069`. No equivale por sí sola a demostrar que todas las variables del despliegue apunten al mismo recurso; mantener esa comprobación antes de publicación.
- Copia reciente de ensayo `br-shy-cherry-atiqayoz`, creada desde main, expira el 28/09 a las 03:36 GMT-3. No sustituye un respaldo final bajo mantenimiento.
- Ensayo 0020/0021 PASS exclusivamente en esa copia: historial 20→22, ocho asociaciones iniciales exactas, hashes de billeteras y campos históricos de pagos conservados, cero promociones de pagos históricos. Evidencia privada `work/rehearsal-0020-0021-20260927.json`.
- El verificador de firewall ahora reconoce exclusivamente el dominio personalizado aprobado, además de los hosts Vercel. Rechaza el dominio si aparece como escritor no cubierto por mantenimiento. Ocho pruebas focalizadas aprobadas; lint focalizado aprobado.
- Pendiente: compatibilidad de aplicación de recuperación, referencia final de conexiones efectivas del despliegue, inventario actualizado, respaldo final, mantenimiento, migración real, publicación y aceptación OAuth. Producción sigue sin aplicar 0020/0021; no declarar el complemento resuelto.

## Corrección OAuth y validación local — 27/09, 06:50 UTC

- El consentimiento deja de invocar `provisionUserWallets`. Persiste únicamente el perfil por DID y la vinculación issuer/subject mediante un batch transaccional; conserva perfiles existentes y no usa email como clave de autorización.
- `get_agent_context` conserva sus campos y añade `walletRegistration`: billeteras pendientes explícitas, redes sin registro e indicación de completar onboarding en Carmelita cuando no hay billeteras. Un fallo de lectura sigue siendo error, no una lista vacía.
- Lint sin advertencias, 612 pruebas: 610 aprobadas, cero fallos, dos omisiones externas; build completo aprobado. Las omisiones conservan sus motivos en la suite.
- Sobre la copia migrada `br-shy-cherry-atiqayoz`, la aplicación actual con expansión deshabilitada aprobó vinculación/reconexión sin billeteras, lectura de cuenta vacía y persistencia/lectura/repetición de asociaciones con un fixture SQL exclusivo. Limpieza por ID exacto; hashes de billeteras y pagos históricos sin cambios. Evidencia privada: `work/oauth-recovery-compatibility-20260927.json`.
- Esto acredita esa ruta de código sobre el esquema migrado; falta construir e identificar un despliegue de recuperación compatible. No acredita la candidata antigua, que no escribe asociaciones.
- Metadatos Vercel revisados: las dos conexiones son sensibles en Production/Preview; no existe `DATABASE_URL` en Production. No aparecen claves `STYTCH_*`, `CARMELITA_PUBLIC_ORIGIN` ni habilitación OAuth en Production. Debe configurarse el proveedor existente antes de publicar OAuth.
- Panel Stytch solicita login del operador. No se cambió emisor, callback ni configuración del complemento.
- Graphify query/update intentados: launcher bloqueado por Python 3.12 ausente. Grafo no actualizado.
- No se migró producción, no se promovió ni integró main. Aceptación real en ChatGPT, segunda cuenta y revocación siguen pendientes.
