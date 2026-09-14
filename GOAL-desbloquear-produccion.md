# Goal: cerrar la reparación Stellar y reabrir Carmelita

Fecha: 14 de septiembre de 2026. PR #28, rama `fix/webmcp-type-contract`, referencia de código `4fea3c3`.

## Objetivo inmediato

Resolver en producción el duplicado Stellar identificado y la diferencia del historial de la migración 0019. Preservar la billetera utilizada y todos los registros históricos, y reabrir con una versión que no vuelva a registrar el duplicado.

Este objetivo sigue abierto. La publicación general de las cinco redes y el descubrimiento de Bazaar vendrá después.

## Lo que ya está comprobado

- La revisión identificó un caso de duplicación Stellar en producción; no un duplicado en todas las cuentas.
- Ambas identidades se contrastaron con Privy. La activa de julio tiene actividad. La pendiente de agosto no mostró cuenta ni historial en la Testnet consultada y sólo tiene su registro y el evento `wallet.created` en Carmelita. La consulta actual de Testnet no demuestra ausencia de actividad anterior a reinicios de la red.
- Está autorizado retirar exclusivamente el registro pendiente y conservar el evento histórico, sujeto a renovar las comprobaciones. No se eliminarán claves de Privy.
- Se restauró un respaldo independiente y se ensayaron limpieza y reconciliación de 0019 con SQL real y ROLLBACK. El ensayo verificó 41 tablas y conservación de las demás filas.
- La selección canónica Stellar está corregida: reutiliza la identidad guardada y rechaza discrepancias o ambigüedad.
- La candidata compatible aprobó instalación, doce pruebas de identidad y build. El log de Vercel informa READY para `dpl_EfnB5FAmqDaiLozZFMvwSWJ83Dtr`. Esto no acredita todavía reapertura ni aceptación autenticada.

Evidencia: [ensayo SQL](docs/PRODUCTION-REPAIR-REHEARSAL-2026-09-14.md) y [composición de la candidata](docs/PRODUCTION-COMPATIBLE-REOPEN-2026-09-14.md). Estos documentos conservan cortes anteriores; el estado READY procede del log posterior.

## Secuencia de ejecución

### 1. Verificar candidata, tráfico y mantenimiento

- Confirmar versión y configuración efectiva de la candidata, y comprobar su bloqueo de escrituras.
- Identificar qué despliegue atiende el dominio público y todos los aliases capaces de escribir en producción. El log informa la asignación de un alias de proyecto: no asumir que `--skip-domain` dejó todos los aliases intactos.
- Identificar URLs antiguas y otros escritores. Cero conexiones en un instante no demuestra bloqueo de conexiones futuras.
- Preparar un bloqueo temporal acotado y una reversión comprobada. La regla exacta preparada es un borrador deshabilitado; todavía no acredita mantenimiento.

Aceptación: destinos identificados, bloqueo efectivo y reapertura compatible preparada.

### 2. Renovar verificaciones y respaldo

- Durante mantenimiento, detener y drenar todos los escritores.
- Repetir identidad, saldo, actividad y referencias. Detener la eliminación ante discrepancias o referencias nuevas no autorizadas.
- Capturar una referencia final y un respaldo vigente recuperable, separado de QA.

Aceptación: mantenimiento comprobado, respaldo recuperable y condiciones exactas de eliminación todavía válidas.

### 3. Aplicar la reparación ensayada

- Eliminar transaccionalmente sólo la fila pendiente, comprobando ID, propietario, dirección, familia, red y estado exactos.
- Conservar la billetera activa y el evento `wallet.created` intactos.
- Revalidar equivalencia de `agent_x402_events`, renombrar únicamente las dos claves foráneas equivalentes y registrar 0019 mediante la transacción ensayada.
- Ante respuesta incierta, consultar el estado antes de repetir. Ante diferencias, detener la aplicación y mantener mantenimiento.

Aceptación: una Stellar para la cuenta afectada, siete billeteras en lugar de ocho y veinte migraciones registradas en lugar de diecinueve, contrastados con la referencia final. Todas las demás filas deben conservarse, salvo los cambios de historial expresamente previstos.

### 4. Reabrir y cerrar la evidencia

- Impedir que los escritores antiguos vuelvan a registrar el duplicado.
- Reabrir con la candidata compatible y comprobar login y recuperación de la misma Stellar mediante el flujo visible de Privy.
- Confirmar salud, permisos y ausencia de duplicados tras el reingreso.
- Actualizar la misma PR #28 con versión, despliegue, fecha, resultados y pendientes. Separar ensayo, aplicación real y aceptación autenticada.

Aceptación: aplicación disponible, identidad preservada, reparación comprobada y evidencia revisable.

## Recuperación

Mantener mantenimiento si falla una comprobación. No reabrir con la versión antigua que puede recuperar el duplicado desde Privy. Usar únicamente una versión compatible demostrada, conservar el respaldo y evitar cambios destructivos inversos improvisados.

## Límites

Sin pagos, financiación, trustlines, destrucción de claves Privy, cambios en Bazaar ni copia de datos de QA. No aplicar 0020/0021 implícitamente ni publicar anticipadamente toda la PR.

## Goal posterior

Retomar la publicación controlada de la PR #28: revisar las migraciones restantes, activar las cinco redes de prueba y aceptar descubrimiento de Bazaar sin compras. WebMCP permanecerá experimental si falta aceptación nativa. Graphify sigue pendiente por el bloqueo de instalación; no se considera actualizado.

## Estado posterior: reparación aplicada

Las dos transacciones ya se aplicaron y Carmelita reabrió con la candidata corregida. Evidencia vigente: [reparación aplicada y reapertura](docs/PRODUCTION-REPAIR-APPLIED-2026-09-14.md). Quedan siete billeteras, veinte migraciones y cero duplicados; evento y pagos preservados. Falta la aceptación visible de reingreso de la cuenta afectada y la comprobación de recuperación posterior. Las secciones anteriores describen la secuencia y sus criterios, no trabajo íntegramente pendiente.
