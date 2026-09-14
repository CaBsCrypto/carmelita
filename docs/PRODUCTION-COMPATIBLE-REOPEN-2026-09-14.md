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
