# Candidata compatible para reabrir después de la reparación

## Motivo y composición

La versión de producción `dcbb20ef520cb167b582f51263c0660793d94161` puede recuperar el ID Stellar pendiente desde Privy después de retirar su fila. Para no reabrir con ese comportamiento, se preparó una candidata compatible con su esquema actual.

`node scripts/prepare-production-reopen.mjs` genera una carpeta nueva bajo `work/`, sin desplegar ni acceder a bases o secretos. Parte de esa versión de producción y toma del commit `82a49092ecfd8f22bd195040b9da52735f94532a` la selección canónica, las correcciones WebMCP necesarias para compilar, versiones/lockfile, separación de build y migración, y control de mantenimiento. Conserva el resto del código y esquema de producción. Los lectores canónicos se incorporan al módulo antiguo sin introducir consultas a `agent_wallet_networks`.

No es una publicación de la base multichain completa. No contiene 0020 ni incorpora compras, nuevos pagos o cambios en Bazaar. El acceso administrativo y las demás capacidades continúan como en la versión de producción de partida. La publicación general de la PR sigue siendo un paso posterior.

## Validación obtenida

- Instalación limpia con Node 24.14.0 y npm 11.6.1: 1488 paquetes; advertencias transitivas conocidas.
- Doce pruebas de identidad/aprovisionamiento: aprobadas, cero fallos. Incluyen recuperación canónica concurrente, orden de Privy, discrepancias y rechazo de ambigüedad.
- Build y TypeScript completos. Next informó que detectó el lockfile del proyecto padre durante la compilación local de la copia; no se modificó ni desactivó la verificación de tipos.
- El esquema tipado de la candidata coincide byte a byte con el blob de producción; 0020 está ausente y `vercel.json` ejecuta únicamente `npm run build`.
- El generador pasó comprobación de sintaxis y lint. Se ejecutó en otra carpeta y sus 17 archivos incorporados coinciden con los de la copia probada, normalizando únicamente finales de línea y espacio final.
- Logs locales privados: `work/production-compatible-install.log`, `work/production-compatible-tests.log`, `work/production-compatible-build.log`. Manifiesto reproducible: `work/production-compatible-generated-manifest.json`.

## Pendiente antes de usarla

No se ha desplegado ni promovido. Falta verificar la configuración efectiva del candidato en Vercel, identificar su versión mediante base/fix/manifiesto, probar mantenimiento y recuperación, y comprobar el flujo de lectura autenticada sobre la versión candidata. Esta comprobación local no acredita una reapertura real.

La reparación de datos sigue requiriendo bloqueo de todos los escritores, respaldo final vigente y controles posteriores. No se debe servir el candidato nuevo antes de resolver el duplicado: su selección canónica rechazará correctamente las dos identidades locales existentes. El bloqueo debe cubrir también URLs antiguas para que no sigan seleccionando otra identidad de Privy.

## Verificación posterior del despliegue — 14 de septiembre de 2026

La candidata ya está desplegada: `dpl_EfnB5FAmqDaiLozZFMvwSWJ83Dtr`, READY, en https://agente-asistente-j7ehxot93-cabscryptocontacto-6028s-projects.vercel.app. Sus metadatos confirman la base `dcbb20ef520cb167b582f51263c0660793d94161`, la corrección `82a49092ecfd8f22bd195040b9da52735f94532a` y el manifiesto SHA-256 `b98761315a50d64ed6b5e9b02df84525e4b17578b36e693edab6668fcde6eef7`, igual al archivo local. El comando efectivo de build es `npm run build`.

Consultas mediante la sesión autorizada de Vercel: `/agent` HTTP 503, `/api/agent/wallets` HTTP 503 y `/api/health` HTTP 200. Esto acredita el bloqueo de esas rutas en la candidata, no de todos los escritores ni la recuperación autenticada.

El dominio `carmelita-agent.vercel.app` sigue resolviendo al despliegue anterior `dpl_tYAhcpzd9uxqAYPU6869jLzt7dbG`. El inventario de aliases confirmó que `agente-asistente-cabscryptocontacto-6028s-projects.vercel.app` sí apunta ahora a la candidata. La lista de aliases incluida en la inspección del despliegue anterior aún enumera ese alias y no debe usarse como prueba del destino actual; el inventario de aliases da la asociación actual. No se puede afirmar que `--skip-domain` dejó todos los aliases intactos.

Inventario limitado al proyecto y con paginación agotada: 52 despliegues (21 READY de producción, uno ERROR de producción, 29 READY sin target production y uno ERROR sin ese target), y 45 aliases. Falta clasificar las conexiones de las previews antiguas y cubrir todos los escritores antes de la reparación real. Artefactos privados de inventario y metadatos bajo `work/`; no contienen credenciales.

La candidata continúa en mantenimiento. No se aplicó la limpieza ni la reconciliación a producción durante estas verificaciones. La regla exacta de firewall preparada anteriormente sigue siendo sólo un borrador deshabilitado según el último estado observado; debe revalidarse antes de cualquier publicación.

## Previews verificadas y pausa operativa

Las 21 previews con variables de conexión exclusivas respondieron a `/api/health` mediante la sesión autorizada de Vercel: estado ok, aislamiento verificado y huella QA `bfd2efdf0f2fec5299c643ab9ef012c2648d8baa2d83297ff3f924b6bd123299`. Resultados individuales privados: `work/preview-health-verification-0.json`, `-1.json` y `-2.json`. Es una comprobación de configuración en ejecución, no un nuevo recorrido autenticado de usuarios.

Se actualizó el borrador deshabilitado de firewall con una condición positiva de pertenencia a 71 hosts exactos inventariados. No se publicó. La candidata y los destinos de esas 21 previews quedaron fuera de la lista. El inventario incluye ocho previews restantes sin evidencia suficiente de aislamiento y destinos antiguos; el número de hosts incluye aliases.

La revisión automática rechazó la siguiente inspección por límite de uso del servicio de aprobación. No se ejecutó esa consulta ni se intentó una vía alternativa. Al retomar: inspeccionar borrador y diferencias actuales antes de cualquier publicación, confirmar cobertura de escritores no HTTP, preparar reapertura y respaldo final. La limpieza y reconciliación reales continúan pendientes.

## Reanudación y revisión exacta del borrador

El servicio de aprobación volvió a permitir consultas. La inspección actual confirmó `active=false`, una condición `host inc` sin negación, 71 hosts y cero diferencias frente al inventario local. No hay duración persistente de bloqueo. Las dos diferencias pendientes corresponden a añadir y modificar la misma regla; no se publicó ninguna.

Los 21 resultados de salud tienen además commit coincidente con los metadatos de su despliegue y entorno preview, sin excepciones. Continúan pendientes el bloqueo efectivo de escritores, respaldo final y aplicación real. No confundir la recuperación del acceso operativo con la finalización de la reparación.
