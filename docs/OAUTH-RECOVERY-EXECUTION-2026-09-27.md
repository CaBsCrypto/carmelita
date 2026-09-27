# Recuperar Carmelita en ChatGPT — ejecución coordinada

Objetivo activo: publicar la versión compatible y aceptar wallets de dos cuentas existentes, reconexión, aislamiento y revocación real. Coordinador/root es el único escritor de configuración compartida de producción.

| Frente | Responsable | Estado | Evidencia / siguiente condición |
|---|---|---|---|
| Identidad y OAuth | Agente 1 | Implementado, aceptación externa pendiente | Introspección por solicitud y pruebas; conservar emisor/cliente público |
| Datos y recuperación | Agente 2 | En curso | Ensayo SQL previo aprobado; sonda runtime bajo mantenimiento y rollback desplegado pendientes |
| Aplicación y publicación | Agente 3 | Inventario verificado | 69 hosts legacy; seis hosts adicionales durante mantenimiento; autoAssignCustomDomains aún true |
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

1. Integrar cambios de agentes y ejecutar controles del código final.
2. Desactivar promoción automática, preparar candidato bajo mantenimiento y acreditar conexión efectiva y despliegue de recuperación.
3. Respaldo final y mantenimiento de todos los escritores, aplicar exclusivamente 0020/0021 y verificar conservación.
4. Integrar PR28, publicación controlada, origen Privy, consentimiento Stytch y conexión ChatGPT.
5. Aceptación real de ambas cuentas y revocación; sin pagos ni creación de wallets para resolver el acceso.

Graphify sigue bloqueado por launcher Python ausente. No afirmar grafo actualizado. Las aprobaciones locales y de Preview de fd1a807 no sustituyen controles de los cambios posteriores.

## Validación conjunta del 27/09

Lint sin advertencias, 621 pruebas (619 aprobadas, cero fallos, dos omisiones externas con motivos preservados) y build completo aprobados. Las pruebas de salud se adaptaron a su nueva comprobación asíncrona. Log local ignorado: `work/oauth-qa-final-20260927.log`.

Tras configurar variables y desactivar promoción automática, ambos dominios siguen apuntando a `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`; ninguna migración de producción ni promoción ejecutada.
