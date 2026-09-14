# Ensayo de reparación de producción — 14 de septiembre de 2026

## Resultado real en copia restaurada

Destino: copia de restauración separada de producción y QA, snapshot de las 05:01:41 UTC. Ensayos observados aproximadamente a las 05:38 UTC mediante el editor SQL autenticado de Neon. Ninguna operación de este documento se aplicó a producción.

- **0019 aprobado con rollback:** historial anterior de 19 entradas validado frente a hashes LF/CRLF aceptados; columnas, tipos, nulabilidad, defaults, colaciones, restricciones, validación de claves, índices y opciones comprobados. Se renombraron las dos claves foráneas equivalentes y se añadió el hash canónico `68e5af514ac86dfed37eab8159f8fb271bd76878412d35b299d81f0b89a35558`. La transacción mostró 20 entradas y conservación del contenido de eventos; terminó en ROLLBACK.
- **Limpieza aprobada con rollback:** una sola fila de billetera retirada por ID, propietario, dirección, familia, red y estado exactos. Se verificaron conteos y huellas de filas completas en 41 tablas (40 públicas y el historial). Resultado durante la transacción: siete billeteras y todas las demás filas iguales, incluido el evento `wallet.created`. Terminó en ROLLBACK.
- **Estado posterior confirmado:** ocho billeteras, 19 migraciones, ambas claves con sus nombres originales y un evento de creación correspondiente al duplicado. La primera consulta del evento buscaba sólo el ID dentro de metadata y devolvió cero; la búsqueda completa por ID o dirección confirmó el evento. No se interpretó la primera consulta como eliminación del evento.
- Un primer ensayo de 0019 falló por el alias reservado `collation`; se ejecutó ROLLBACK, se corrigió a `collation_oid` y se repitió el ensayo completo con éxito.

## Artefactos y límites

Los generadores `scripts/reconcile-x402-events.ts` y `scripts/stellar-duplicate-cleanup.ts` no conectan ni ejecutan SQL. Por defecto producen transacciones terminadas en ROLLBACK. Los ensayos SQL reales complementan dos pruebas locales aprobadas y lint sin advertencias. Las huellas MD5 son controles de comparación de filas observadas, no garantías criptográficas adversariales. El uso de secuencias durante un ensayo puede dejar saltos en sus valores, aunque sus filas se reviertan.

Las direcciones completas se buscaron en Privy y cada búsqueda devolvió exactamente su wallet ID esperado. Ambos propietarios fueron contrastados en el panel. El antiguo problema de portapapeles no se consideró una discrepancia de identidad.

## Aplicación pendiente

No se ha iniciado mantenimiento, capturado respaldo final ni aplicado reparación real. Antes de hacerlo: verificar bloqueo de tráfico en todas las URLs que puedan escribir a producción, drenar operaciones en curso, confirmar ausencia de otros escritores, renovar saldo/actividad/referencias y capturar respaldo vigente recuperable. La corrección Stellar debe quedar validada en el candidato y no se debe reabrir con escritores antiguos capaces de recuperar el duplicado.

La lista específica de reglas del firewall de Vercel confirmó que no hay reglas personalizadas. El comando de resumen devolvió HTTP 402 al consultar IP Bypass, una función de plan superior; eso no acredita que las reglas personalizadas estén indisponibles. No se cambiaron reglas, plan, configuración ni tráfico. La [pausa de proyecto de Vercel](https://vercel.com/docs/projects/managing-projects#pausing-a-project) está documentada para producción, pero su cobertura por sí sola no demuestra el bloqueo de todas las URLs antiguas y otros escritores.

Graphify continúa bloqueado por su lanzador de Python 3.12; no se afirma que el grafo esté actualizado.
