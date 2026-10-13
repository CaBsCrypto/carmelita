# GitHub y respaldo recuperable del piloto

Corte: 8 de octubre de 2026. Código productivo `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`; documentación en [PR56](https://github.com/CaBsCrypto/carmelita/pull/56), `codex/chatgpt-milestone-closeout`. El resultado final de `local-quality` y el SHA de la documentación se registran allí, sin fusionarlo. El [recibo de CI](./evidence/documentation-ci-20261008.json) conserva la primera revisión aprobada.

## Respaldo remoto comprobado

[CaBsCrypto/carmelita-recovery](https://github.com/CaBsCrypto/carmelita-recovery) es privado, pertenece a CaBsCrypto y tiene Actions desactivado. No está conectado a Vercel: la inspección completa de 70 proyectos del equipo no encontró una asociación. Su commit de aceptación de recuperación es `810c2589d05be50a07ec6812c0e4ac6f8234a187`.

Se clonó desde GitHub en una carpeta nueva y se ejecutó el verificador revisado. El [recibo público saneado](./evidence/recovery-restoration-20261008.json) acredita:

- 73 archivos de contenido verificados; 75 archivos totales, incluidos manifiesto y sumas.
- Un bundle exclusivamente de `origin/main caa3cd3`, sin importar stash ni todas las referencias.
- Cinco bundles separados y revisados que conservan los 14 commits locales exclusivos anteriores a esta jornada.
- Restauración sobre `bded46951ebf9ae104636d69692247bd9e3c3b15` de exactamente 29 archivos del worker y cuatro de navegación OAuth, con los bytes originales.
- Políticas, configuración saneada, documentación y guías de recuperación; sin ejecutar aplicación, instalar paquetes, migrar bases o desplegar.

SHA256 independiente del manifiesto: `38e42d6b34fbe33da7bcf031a1861d84a069ebd0f8abe5bfec1acdbf4fc8631a`.
SHA256 de `SHA256SUMS`: `2f06163862e7c75bedd1987ef1f3d0ffe4529c147fb83e6e21ec2faf649043c6`.

La carpeta `documentation/` conserva un snapshot saneado anterior al resultado final del PR/CI y al recibo remoto: está identificado como tal. El historial final de la nueva rama documental queda además respaldado en el repositorio público mediante su PR. No se confunden esos documentos previos con aceptación posterior.

## Recuperación

Clonar el repositorio privado con autenticación propia, comprobar el hash independiente de `manifest.json` anterior y seguir su `RESTORE.md`. `verify_recovery.py` exige una salida separada y vacía, rechaza rutas inseguras y archivos inesperados, desactiva hooks, valida referencias y prerrequisitos, y reconstruye los snapshots. No se usan credenciales en URLs o archivos. El procedimiento fue comprobado desde el clon remoto, no sólo desde el paquete local.

Los snapshots son trabajo pendiente, no cambios aceptados para producción. Revisarlos contra el `main` actual antes de adaptarlos. No activar cron ni la migración del worker por haber recuperado archivos. Las configuraciones históricas de rollback no se aplican automáticamente; seguir la [política Vercel](./vercel-build-policy.md).

## Privacidad y alcance

No se subieron bases de datos, listados personales, reportes privados de wallets, capturas de sesión, archivos de entorno ni credenciales. La inspección por patrones revisó 2.198 blobs de las referencias seleccionadas y no encontró candidatos de credenciales; es una comprobación limitada, no prueba absoluta de ausencia de secretos. La historia publicada original conserva autoría Git, contactos ya públicos y fixtures sintéticos; no se reescribió para conservar sus bytes.

Este respaldo protege código y evidencia. Recuperación de Neon, usuarios/wallets Privy y secretos Stytch/proveedores requiere revisión propia. No afirmar recuperación de cuentas sólo porque el código se restaure.

## Controles aplicados

La [evidencia de protección](./evidence/main-protection-20261008.json) confirma PR obligatorio, `local-quality` de GitHub Actions (app `15368`), rama al día y aplicación a administradores. Cero aprobaciones de terceros requeridas mientras sólo exista un colaborador; force-push y borrado siguen bloqueados.

PR43–45 están cerrados como incorporados y PR36 como sustituido; [clasificación y seguimientos](./branch-dispositions.md). PR49 Claude permanece separado. La etiqueta anotada [chatgpt-wallets-pilot-2026-10-07](https://github.com/CaBsCrypto/carmelita/tree/chatgpt-wallets-pilot-2026-10-07) apunta a `caa3cd3` y expresa sus límites: no representa cierre de todos los casos humanos ni autoriza un build.

La aceptación móvil, cancelación/reintento, revocación/reconexión y aislamiento de dos identidades permanecen pendientes en la [matriz](./evidence-matrix.md). El PR documental sigue sin fusionar hasta revisar Billing y acordar una publicación.
