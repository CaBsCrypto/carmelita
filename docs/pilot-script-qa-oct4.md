# Método de QA de los scripts del piloto

Documento de migración sin referencias privadas ni resultados históricos de producción o QA.

Los scripts de referencia usan lecturas y comparan recibos separados para producción y QA. Su ejecución con credenciales o conexiones reales requiere el alcance autorizado correspondiente.

Una referencia BEFORE y otra AFTER deben pertenecer al mismo entorno y a la misma ventana de prueba. Los recibos nuevos deben crearse sin sobrescribir evidencia previa. Una comparación offline de conteos acredita únicamente sus diferencias dentro de esa ventana; no demuestra igualdad de todos los registros ni ausencia de actividad en cadenas externas.

Los regresores controlados deben interceptar proveedores, limitar métodos y destinos, y conservar casos de identidad, inactividad, ambigüedad, errores, caché y null frente a cero. Las pruebas con fixtures no deben cargar conexiones reales ni ejecutar operaciones financieras.

No marcar como completadas la aceptación humana, la prueba desde teléfono, los grants externos ni la revocación de una sesión real a partir de estas comprobaciones controladas.

Para continuar, fijar un SHA limpio, revisar el script elegido y registrar evidencia nueva y revisada para ese SHA.

## Configuración explícita de la alternativa saneada

Se conserva la interfaz posicional de cada script. Ningún script fue ejecutado al preparar esta migración. Las referencias privadas anteriores no se distribuyen.

Las seis utilidades resuelven la raíz desde la ubicación del archivo mediante `import.meta.url`; las restricciones a candidatos bajo `work/pilot-readiness` y al workspace del regresor controlado permanecen activas. La carpeta `work` y los archivos de conexiones o evidencia que usen las comprobaciones privadas deben prepararse por separado y con autorización.

`pilot-production-reference-readonly.mjs` exige entradas de entorno revisadas: `PILOT_VERCEL_CLI_PATH` (archivo absoluto de la CLI que usará el Node actual), `PILOT_VERCEL_SCOPE`, `PILOT_PUBLIC_ORIGIN`, `PILOT_AUTHORIZATION_SERVER`, `PILOT_EXPECTED_PROJECT_ID`, `PILOT_EXPECTED_COMMIT`, `PILOT_EXPECTED_DEPLOYMENT`, `PILOT_PRODUCTION_DATABASE_FINGERPRINT`, `PILOT_QA_DATABASE_FINGERPRINT`, `PILOT_REFERENCE_SHA256`, `PILOT_EXPECTED_WALLET_COUNT`, `PILOT_EXPECTED_GLOBAL_OWNER_COUNT`, `PILOT_EXPECTED_REFERENCE_LINK_COUNT` y `PILOT_EXPECTED_CURRENT_LINK_COUNT`. La comparación de alias se deriva del origen explícito. No hay valores históricos por defecto para esas entradas.

`pilot-production-reference-window.mjs` exige `PILOT_REFERENCE_SHA256`, `PILOT_EXPECTED_WALLET_COUNT`, `PILOT_EXPECTED_BINDING_COUNT` y `PILOT_EXPECTED_GLOBAL_OWNER_COUNT`. El método sigue comparando dos recibos; las cifras esperadas deben corresponder a la referencia autorizada para esa ventana.

`pilot-qa-registry-readonly.mjs` exige ambas huellas de base de datos anteriores y que sean distintas antes de abrir una conexión. Se retiró una sugerencia informativa de conteos históricos. Los conteos nuevos se calculan a partir de la lectura autorizada, sin acreditar evidencia anterior.

Los valores SHA-256 deben tener 64 caracteres hexadecimales en minúsculas; los conteos, enteros decimales no negativos dentro del rango seguro de JavaScript. Una entrada ausente o inválida bloquea la comprobación; nunca se convierte en un resultado aprobado. Estas modificaciones de portabilidad y configuración requieren revisión y validación de ejecución antes de usar los scripts.
