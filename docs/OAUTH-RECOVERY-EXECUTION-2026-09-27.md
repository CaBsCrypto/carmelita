# Recuperar Carmelita en ChatGPT — ejecución coordinada

Objetivo activo: publicar la versión compatible y aceptar wallets de dos cuentas existentes, reconexión, aislamiento y revocación real. Coordinador/root es el único escritor de configuración compartida de producción.

| Frente | Responsable | Estado | Evidencia / siguiente condición |
|---|---|---|---|
| Identidad y OAuth | Agente 1 | Implementado, aceptación externa pendiente | Introspección por solicitud y pruebas; conservar emisor/cliente público |
| Datos y recuperación | Agente 2 | En curso | Ensayo SQL previo y sonda runtime aprobados; candidata funcional desplegada, aceptación de recuperación completa pendiente |
| Aplicación y publicación | Agente 3 | Inventario verificado | 69 hosts legacy preservados y alias general adicional bloqueado; autoAssignCustomDomains=false |
| Aceptación independiente | Agente 4 | Revisión local completada | Matriz externa pendiente; errores OAuth saneados; no usar bootstrap para inventariar |
| Configuración compartida | Scrum Master | En curso | Credencial Stytch validada y variables OAuth preparadas para futuros despliegues |

## Cambios externos ejecutados

- Clave Stytch existente validada mediante lectura autenticada a su propio proyecto; guardada como `STYTCH_SECRET` sensible en Vercel Production. Procesamiento temporal en memoria, sin persistencia local. Receptor cerrado.
- Preparadas en Production: proyecto y dominio Stytch existentes, scopes `agent:context`, origen `https://carmelita.browns.studio`, habilitación OAuth. No se promovió ningún despliegue.
- Endpoint de introspección del cliente público existente probado con token ficticio: HTTP 200, active=false. No acredita todavía revocación de un token real.
- Promoción automática desactivada por PATCH y releída: `autoAssignCustomDomains=false`.
- Preparados administradores autorizados y huellas Production/QA; expansión EVM y Bazaar permanecen false para el candidato de recuperación.
- Privy: dominio nuevo ausente de la lista permitida. Preparado en formulario sin guardar; confirmación de acceso solicitada al operador por política del navegador.

## Puertas pendientes

1. Controles del nuevo ajuste del verificador de firewall; cambios anteriores de agentes integrados y aprobados.
2. Completar evidencia de recuperación; promoción automática desactivada y conexión efectiva acreditada.
3. Respaldo final y mantenimiento de todos los escritores, aplicar exclusivamente 0020/0021 y verificar conservación.
4. Integrar PR28, publicación controlada, origen Privy, consentimiento Stytch y conexión ChatGPT.
5. Aceptación real de ambas cuentas y revocación; sin pagos ni creación de wallets para resolver el acceso.

Graphify sigue bloqueado por launcher Python ausente. No afirmar grafo actualizado. Las aprobaciones locales y de Preview de fd1a807 no sustituyen controles de los cambios posteriores.

## Validación conjunta del 27/09

Lint sin advertencias, 621 pruebas (619 aprobadas, cero fallos, dos omisiones externas con motivos preservados) y build completo aprobados. Las pruebas de salud se adaptaron a su nueva comprobación asíncrona. Log local ignorado: `work/oauth-qa-final-20260927.log`.

Tras configurar variables y desactivar promoción automática, ambos dominios siguen apuntando a `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`; ninguna migración de producción ni promoción ejecutada.

## Candidato de mantenimiento verificado — 27/09 08:47 UTC

- Despliegue READY `dpl_CdptVU6sVEXzSBLRjLdWUBrdAPJd`, commit `36b5ee470aefc60dc1111c82221710b6ec39a043`, build `npm run build`.
- `/api/health` consultado mediante CLI Vercel autenticada: environment production, maintenance true, productionDatabase.verified true y huella esperada `f8d4e035286a7e8109251975ee5fd430eb5287f11d3fd0b4c212d36e8f8c3dc9`. La sonda valida ambas conexiones y consulta identidad real del servidor; cierra el bloqueo de conexión efectiva del candidato.
- `/agent` y `/api/agent/bootstrap` responden 503, sin operaciones de alta.
- Los dos dominios públicos permanecen en DmZy. El alias general `agente-asistente-cabscryptocontacto-6028s-projects.vercel.app` sí se asignó al candidato pese a `--skip-domain`, como anticipaba el inventario; queda protegido por mantenimiento de aplicación.
- CI y Preview de 36b5ee4 aprobados. Vercel usó Node 24.21.0/npm 11.19.0: sólo permite fijar el major; validación local se ejecutó con Node 24.14.0/npm 11.6.1. No afirmar igualdad exacta de toolchain.
- Este candidato en mantenimiento no sustituye la aceptación de un despliegue de recuperación utilizable. Pendientes respaldo final, mantenimiento completo del inventario, migraciones y publicación funcional.

## Protección de candidatos — 27/09 08:50 UTC

Vercel no tenía protección de despliegues (`ssoProtection=null`). Se activó y releyó `prod_deployment_urls_and_all_previews`, manteniendo autoAssignCustomDomains=false y sin cambiar reglas legacy. Ambos dominios públicos respondieron 200; la URL generada del candidato devolvió 302 de protección. Acceso autenticado `vercel curl` conservó salud y verificación de base correctas.

La protección estándar permite preparar una versión de recuperación funcional sin abrir sus URLs generadas al público; no sustituye el mantenimiento por firewall ni su verificación antes de migrar. Fuente: https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication.

## Candidata funcional y protección — 27/09 08:57 UTC

- Publicado únicamente el cambio de firewall que añade el alias general: 70 hosts, con los 69 anteriores intactos. Borrador y estado publicado comparados, sin otras modificaciones. Alias general `/agent`: 403; salud de ambos dominios públicos: 200.
- Candidata funcional READY `dpl_J4y2LKcBNoUWNNzeAdfJ49ixXT3w`, código `36b5ee470aefc60dc1111c82221710b6ec39a043`, mantenimiento false, expansión EVM false. No promovida a dominios públicos.
- Salud autenticada de Vercel: production, postgres, commit esperado. MCP sin token de aplicación: 401 `invalid_or_missing_bearer_token`, con recurso de autenticación del dominio nuevo. Metadatos conservan el emisor Stytch y publican el recurso nuevo; `/oauth/authorize` responde 200. Esto no acredita aún consulta autenticada de wallets ni recuperación sobre producción migrada.
- La protección SSO antecede al firewall en URLs generadas: un 302 no acredita mantenimiento. Comprobación real del alias OAuth antiguo mediante CLI Vercel autorizada devuelve 403. El ejecutor se ajustó para exigir ese rechazo tras SSO sobre el mismo host y ruta, conservando la validación de regla publicada e inventario estable. Siete pruebas focalizadas aprobadas; controles conjuntos en curso.
- La revisión adicional del agente de publicación no pudo ejecutarse por límite de uso del proveedor; el coordinador realizó la comprobación concreta. Sus entregables anteriores siguen disponibles.
- No se aplicaron 0020/0021, no se integró main y no se cambió el consentimiento Stytch. Origen Privy pendiente de confirmación solicitada. Graphify continúa bloqueado por Python 3.12 ausente.

## Controles finales del ejecutor — 27/09

La ejecución anterior fue interrumpida y su proceso dejó de existir; no se contabilizó como aprobada. La ejecución posterior terminó con código 0: lint sin advertencias, 622 pruebas (620 aprobadas, cero fallos y dos omisiones externas explícitas) y build completo. Evidencia local ignorada: `work/oauth-qa-firewall-final-20260927.log` y archivo `.exit` correspondiente.

Inventario renovado después de construir la candidata: ambos dominios públicos siguen en `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`; sólo el alias general protegido apunta a `dpl_J4y2LKcBNoUWNNzeAdfJ49ixXT3w`.

## Privy y preparación de mantenimiento — 27/09 09:12–09:18 UTC

El operador autorizó expresamente el origen Privy. Se añadió únicamente `https://carmelita.browns.studio` en la aplicación existente y se comprobó su presencia tras recargar. No se crearon clientes, claves ni billeteras.

Neon conserva una única plaza de snapshot ocupada por el respaldo del 14/09. Se conservará; el respaldo final pendiente usará una rama separada con verificación de restauración. La copia de ensayo sigue siendo distinta del respaldo final.

El mantenimiento requiere siete hosts adicionales a los 70 ya bloqueados. Vercel rechazó la primera petición: el esquema oficial limita a 75 elementos cada condición de hosts. Se corrigió a dos grupos disjuntos (70+7), ambos con `path != /api/health`, preservando exactamente la lista y acción deny. El borrador fue aceptado y comparado con el estado anterior; aún NO publicado. El verificador admite ahora grupos exactos dentro de los límites y rechaza duplicados o excepciones diferentes. Ocho pruebas focalizadas aprobadas; validación conjunta en curso. Esquema consultado: https://openapi.vercel.sh, PATCH `/v1/security/firewall/config`.

Validación conjunta del ajuste de grupos completada con salida 0: lint sin advertencias, 623 pruebas (621 aprobadas, cero fallos, dos omisiones externas) y build aprobado. Evidencia local: work/oauth-qa-hostgroups-20260927.log. Graphify update volvió a fallar por el mismo launcher; grafo no actualizado.

## Mantenimiento publicado — 27/09 09:21 UTC

CI y Preview de 9c593c2 aprobados. Se publicó el borrador revisado: 77 hosts en dos grupos, sin otros cambios de firewall. Ambos dominios públicos devolvieron 403 en rutas de aplicación y salud 200. No se aplicaron migraciones.

La verificación completa detectó una URL retirada que devuelve 404 con `x-vercel-error: DEPLOYMENT_NOT_FOUND`. Se comprobó esa respuesta de Vercel; el ejecutor ahora la admite únicamente si el inventario no considera activo el despliegue. Un 404 común o cualquier 404 de un escritor activo sigue rechazándose. Nueve pruebas focalizadas aprobadas. La verificación completa y los controles locales se repiten antes del respaldo final. Producción permanece en mantenimiento mientras se resuelve esta puerta.

El ajuste de hosts retirados pasó lint, 624 pruebas (622 aprobadas, cero fallos, dos omisiones externas) y build. Graphify continúa bloqueado. Mantenimiento completo aprobado a las 09:30:58 UTC: 77 hosts bloqueados, ocho despliegues aislados, inventario y reglas estables.

Respaldo final creado bajo ese mantenimiento a las 09:31:11 UTC: `br-morning-cake-at74w8rj`, nombre `carmelita-pre-oauth-release-20260927`, sin expiración. Copia separada desde ese respaldo: `br-wandering-queen-at4xt2qi`, `carmelita-restore-check-20260927`, expira 28/09 06:31 GMT-3. Comparación de esquema y hashes de todas las tablas en curso; todavía no se afirma restauración verificada ni se han aplicado migraciones.

## Restauración verificada y corrección del guard — 27/09 09:48 UTC

A las 09:32:16 UTC se verificaron las 41 tablas, sus hashes y esquema entre producción, respaldo y copia restaurada; producción permaneció estable. Evidencia privada sin credenciales: `work/final-backup-verification-20260927.json`.

Los intentos protegidos de aplicación se detuvieron antes de las migraciones. Las inspecciones posteriores conservaron historial 20, únicamente 0020/0021 pendientes, ocho billeteras y ocho pagos con hashes idénticos. La verificación independiente del mantenimiento pasó a las 09:41:15 UTC con 77 hosts y nueve Previews aisladas.

El diagnóstico identificó un falso rechazo al comparar JSON serializado del firewall: dos lecturas consecutivas tenían estructuras idénticas y distinto orden de claves. Se sustituyó por igualdad estructural estricta, conservando todos los campos y el rechazo de cambios reales. La regresión prueba ambos casos. Graphify update sigue bloqueado por el launcher Python 3.12 ausente; no se declara actualizado el grafo. La validación local del ajuste está en curso. Producción permanece en mantenimiento y sin migraciones aplicadas en este corte.
