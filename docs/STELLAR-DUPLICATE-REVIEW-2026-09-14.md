# Revisión del duplicado Stellar — 14 de septiembre de 2026

## Estado

Corrección local de selección validada; eliminación pendiente de verificar dirección completa, mantenimiento y respaldo vigente. El usuario autorizó conservar el evento histórico `wallet.created` y retirar únicamente la fila duplicada. No se modificaron datos de producción, QA o la copia restaurada. No se destruyeron claves de Privy ni se ejecutaron transacciones Stellar.

## Hallazgos de sólo lectura

- La billetera activa de julio tiene una acción Stellar y cero pagos x402. Horizon Testnet confirma cuenta activada, historial y saldo nativo de 9998.9661362 XLM en la consulta realizada. Se debe preservar.
- La billetera pendiente de agosto tiene cero acciones Stellar y cero pagos. Horizon devuelve HTTP 404 para cuenta e historial de transacciones. Esto acredita ausencia en el estado actual consultado, no ausencia histórica absoluta después de reinicios de Testnet.
- El panel autenticado de Privy confirma ambos IDs y el mismo propietario; sus direcciones abreviadas coinciden con las de Carmelita. Falta el contraste independiente de las direcciones completas antes de una eliminación.
- La búsqueda del ID y dirección completos del duplicado en las 40 tablas públicas, incluyendo su representación JSON, encontró dos registros: la propia billetera y un evento `wallet.created` en `agent_activities`, creado el 14 de agosto. Las otras 38 tablas no devolvieron coincidencias.
- No se debe presentar al duplicado como carente de referencias. La excepción limitada de conservar ese evento intacto al retirar únicamente la billetera fue autorizada expresamente por el usuario durante esta revisión.

## Corrección de selección

Las entradas Stellar antigua y multichain comparten ahora el mismo aprovisionamiento. La identidad local se consulta por propietario y familia; múltiples filas producen conflicto. La selección valida esa identidad contra el listado completo de Privy, con igualdad exacta de dirección Stellar. Sin identidad local, sólo una candidata válida se puede reutilizar; varias candidatas se rechazan incluso si una tiene el identificador determinista. La creación mantiene la clave de idempotencia existente. Solana y la selección EVM conservan su comportamiento.

## Condiciones pendientes para la limpieza

1. Confirmar direcciones completas y revisar la evidencia actual de red. El control de copia del panel de Privy no devolvió contenido al portapapeles del navegador; no se interpretó como discrepancia de dirección ni como una comparación aprobada. Una respuesta incierta no autoriza borrar.
2. Renovar respaldo durante mantenimiento y comprobar todos los escritores detenidos. El respaldo anterior no constituye por sí solo una referencia vigente para eliminar.
3. Ensayar la operación transaccional sobre una copia separada, identificando exactamente ID, propietario, dirección, familia y estado. Verificar que sólo desaparece esa fila y que todas las demás filas, incluido `wallet.created`, permanecen iguales.
4. Aplicar la misma operación con precondiciones verificadas en producción y comprobar una Stellar por cuenta. No retirar eventos ni reasignar referencias para hacer pasar el control.
5. Completar por separado la revisión de `agent_x402_events` frente a 0019 antes de reanudar la publicación.

Graphify continúa bloqueado por el lanzador de Python 3.12; el grafo no se declara actualizado.

## Validación local

Lint sin advertencias; 600 pruebas: 598 aprobadas, cero fallos y dos omisiones externas. Build y TypeScript completos. Se probaron identidad guardada, orden variable de Privy, ambigüedad, cambio de propietario/dirección/familia, respuestas inválidas y recuperaciones concurrentes sin crear ni firmar. La prueba existente de creación idempotente Stellar también pasa. Esta evidencia no acredita todavía la limpieza SQL ni el despliegue de la corrección. Log local privado: `work/stellar-duplicate-quality.log`.
