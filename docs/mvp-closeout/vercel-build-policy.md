# Control de builds durante el cierre ChatGPT

El incidente del 7 de octubre de 2026 agotó casi toda la cuota mensual reportada por el usuario. La revisión encontró 100 despliegues recientes, 78 de ellos Preview; son registros recientes, no totales auditados del ciclo ni minutos CPU facturados.

Configuración comprobada el 8 de octubre, antes de preparar el PR documental:

- Máquina Standard fija de 4 CPU; concurrencia adicional desactivada.
- Ignored Build Step: `[ "$VERCEL_GIT_COMMIT_REF" = "main" ] && exit 1 || exit 0`.
- `previewDeploymentsDisabled: true`, aplicado en esta jornada para evitar nuevos Previews al subir la rama documental. No se retiró el filtro anterior.
- Producción permanece disponible en `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`.

`main` conserva la construcción automática: ni preparar un PR, ni aprobar CI, ni cerrar PRs antiguos autoriza fusionarlo. No ejecutar deploy, redeploy, promoción que reconstruya, push o fusión a `main` hasta revisar Billing y acordar una publicación concreta posterior al incidente. Los checks locales y GitHub Actions no consumen Build CPU Minutes de Vercel.

La preparación no cambia plan, límites financieros ni pausa producción. Tampoco reactiva Previews o Elastic automáticamente. Para una QA hospedada, acordar coste y ventana antes de habilitarla. Prebuilt fuera de Vercel sigue siendo una alternativa pendiente de validar.

El respaldo privado conserva configuración saneada anterior/posterior e instrucciones. Restaurar la posibilidad de Preview requiere una publicación autorizada y volver a verificar el filtro; no restaurar automáticamente opciones Elastic, Enhanced o concurrencia. La política operativa también está en [AGENTS.md](../../AGENTS.md).

Referencias de configuración: [API de proyectos de Vercel](https://vercel.com/docs/rest-api/projects/update-an-existing-project) y [gestión de builds](https://vercel.com/docs/builds/managing-builds).
