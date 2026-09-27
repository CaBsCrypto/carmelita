# Revisión de datos y recuperación OAuth — 2026-09-27

Revisión local de sólo lectura. No se consultaron secretos ni se ejecutaron operaciones contra bases o proveedores.

## Evidencia reutilizable

- `work/production-inspect-20260927.json`: inspección PASS 06:35 UTC, ocho billeteras, ocho pagos, 20 entradas de historial y 20 sentencias pendientes correspondientes a 0020/0021. Commit de inspección `bef7eb89ec674152e39da9a077908af50f5192c3`; no representa una inspección nueva del commit actual.
- `work/rehearsal-0020-0021-20260927.json`: copia `br-shy-cherry-atiqayoz`, PASS 06:37 UTC. Historial 20→22, ocho asociaciones exactas, hashes de billeteras y campos históricos de pagos conservados; cero promociones históricas. Expiración documentada: 28/09, 03:36 GMT-3.
- `work/oauth-recovery-compatibility-20260927.json`: PASS 06:50 UTC del código actual con expansión deshabilitada. Vinculación OAuth sin wallet, consulta vacía con indicación de onboarding, persistencia/lectura/repetición de asociación y limpieza exacta de fixture. No acredita todavía un despliegue de recuperación publicado.
- No repetir estos ensayos sin cambios relevantes o vencimiento. La copia de ensayo no sustituye el respaldo final durante mantenimiento.

## Conexión efectiva: comprobación pendiente

`db/index.ts` selecciona en producción `DATABASE_URL`, después `DATABASE_URL_DATABASE_URL` y después `DATABASE_URL_UNPOOLED`. El ejecutor de migraciones invierte la preferencia para usar la conexión directa. Ambos deben apuntar al mismo host normalizado/base y usuario; el ejecutor también exige contraseñas iguales y TLS.

La huella aprobada es `f8d4e035286a7e8109251975ee5fd430eb5287f11d3fd0b4c212d36e8f8c3dc9`. Debe diferir de QA. El vínculo Marketplace con Neon, por sí solo, no acredita que el candidato utilice esas conexiones. `/api/health` sólo expone huella de aislamiento en Preview: la respuesta de producción actual tampoco resuelve esta comprobación.

Procedimiento recomendado al coordinador:

1. Inspeccionar metadatos efectivos del candidato y todas las claves alternativas; descartar overrides heredados o específicos del despliegue. No exportar valores completos a logs.
2. Si los valores sensibles no pueden inspeccionarse, fijar explícitamente las conexiones ya verificadas al candidato mediante un cuerpo privado en memoria, sin argumentos de proceso con contraseñas; registrar identificadores de configuración y despliegue.
3. Acreditar la selección real mediante una comprobación operativa restringida que utilice `getDatabaseUrl`, compare host/base/usuario y consulte `current_database()`/`current_user`; emitir únicamente resultados o huellas. Una sonda de build no sustituye por sí sola al runtime. No abrir un endpoint público con credenciales, URLs o contenido de tablas.
4. Hasta disponer de esa prueba, mantener el estado como pendiente y no aplicar migraciones.

## Recuperación compatible

La candidata histórica escribe `agent_wallets` sin asociaciones; no debe declararse compatible sólo porque pueda arrancar sobre el nuevo esquema. Usar como recuperación un artefacto identificado del código probado, con expansión y descubrimiento deshabilitados. Conservar ID de despliegue, commit y configuración; asegurar disponibilidad tras una promoción fallida.

La prueba SQL existente ya acredita la persistencia asociada y la lectura del código con expansión deshabilitada. Falta enlazar ese código/configuración con un despliegue recuperable. No marcar `rollbackCompatible: true` hasta resolverlo.

## Puerta de migración

- Respaldo final bajo mantenimiento y restauración verificada en recurso separado.
- Referencia final de identidades y pagos capturada después de detener escritores.
- Checkout limpio; commit del ejecutor igual al de la evidencia.
- Historial compatible; exactamente el tramo esperado; ningún conflicto de propietario o dirección.
- Mantenimiento verificado por plano de control y probes, incluidos ambos dominios y escritores antiguos.
- Evidencia con antigüedad máxima de una hora, identificador de respaldo real y despliegue de recuperación comprobado.
- Ante respuesta incierta, inspeccionar antes de cualquier reintento. No revertir DDL aditiva.

Graphify query se intentó durante esta revisión: el launcher falla por Python 3.12 ausente. No se modificó código ni se afirmó actualizar el grafo.
