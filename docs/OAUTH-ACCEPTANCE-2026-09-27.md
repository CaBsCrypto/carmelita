# Aceptación independiente del complemento — 2026-09-27

Revisor: agente 4. Referencia de código: `fd1a8073002eb00e82e48e4c13149c59e20bfa9e`. Esta revisión no publica, no cambia proveedores ni acredita aceptación externa.

## Evidencia local

- Revisión de consentimiento, vinculación de sujeto y contexto MCP: OAuth persiste perfil/vínculo sin invocar onboarding ni consulta de saldo; la lectura usa asociaciones del propietario autenticado.
- `tests/oauth-wallet-onboarding.test.ts` y `tests/mcp-dual-wallet-context.test.ts`: **11 aprobadas, cero fallos**, ejecutadas el 27/09. El primer intento falló por `uv_os_get_passwd ENOMEM` del sandbox; el segundo terminó correctamente fuera de esa restricción.
- Campos actuales preservados. `walletRegistration.pendingActivation` diferencia registros pendientes de `walletsByNetwork`, que continúa siendo un mapa de registros activos. Ningún ID privado de proveedor se proyecta en las filas públicas de billeteras.
- El test de ausencia de onboarding en la ruta es una comprobación estática; no sustituye una comparación real antes/después del consentimiento. El ensayo SQL descrito en la revisión de datos aporta evidencia adicional, no aceptación ChatGPT.
- Graphify query intentado: launcher bloqueado por Python 3.12 ausente. No se modificó código ni se afirma actualizar el grafo.

## Preparación obligatoria

1. Identificar dos cuentas con billeteras **ya registradas en producción**, por sujeto autenticado y registros locales. Las cuentas QA no son prueba de existencia en producción. Denominarlas A/B en evidencia pública, sin correos ni tokens.
2. Guardar referencia privada de IDs, propietarios, direcciones, estados y asociaciones. Publicar sólo resultado de igualdad y conteos necesarios.
3. Verificar commit/despliegue y configuración efectivos; no atribuir pruebas de Preview a producción. Registrar fecha UTC por comprobación.
4. Usar el flujo de consentimiento para conectar ChatGPT. Evitar entrar en `/agent` sólo para comparar si eso dispara bootstrap y crea billeteras/asociaciones. La referencia puede obtenerse con el GET autenticado existente de billeteras o consulta administrativa restringida de lectura. No usar POST de activación.
5. Conservar el emisor/proyecto Stytch Test y cliente existentes. El callback documentado es `https://chatgpt.com/connector/oauth/lgVZqqPqiew-`; contrastarlo con la configuración actual de ChatGPT antes de cambiar nada. Si DCR entrega otro cliente, verificar su callback real y no borrar el anterior durante la transición.
6. Recurso MCP: `https://carmelita.browns.studio/api/mcp/agent`; consentimiento: `/oauth/authorize`; permiso probado: `agent:context`. Ningún permiso financiero.

## Matriz de aceptación externa

Todos los casos siguientes están **PENDIENTES** al escribir esta revisión. Completar fecha UTC, commit, despliegue y evidencia saneada por fila.

| Caso | Acción | Aprobado cuando |
|---|---|---|
| Dominio/recurso | Leer salud, metadatos OAuth y MCP sin sesión | HTTPS válido; recurso/emisor correctos; rechazo OAuth reconocible y no 403 de firewall |
| Cuenta A | Conectar desde ChatGPT y llamar `get_agent_context` | Direcciones/redes coinciden con lectura de Carmelita; cuenta correcta |
| Registro pendiente | Consultar cuenta con registro pendiente real, si existe | Dirección visible como registrada pendiente, no inexistente; si no existe ejemplo real, mantener sólo prueba local explícita |
| Reconexión A | Desconectar y conectar mediante consentimiento visible | Misma identidad y billeteras; referencia antes/después sin altas |
| Cuenta B | Cerrar Privy y sesión administrativa antes de conectar B | Sólo datos de B; ninguna dirección exclusiva de A |
| Cambio de sesión | Repetir consulta en ChatGPT tras la reconexión | No se reutiliza autorización de A para una conexión presentada como B |
| Scope insuficiente | Ejercitar credencial sin `agent:context` mediante flujo controlado | Rechazo identificable, sin contexto ni lista vacía de éxito |
| Sesión vencida | Ejercitar expiración controlada | Rechazo o nueva autorización; no datos servidos con token vencido |
| Revocación | Revocar aplicación de A y volver a consultar con su autorización previa | Token ya emitido deja de autorizar; reconexión exige consentimiento nuevo |
| Límites | Comparar referencia e inspeccionar acciones del recorrido | Sin nuevas billeteras, firmas, fondos, trustlines ni transacciones |

La revocación no se acredita sólo porque desaparezca la conexión de la pantalla: debe rechazarse la autorización previamente emitida. No exportar ni copiar tokens para probarlo. Si ChatGPT descarta el token al desconectar y no permite observar su rechazo, usar evidencia de validación de revocación controlada y dejar el escenario externo no observable identificado, sin declararlo probado.

## Riesgos y puertas de cierre

- La versión antigua de recuperación no escribe asociaciones; falta identificar un despliegue compatible, aunque el código haya pasado SQL local. Ver revisión de datos.
- La validación offline de JWT por sí sola no prueba revocación inmediata. El agente de identidad prepara el ajuste correspondiente; deberá probarse de nuevo sobre su commit final.
- Hallazgo de `Error.message` crudo corregido localmente en consentimiento y preflight: allowlist exacta compartida, error desconocido genérico y token Privy inválido identificado como 401. Doce pruebas focalizadas aprobadas y lint sin advertencias. Pendiente incorporar al commit final y CI; no acredita publicación. Graphify update intentado y bloqueado por el mismo launcher Python ausente.
- No guardar cuerpos OAuth, cabeceras Authorization, secretos Stytch, URLs PostgreSQL ni capturas con secretos visibles en documentos/evidencia.
- Un endpoint saludable no acredita consulta de wallets; CI aprobada no acredita revocación o aislamiento real.
- No reabrir tras migrar hasta tener candidato y recuperación comprobados. Mantener Bazaar deshabilitado y las URLs antiguas bloqueadas.

Cierre sólo con matriz externa completada y referencias conservadas; los casos no ejecutables deben quedar pendientes con causa y sin reinterpretarse como aprobados.
