# Sprint piloto — coordinación
Base main confirmado: 7edcb1890a76a7dfcf9f3eb4da50615807a951be. Integración: codex/pilot-readiness (work/pilot-readiness).
Scrum Master: root. Hasta tres agentes activos simultáneos, seis responsables distintos. Datos privados y tokens excluidos de este registro.
## Roles y estado inicial
|Rol|Agente|Estado|Dependencia|Aceptación|
|---|---|---|---|---|
|1 Proveedores|pilot_providers|En ejecución|Rutas oficiales exactas|Diagnóstico/fixtures saneados|
|2 Mercado|Por iniciar|Pendiente|Diagnóstico1 y Graphify5|Resolución/caché/pruebas|
|3 Contratos/ChatGPT|Por iniciar|Pendiente|Graphify5|Semántica/compatibilidad/llamadas reales|
|4 Interfaz/onboarding|Por iniciar|Pendiente|Contratos2/3|ES/EN/PT, móvil y tester|
|5 Graphify/entrega|pilot_graph_release|En ejecución|Runtime local|Grafo actual por checkout; QA aislamiento|
|6 Scripts QA|pilot_script_qa|En ejecución|Base y contratos|Scripts independientes/referencia/matriz|
## Decisiones
- CoinGecko principal; CMC base https://pro-api.coinmarketcap.com/public-api mantiene info/map sin clave. Diagnóstico previo401sin/public-api descartado como causal.
- PAYmap200 con tres IDs inactivos. Info slugpay400Invalid value. No convertir cualquier400a ausencia.
- Status/nombres/entradas/scopes existentes conservados. reason:inactive e inactiveCandidates opcionales; candidaturas activas separadas; sin precio para inactivos.
- Estados billeteras activos son del registro, no onchain. Rawactive conservado; explicación y presentación humana.
- No migraciones/financiación/firmas/pagos/reservas/Bazaar/audio/preparación duradera. Rootcheckoutdirty excluido.
- Proveedores pendientes8/otroChatGPT/vencimientoOAuthreal separados.
## Puertas
1 Graphify funcional y grafo actual (consulta cap1500; updateASTsinAPI).
2 Correcciones con pruebas locales y lint/build.
3 QA aislada/origenPrivy antes de login.
4 Consultas nuevas web y ChatGPT; permisos/identidades/hash referencia18 intactos.
5 Teléfono y alta tester independiente verificadas humanamente; no se acreditan por scripts.
6 Publicar solo candidato integrado probado; conservar rollback dpl_AZhKWj3aKHSc9Wmv1DT2Z65XpnZA/7ed como previo.
## Evidencia previa
ROOT/work/carmelita-chatgpt-live-tests-20261002.json y .md (histórico); primera corrección actual reproduce parámetros reales del servidor.
Los recibos se guardarán con fecha/commit/deploy/canal. Cada agente reporta archivos exactos, comandos, resultados y bloqueos; Scrum Master integra y evita escritura simultánea en archivos compartidos.
