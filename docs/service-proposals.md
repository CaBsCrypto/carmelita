# Propuestas de servicios para Carmelita

La página `/developers#proposal` permite presentar un servicio para revisión manual. Recibir una propuesta no crea un proveedor, publica una oferta, concede permisos a una integración ni ejecuta un servicio.

## Recorrido

1. Indicar el nombre del servicio, el correo de contacto y una consulta que podría ofrecer. Se pueden incluir enlaces públicos de documentación como texto, sin claves ni credenciales.
2. Autorizar el uso de esos datos para revisar la propuesta y contactar al remitente sobre ella.
3. Enviar a `/api/integration-recommendations`. La interfaz confirma sólo `received` o `already_received` después de una respuesta válida; conserva el borrador ante error, indisponibilidad o vencimiento de los 20 segundos de espera.
4. Un administrador autenticado revisa `/admin/integrations`, también accesible desde las operaciones de fundador. Las propuestas de esta página llevan `source=developers`, con estado inicial `new` presentado como «Pending review».
5. Cuando están configurados y habilitados, los avisos por correo notifican al equipo y enlazan a la bandeja privada. El equipo decide manualmente si avanzar y definir un piloto de lectura; no se promete plazo de respuesta ni se aprueba automáticamente el servicio.

## Persistencia y límites

Se reutilizan `integration_recommendations` y su almacenamiento existente. Los avisos opcionales añaden la tabla aislada `carmelita_proposal_email_jobs`, sin modificar el esquema global de wallets. El registro necesita una conexión de base de datos configurada y el esquema existente; su preparación ya formaba parte del endpoint. La [configuración de correo](service-proposal-email.md) describe activación, reintentos y límites.

- Nombre: 2–100 caracteres. Correo válido, normalizado a minúsculas. Descripción de propuestas de desarrolladores: 10–500 caracteres después de recortar espacios.
- Consentimiento requerido, límite real de cuerpo de 8.000 bytes y protección de origen. El origen se valida antes de acceder al almacenamiento. El guard de esta ruta contempla la normalización de `127.0.0.1`/`[::1]` a `localhost` que realiza NextRequest; conserva protocolo, puerto y coincidencia con `Host`, sin aceptar overrides de cabeceras forwarded ni cambiar las rutas de autenticación.
- La combinación correo/servicio es única. Reintentar no crea otra fila y no reemplaza la descripción original.
- El campo antispam devuelve `ignored`, que no se presenta como propuesta guardada.
- La API pública no devuelve contactos ni un listado de propuestas. La bandeja conserva la autorización administrativa antes de consultar datos.
- Una base ausente responde 503 y una escritura fallida responde un error seguro. La bandeja distingue almacenamiento indisponible de una cola vacía.

## Pruebas locales

La revisión visual usa el build local sin base de datos en `127.0.0.1:8143`. Su formulario puede mostrar indisponibilidad, conservando lo escrito. Esto evita que una prueba del navegador escriba en una conexión productiva heredada.

`work/service-proposal-qa/` contiene una prueba aislada que monta el formulario y el POST reales, con módulos de almacenamiento y autenticación simulados. Acepta únicamente correos sintéticos `.test`/`.invalid`; persiste JSON local y etiqueta su bandeja como QA. No carga `.env`, ni llama a Neon, Privy o proveedores. Esta evidencia demuestra la lógica, no una aceptación hospedada de Neon o una sesión administrativa de producción.

Las pruebas de la API y de la bandeja están en `tests/integration-recommendation-route.test.ts` y `tests/integration-review-page.test.ts`. La publicación y la prueba hospedada se harán por separado, después de revisar Billing y autorizar una entrega concreta. Esta rama no se fusiona ni genera despliegues Vercel.

Verificación de esta candidata: `qa:local` aprobado (7 pruebas de tooling Graphify, lint, 1.053 pruebas de aplicación y 2 omitidas, TypeScript y build). Tras detectar el rechazo local de origen, las ocho pruebas enfocadas de propuestas/bandeja se repitieron con casos de NextRequest real; el build final se comprobó por separado. La revisión visual cubre 21 combinaciones de idioma y ancho, con texto visible ≥14 px y sin desbordamiento. El borde de los campos contrasta 3,74:1 contra su fondo. El navegador aislado comprobó guardado, duplicado, errores, respuesta inválida, espera de 20 segundos y recuperación sin otro registro; su evidencia permanece diferenciada de una aceptación de producción.

En el build final, una petición del formulario desde `127.0.0.1:8143` llegó al control de almacenamiento y mostró su indisponibilidad esperada, conservando los datos y el reintento. El foco desde la acción principal pasa a la sección de propuesta y al primer campo con Tab. Se comprobó reflujo a 720 × 450; el zoom nativo y los dispositivos físicos siguen pendientes. Graphify se actualizó por AST: 3.874 nodos y 10.024 aristas, con la dependencia de extracción SQL ausente ya documentada. La prueba aislada se detuvo tras guardar la evidencia; la vista local sin DB sigue disponible para revisión.

## Verificación del envío y la bandeja · 12 de octubre de 2026

Se volvió a comprobar el recorrido sobre el código de `dba432dadf2c409e928e1ff597401a0c87b0147b`, en `codex/landing-redesign`. El fixture independiente usa el puerto local 8151 para conservar la vista de la aplicación en 8144. La evidencia está en `work/service-proposal-validation-dba432d/`, excluida de Git, con capturas y `validation.json`.

- El formulario real envió una propuesta con un contacto sintético. El POST real devolvió `received` y guardó origen `developers`, idioma `en` y estado `new` en JSON local persistente.
- El componente real de `/admin/integrations`, renderizado con identidad administrativa simulada y estilos QA, mostró una propuesta con «Service proposal · EN · Pending review» y el correo de contacto normalizado.
- Reenviar el mismo servicio y correo con otra descripción devolvió `already_received`: se mantuvieron una sola fila y la descripción original.
- Tras detener y reiniciar el servidor, la bandeja recuperó el mismo registro sin un nuevo envío. Se verificaron el ID y el SHA256 del archivo, sin cambios.
- Las ocho pruebas existentes de esquema, POST y bandeja pasaron. Incluyen rechazo de acceso administrativo antes de consultar almacenamiento, duplicados y distinción entre cola vacía y almacenamiento indisponible.

Esta prueba confirma el recorrido con almacenamiento QA e identidad administrativa simulada. No confirma PostgreSQL/Neon, una sesión administrativa real ni aceptación de producción. El proceso no carga `.env`, bloquea llamadas externas y acepta únicamente contactos sintéticos. No se modificó código de la aplicación, no hubo push ni se generaron builds en Vercel.

### Correo de recepción

Las propuestas se reciben en la bandeja privada `/admin/integrations`. El campo de email corresponde al desarrollador; el enlace `mailto:` permite contactarlo manualmente. Los avisos opcionales usan un buzón destinatario fijo configurado en el servidor y se mantienen deshabilitados por defecto. Abrir la bandeja no envía mensajes. La configuración del proveedor y la prueba real de entrega siguen siendo necesarias; la validación anterior no incluía correo.
