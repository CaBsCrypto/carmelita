## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Vercel: control obligatorio de builds (2026-10-07)

- Incidente: 100 despliegues recientes, 78 Previews; consumo mensual de Build CPU Minutes reportado como casi agotado. No son totales auditados del ciclo.
- No ejecutar deploys, redeploys, promociones que reconstruyan, ni pushes/fusiones a main como efecto secundario de correcciones pequeñas. Hasta revisar Billing, no iniciar nuevos builds hospedados sin una petición explícita de publicación posterior a este incidente.
- Validar localmente y en GitHub; agrupar cambios para una publicación necesaria. Crear un PR no autoriza fusionarlo ni publicar.
- Mantener Vercel Standard 4 CPU fijo, concurrencia adicional desactivada y ramas distintas de main omitidas por Ignored Build Step. Main todavía construye automáticamente: verificar antes de cualquier push/fusión.
- Cierre 2026-10-08: `previewDeploymentsDisabled: true` verificado antes del PR documental. Conservarlo hasta acordar una publicación; no reactivarlo para obtener un Preview de cada cambio. Política pública: `docs/mvp-closeout/vercel-build-policy.md`.
- No reactivar Previews/Elastic ni retirar el filtro silenciosamente. Para QA hospedada, evaluar el coste y acordar una ventana concreta.
- No pausar producción ni cambiar plan/límites financieros como solución automática. Documentar coste, SHA y motivo de cada publicación.
- Construir fuera de Vercel y publicar prebuilt es una alternativa pendiente de validar, no un procedimiento ya implementado.
- Evidencia y rollback: work/mvp-closeout-20261005/vercel-build-cost-review-20261007.md.
