# Reparación aplicada en producción — 14 de septiembre de 2026

## Resultado

Se aplicaron la limpieza exacta del duplicado Stellar y la reconciliación de 0019, mediante dos transacciones independientes con COMMIT. No se aplicaron 0020/0021.

- Limpieza: `exactly_one_wallet_removed_other_rows_unchanged`, modo apply, 41 tablas verificadas, siete billeteras. Las comparaciones de filas completas preservaron todas las demás filas, incluido el evento histórico `wallet.created`.
- Reconciliación: `schema_verified_and_reconciled`, modo apply, veinte entradas de historial. Se verificó el esquema de eventos, se renombraron únicamente las dos claves foráneas equivalentes y se registró el hash canónico de 0019. Los eventos permanecieron iguales.
- Consulta posterior independiente: cinco usuarios, siete billeteras, ocho pagos y veinte migraciones; cero filas del duplicado; una billetera activa con ID/propietario/dirección exactos; un evento de creación preservado; cero duplicados por propietario/red.
- Los ocho pagos conservaron la huella calculada antes de la reparación y en el respaldo: `0a69e512ce67757ed9d8519d21ece571` (MD5 de filas completas concatenadas sin separador, ordenadas por ID; no comparar con huellas históricas calculadas con otro separador).
- Inspección posterior de conflictos: cero propietarios EVM duplicados, cero direcciones EVM normalizadas duplicadas, cero propietarios/red duplicados, cero propietarios huérfanos y cero redes incompatibles. Una entrada exacta de 0019 y dos claves foráneas con los nombres canónicos.

## Protección y respaldo

La regla de mantenimiento se publicó después de inspeccionar el borrador: 71 hosts exactos, sin negación del host, excepción exclusivamente para `/api/health`, sin duración persistente. Producción `/agent` y `/api/agent/wallets` devolvieron 403; la URL inmutable antigua también devolvió 403. Salud pública y salud de QA devolvieron 200. Las 21 previews excluidas habían confirmado su huella QA y commit exacto.

Vercel mostró cero definiciones de cron. La inspección local no identificó un servidor de Carmelita: el servidor encontrado ejecutaba `scripts/website-report-pilot.mjs`, ausente de este repositorio; no se detuvo un proyecto ajeno. Antes de aplicar se observó una conexión interna `neon_auth`, idle, sin transacción y con cero permisos de escritura sobre las tablas public/drizzle. Las reparaciones usaron bloqueo asesor compartido y bloqueos de tablas; la limpieza bloqueó y comprobó las 41 tablas.

Respaldo final creado durante mantenimiento: rama `carmelita-pre-repair-20260914`, ID `br-proud-sun-attzb8b7`, hija de producción `br-patient-block-atq0m38n`, sin eliminación automática. Contiene datos y esquema, no es QA. Se consultó correctamente y se contrastaron conteos y huellas de billeteras y pagos con producción antes de aplicar. Las huellas coincidieron: billeteras `1e4b8847128c7c9d25d60edcbca2eba7`, pagos `0a69e512ce67757ed9d8519d21ece571`. Se conserva además el snapshot anterior cuya restauración independiente fue ensayada.

La consulta renovada de Stellar a las 06:16:34–35 UTC mostró la activa con 9998.9661362 XLM e historial, y la pendiente respondió 404 tanto en cuenta como en transacciones. No hubo fondos ni operaciones de red. Un contador auxiliar del primer resumen representó null como un elemento; no constituye evidencia de una transacción en respuestas 404.

## Pendiente de reapertura y cierre

La nueva candidata con el mismo código/manifiesto y mantenimiento desactivado está construyéndose. No reabrir con el despliegue antiguo que puede recuperar el duplicado. Verificar versión, salud y rutas antes de promover; conservar el bloqueo de URLs antiguas, retirar de la regla sólo los dominios trasladados a la versión corregida. Después comprobar recuperación autenticada de la identidad y actualizar PR/evidencia.

Las comprobaciones SQL anteriores acreditan las reparaciones; no acreditan por sí solas login posterior ni publicación general multichain. Graphify continúa bloqueado por el lanzador de Python 3.12.

## Reapertura verificada

Despliegue `dpl_DmZySQCRzpeQYgh15zAoyzLvY5GA`, URL inmutable `https://agente-asistente-6yzo3s49v-cabscryptocontacto-6028s-projects.vercel.app`, READY. Base `dcbb20ef520cb167b582f51263c0660793d94161`, corrección `82a49092ecfd8f22bd195040b9da52735f94532a`, manifiesto idéntico al ensayado; build efectivo `npm run build`. Mantenimiento desactivado sólo en esta candidata compatible.

Promoción completada. El inventario confirmó que `carmelita-agent.vercel.app`, `agente-asistente.vercel.app` y el alias general del proyecto apuntan a esta versión. El alias git-main permanece en la versión anterior y sigue bloqueado: no se afirmó que la promoción lo actualizara.

Se retiraron de la regla únicamente los dos dominios públicos que contenía y cuyo destino se verificó. Quedan 69 hosts antiguos bloqueados, sin cambios pendientes del firewall. Comprobación posterior: `/agent` y `/api/health` públicos HTTP 200, `/api/agent/wallets` sin sesión HTTP 401; URL inmutable antigua y alias git-main HTTP 403.

La PR #28 continúa abierta y main no fue integrado. La reapertura compatible no equivale a publicar el conjunto multichain. Falta el reingreso visible de la cuenta afectada para aceptación de recuperación en producción; la cuenta se identificó mediante la base sin incluir su correo en esta evidencia pública.

## Aceptación autenticada final — 14 de septiembre de 2026

El usuario completó Privy en producción. La aplicación mostró la cuenta afectada, bootstrap completo, la dirección Stellar de julio marcada como existente/activa y saldo 9998.9661362 XLM. La actividad de inicio figura a las 06:30:06 UTC. Los mensajes históricos de financiación visibles pertenecen al historial recuperado; no se ejecutó ningún faucet ni pago durante esta aceptación.

Consulta SQL posterior independiente: una Stellar para el propietario, coincidencia exacta del ID/propietario/dirección conservados, cero filas del ID retirado, un evento histórico de creación preservado, ocho pagos con la misma huella y veinte migraciones. Cero grupos duplicados por propietario/red.

El total de billeteras pasó de siete a ocho por el registro de una Solana Devnet durante el bootstrap, creada a las 06:30:06.672730 UTC; no es la reaparición del duplicado Stellar. La interfaz muestra esa Solana con saldo cero. Se conserva como billetera normal del usuario.

La recuperación autenticada pendiente queda aprobada. CI y Preview del corte anterior `cde38a0f655d14bd6b98e128530ec575b7f9152f` aprobaron; CI ejecución `34813409772`. Este cierre añade documentación, sin cambiar código ni exigir otra ejecución de pagos. El siguiente bloque sigue siendo la publicación general de la PR, no realizada como parte de esta reparación.
