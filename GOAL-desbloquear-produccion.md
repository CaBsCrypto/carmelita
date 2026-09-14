# Goal: desbloquear la publicación de Carmelita

Resolver el duplicado Stellar y reconciliar 0019, preservando la billetera utilizada y todos los registros históricos. Base: PR #28, `82a4909`.

## Secuencia y aceptación

1. Actualizar identidad, saldo, actividad y referencias. Conservar la Stellar activa de julio y retirar exclusivamente la fila pendiente de agosto; mantener su evento `wallet.created`, según autorización explícita.
2. Ensayar la eliminación transaccional sobre la copia restaurada. Demostrar que desaparece exactamente esa fila y que todas las demás filas permanecen iguales.
3. Verificar columnas, restricciones, índices y opciones de `agent_x402_events` frente a 0019. Renombrar únicamente las dos claves foráneas equivalentes y registrar el hash canónico de 0019 dentro de la misma transacción. Abortar ante cualquier otra diferencia.
4. Antes de cambios reales, bloquear todos los escritores, comprobar mantenimiento y capturar un respaldo vigente recuperable y referencia final.
5. Aplicar lo ensayado, comprobar una Stellar por cuenta, conservación de identidades/historial y ausencia de ambos bloqueos en la inspección. Mantener mantenimiento si falla la comprobación.
6. Validar la corrección de selección Stellar en la versión candidata y actualizar PR, commit, fecha, resultados y pendientes.

## Evidencia y límites

El generador `scripts/reconcile-x402-events.ts` no conecta ni ejecuta; su modo predeterminado termina en ROLLBACK. Sus pruebas locales no acreditan aún un ensayo SQL ni una reconciliación real. Aplicar exige evidencia operativa de mantenimiento y respaldo, no sólo disponer del SQL generado.

No modificar migraciones históricas, recrear la tabla, borrar claves Privy, ejecutar pagos, financiación o trustlines, tocar Bazaar ni promover anticipadamente producción. Tras el cierre se retomarán las migraciones pendientes y la publicación controlada de cinco redes de prueba y descubrimiento de Bazaar.
