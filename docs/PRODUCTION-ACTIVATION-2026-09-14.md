# Activación de producción — 14 de septiembre de 2026

Estado: preparación en curso; no se han aplicado migraciones ni promovido una versión. La aceptación histórica del pago permanece vinculada a `968d780`.

## Controles preparados

- La expansión EVM requiere activación explícita. En producción rechaza configuración de Preview; en Preview conserva su requisito de aislamiento. Sólo habilita Fuji, BNB Testnet y Base Sepolia.
- Bazaar requiere `STELLAR_BAZAAR_DISCOVERY_ENABLED=true` y `STELLAR_BAZAAR_BASE_URL=https://stellar-bazaar-x402.vercel.app`. Sin ambos, no aparece como capacidad del Gateway ni genera una acción de chat; la API no consulta el catálogo. Los proveedores mantienen el allowlist fijo de servidor.
- `CARMELITA_MAINTENANCE_ENABLED=true` bloquea páginas y APIs con HTTP 503. Sólo salud, página de mantenimiento y archivos estáticos aceptan lectura pública. El encabezado operativo `x-carmelita-maintenance-access` requiere un token aleatorio de al menos 32 caracteres; se elimina antes de llegar a las rutas y no sustituye la autenticación de la aplicación. No introducirlo en URLs ni en variables públicas.
- `npm run db:migrate:production` inspecciona por defecto. `apply` exige checkout limpio, recurso y commit exactos, evidencia reciente del respaldo restaurado y compatibilidad de rollback, y mantenimiento observado en el dominio público. El build sigue sin migraciones.

## Ejecutor de migraciones

Recibe las conexiones existentes mediante el entorno explícito, sin cargar archivos automáticamente. Requiere `VERCEL_ENV=production`, `CARMELITA_RELEASE_COMMIT`, `CARMELITA_PRODUCTION_DATABASE_FINGERPRINT` y `CARMELITA_QA_DATABASE_FINGERPRINT`. La huella SHA-256 se calcula sobre host normalizado sin `-pooler`, seguido de `/nombre_de_base`. La conexión de migración debe ser directa y corresponder a la de ejecución. Se rechazan opciones de conexión que puedan sustituir el destino y conexiones sin TLS.

Para aplicar requiere además `CARMELITA_RELEASE_EVIDENCE_FILE`, archivo local privado con `databaseFingerprint`, `commit`, `maintenanceCommit`, `backupId`, `restoreVerified=true`, `rollbackCompatible=true` y `verifiedAt` dentro de la última hora. Estos campos registran comprobaciones reales del operador; no prueban por sí mismos que exista un respaldo. No completarlos hasta verificarlo en Neon. No publicar ese archivo.

La inspección revisa el historial de migraciones y conflictos de billeteras. Un historial ausente o distinto detiene la operación; no se reconstruye automáticamente. Se conservan los IDs, propietarios y direcciones mediante huellas antes/después. Este control no reemplaza la revisión de todas las referencias financieras y la restauración del respaldo. Ante resultado incierto, usar inspección; no repetir `apply` automáticamente.

## Publicación pendiente

1. Obtener acceso autorizado a la conexión de producción y verificar inventario, respaldo/restauración y compatibilidad del código anterior con las restricciones de 0020.
2. Completar aceptación autenticada de Bazaar y WebMCP en Preview; conservarlos pendientes si no hay sesión o navegador compatible. Una búsqueda pública HTTP 200 no acredita una sesión ni fichas utilizables.
3. Desactivar la asignación automática del dominio antes del merge y verificar el candidato inmutable. Revisar también acceso por URLs de despliegues anteriores: bloquear sólo el alias no impide escrituras por esos destinos. No iniciar migraciones hasta demostrar que todos los escritores están detenidos.
4. Preparar una versión de mantenimiento compatible con el esquema anterior o una barrera de tráfico independiente del esquema. No publicar el código nuevo que exige 0020 antes de asegurar ese bloqueo. Esperar finalización de solicitudes en curso.
5. Durante el mantenimiento, guardar la referencia final y respaldo, migrar, contrastar identidades y referencias, integrar la PR existente y construir el commit de main sin promoverlo aún.
6. Configurar Privy y los administradores aprobados exclusivamente en producción. Activar EVM y sólo el descubrimiento aceptado. Verificar el candidato mediante acceso operativo restringido y autenticación normal; luego promover y retirar mantenimiento.
7. Si falla, mantener mantenimiento. No promover automáticamente el código anterior: antes demostrar compatibilidad de sus escritores con las nuevas restricciones. No deshacer las migraciones mediante DDL destructivo.

## Observaciones y bloqueos

- Validación local del candidato: lint sin advertencias, 597 pruebas (595 aprobadas, cero fallos y dos omisiones externas conocidas), build y TypeScript completos. Los cuatro controles nuevos de migración/mantenimiento usan fixtures locales; no acreditan migración real ni restauración del respaldo. Evidencia local privada: `work/production-activation-quality-20260914.log`.
- `graphify update .` falló porque el lanzador no pudo iniciar su Python 3.12. El grafo no se declara actualizado para estos cambios.

- Vercel confirma rama de producción `main` y asignación automática de dominios activada. No se cambió esa configuración.
- El dominio público conserva `dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG`, READY. El objetivo más reciente del proyecto no es evidencia suficiente del despliegue que recibe tráfico.
- La revisión automática rechazó el intento de descifrar la conexión sensible de producción por falta de autorización específica. No se ejecutó esa consulta ni se utilizó otra vía para recuperar el secreto. El diagnóstico de datos, respaldo y migración permanece pendiente.
- El navegador interno no tiene sesiones abiertas en esta reanudación. Las comprobaciones autenticadas del nuevo candidato siguen pendientes.
- El catálogo respondió HTTP 200 a las 04:43:56 UTC, sin resultados para `website`, `partialResults=false` y registro dinámico disponible. No acredita una oferta válida ni consumo.

Producción no ha sido alterada. No hubo firmas, pagos, financiación, trustlines ni modificaciones de Bazaar.
