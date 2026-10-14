# Claude: piloto pendiente de aceptación

Alcance: Claude web y consultas desde móvil, con OAuth individual. No pagos ni ejecución de proveedores. El selector y la guía no certifican compatibilidad ni aceptación.

## Preparación técnica

El descubrimiento público observado anuncia registro dinámico y PKCE S256. La audiencia, recurso y sujeto siguen las validaciones Stytch existentes. Comprobar el callback solicitado por Claude contra el registro de cliente real y conservar state; la prueba sintética del callback no acredita registro o intercambio real de tokens.

Registro piloto: OAuth, Sign in now, Register automatically. No introducir client secrets o credenciales compartidas en la guía. Si el registro falla, revisar la configuración Stytch con el propietario; no desactivar validaciones ni sustituir OAuth por un token compartido.

QA: usar base aislada y endpoint configurado. La protección Vercel bloquea conexiones desde Anthropic; solicitar una ventana específica y restaurarla después. No abrir excepciones por defecto. Registrar issuer y recurso de cada entorno; no asumir aislamiento OAuth sólo por usar bases distintas.

## Checklist del tester

1. Desde la landing abrir Conectar tu asistente → Claude. Copiar la URL del entorno elegido.
2. En Claude web, Customize → Connectors → Add custom connector; añadir Carmelita y autorizar su propia identidad.
3. Habilitar Carmelita en + → Connectors del chat y consultar wallets y servicios Bazaar.
4. Repetir con otra identidad Carmelita/Claude y comprobar que sólo devuelve datos del propietario.
5. Cancelar, reintentar, comprobar expiración, desconectar/reconectar y revocar desde Carmelita. El acceso revocado debe fallar.
6. Consultar desde Claude móvil con la misma cuenta. Registrar cualquier ausencia de opción o restricción del espacio.
7. Teclado, 320px y zoom real200%; revisar español, inglés y portugués.

Guardar SHA, entorno, dispositivo, resultado y evidencia sin credenciales, correos, direcciones privadas ni tokens. Sólo marcar aceptado tras completar web y móvil; las consultas pueden devolver catálogo parcial o indisponible sin anunciar éxito.

## Publicación

Preview y PR primero. Main/producción sólo tras aceptación web/móvil. Actualizar la matriz para500LatAm como pendiente hasta entonces. Conservar enlace ChatGPT y su funcionamiento.

Fuente: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
