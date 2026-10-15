# Conexión, guía y desarrolladores

Para el alcance multichain y el formulario/avisos actuales, consultar la [preparación del 13 de octubre](releases/landing-proposals-2026-10-13.md). Este documento conserva la evidencia histórica de la revisión inicial de páginas públicas.

Rama: `codex/landing-redesign`. Esta revisión continúa desde `5b250102bac2297c3b99a4e5e8facfffbe6d6e87`, sin modificar `main` ni publicar en Vercel.

Las tres páginas comparten `public-page-shell.tsx` y `public-pages.module.css`: navegación activa, idiomas ES/EN/PT, salto al contenido, Inter local y la identidad verde de la portada. Las tarjetas tienen relieve CSS estático; estas páginas no añaden una escena GPU.

## Recorridos

- `/connect-chatgpt` muestra el acceso a complementos y la URL configurada al inicio. Tres pasos separan añadir el MCP, autorizar identidad y consultar Stellar. La cuenta se puede crear durante OAuth; preparación previa y ayuda son desplegables. El modal de `/agent` reutiliza los mismos pasos, copia y límites.
- `/guide` prioriza la conversación en ChatGPT y usa Stellar como ejemplo. El chat web queda como alternativa. Los comandos existentes abren únicamente `/agent?draft=…`: no envían consultas ni preparan transacciones al abrirlos.
- `/developers` permite preparar un piloto y consultar documentación. El diagrama servicio → Carmelita → ChatGPT está marcado como visión en desarrollo; no ofrece alta pública de proveedores ni ejecución universal. Los ejemplos y referencias técnicas se abren progresivamente.

El portal técnico obtiene el endpoint personal del contexto de entorno, igual que la conexión. El público se deriva del origen configurado, sin utilizar el host del navegador ni sustituir QA por producción. Una configuración ausente muestra un aviso. No se alteran OAuth, identidad, wallets, pagos ni scopes.

La ayuda de ChatGPT se contrastó con las [instrucciones oficiales de MCP](https://developers.openai.com/api/docs/guides/custom-mcp-server) y [conexión de complementos](https://developers.openai.com/plugins/deploy/connect-chatgpt). Se conserva instalación manual, OAuth y `@Carmelita`; se retira la ruta específica de ajustes de modo desarrollador que esas fuentes no sustentan. El acceso depende de cuenta y políticas. Revisar el acceso solicitado no se presenta como selección granular de permisos.

Se retiraron textos antiguos que afirmaban que otra cuenta de ChatGPT nunca se había probado. Esta revisión no convierte el piloto externo anterior en aceptación completa de móvil, revocación o proveedores. Copiar la URL y comprobar si existe alguna autorización OAuth tampoco certifican conexión con ChatGPT: debe comprobarse una respuesta con datos propios.

## Evidencia local

Evidencia y capturas en `work/public-pages-qa/`, excluidas de Git y asociadas al commit final mediante manifiesto:

- Desarrollo: 45 combinaciones, tres páginas × tres idiomas × cinco anchos (320, 390, 768, 1024 y 1440 px), sin desbordamiento; texto visible de al menos 14 px y un solo H1.
- Pruebas enfocadas de readiness, locales, ciclo de vida, paridad y aceptación: 46 aprobadas. No cambian las huellas de ejecución de consultas ni su evidencia histórica.
- Campo de URL correcto y confirmación visible de copia; no se anuncia una conexión completada. La revisión automática rechazó inspeccionar el portapapeles por riesgo de leer contenido privado ajeno a la prueba. No se reintentó por otro mecanismo; su contenido queda para verificación manual.
- Salto al contenido, foco visible, ayuda por teclado y modal: retención de foco, Escape y retorno al disparador. Los enlaces internos usan NextLink con rutas absolutas; el tutorial y piloto reciben foco mediante ref y admiten repetición.
- Historial tras tutorial → guía → Volver y piloto → conexión → Volver conserva URL y contenido coherentes. `#quickstart`, `#provider` y `#connect-product` abren sus detalles y muestran el destino, con limpieza de listeners y RAF.
- Los enlaces de borrador conservan los comandos codificados. Sin credenciales Privy en el servidor local, el chat informa que el acceso no está disponible; no se valida una nueva sesión autenticada ni se ejecutan consultas contra producción.

Los checks requeridos, contraste, reflujo y capturas del build final se registran en el manifiesto final. Zoom nativo al 200 %, dispositivo físico y contenido del portapapeles requieren revisión manual. Esta entrega sólo actualiza la presentación y orientación del recorrido.

Build final de producción local: 45 combinaciones aprobadas, 211 pares de contraste de texto con detalles abiertos (mínimo 4,98:1), reflujo equivalente al 200 % sin desbordamiento en las tres páginas, copia visible y navegación de regreso coherentes. `qa:local` aprobó Graphify tooling 7/7, lint, 1.048 pruebas de aplicación (2 omitidas), TypeScript y build. Graphify se actualizó mediante AST: 3.870 nodos y 10.020 aristas. El aviso local de múltiples lockfiles corresponde al worktree anidado; no se cambió la configuración de producción.

## Publicación

Verificar guardas de costes antes de subir la rama y conservar el PR como borrador. GitHub CI y build local no autorizan una fusión ni un build hospedado. Las Previews deben seguir desactivadas y el filtro debe omitir ramas distintas de `main`.
