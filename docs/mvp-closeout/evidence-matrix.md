# Matriz de evidencia y aceptación

Corte documental: 5 de octubre de 2026. Base local al preparar este expediente: `8c5b11f73f15f5d5add3f5f23ddd01fabf2db6c0`. Este SHA identifica la candidata local, no la producción ni todas las corridas previas. El coordinador debe registrar la versión final comprobada y actualizar los pendientes antes de publicar.

**Estado general:** pruebas enfocadas locales aprobadas; consultas públicas de Bazaar hospedado comprobadas; aceptación final de despliegue, segundo usuario y celular pendiente. Compra nativa, propietario Bazaar vinculado y nuevo Guionista hospedado: bloqueados.

## Cómo leer la evidencia

Código y pruebas locales acreditan comportamientos con identidades y proveedores de prueba. Una lectura de Bazaar hospedado acredita el catálogo recibido en ese momento, sin ejecutar proveedores ni consultar propietarios. Una captura local acredita la UI y versión observadas, sin certificar uso desde un teléfono real. Ninguna de esas evidencias reemplaza el recorrido humano completo sobre el SHA desplegado.

## Casos de aceptación

| Caso | Código / prueba técnica | Observación hospedada o UI real | Pendiente humano, externo o final |
| --- | --- | --- | --- |
| Preservar ramas y trabajo local | Inventario, bundle Git y 33 archivos pendientes preservados | PR22/35 sustituidas; PR34/37 aplazadas; 23 referencias incorporadas limpiadas, worktrees conservados | PR36/43–45 esperan PR46 en main; las ramas aplazadas permanecen |
| Catálogo legacy público seguro | public-commerce-boundary y commerce-catalog-read: lectura; POST rechazado antes del backend; tools retiradas no llegan a almacenamiento | PR47 publicado en main65d5726: dominio canónico, POST405, dos tools de lectura, cinco retiradas rechazadas y GET público conservado | Reconfirmar en Preview final de PR46; no confundir el hotfix con aceptación de las nuevas funciones |
| Alta y cinco redes propias | Pruebas de onboarding, registro y consultas por propietario; lectura no crea ni activa billeteras | El usuario informó anteriormente las cinco redes en ChatGPT; sin atribución al SHA final | Repetir alta real desde cero con A/B; comparar pertenencia y estados |
| OAuth de la misma identidad | oauth-consent-navigation y pruebas de autenticación: callback acotado, cancelación y rechazo de respuestas tardías | Guía local y Copiar URL comprobados; no consta round trip OAuth de segunda cuenta | Consentimiento, regreso a ChatGPT, metadata actualizada, selección de conector y revocación en A/B |
| Permisos de lectura | agent:read no autoriza gasto ni conversación/contexto privado; tests de owner/scope/revocación | No se consultaron credenciales privadas de terceros | Verificar permisos realmente pedidos por el cliente y denegación cuando falta scope |
| Servicios Bazaar | bazaar-catalog: origen fijo, rutas permitidas, límites de cuerpo/plazo, redirects rechazados, parcial explícito | 0.5.0 read-only; dos fichas históricas, dynamicRegistry unavailable, parcial | Confirmar lectura actual desde despliegue final y ChatGPT, sin éxito falso ante caída |
| Suites Bazaar | Adapter marca provider_declaration, execution false y paymentConfirmed false | Dos suites declaradas: Identidad de marca y Lanzamiento de campaña | Mantener la distinción en respuestas del cliente; no hay runner aceptado |
| Skills Bazaar | Sólo metadatos no confiables; soporte ausente devuelve unavailable | Contrato conectado no anuncia soporte consumible de skills; sin fallback | Revalidar si el contrato cambia; publicación nunca instala o ejecuta automáticamente |
| Nuevo Guionista | No se incorpora como servicio aceptado | Guionista nuevo 0.01 no aceptado/hospedado; ficha histórica ai-video-scriptwriter 0.02 es distinta | Publicación, contrato y aceptación real de Guionista por Bazaar |
| Actividad propia | personal.activity: proyección acotada, propietario servidor, agent:read | Sin prueba humana final de producción; lista vacía es válida | Consultar A/B y confirmar aislamiento; no interpretar actividad como recibo Bazaar |
| Conversación existente | personal.conversation exige agent:conversation; summary acotado, owner-scoped; lectura no crea conversación | No equivale a todo el historial ChatGPT ni a historial privado Bazaar | Consentimiento opcional visible, rechazo sin permiso y recuperación propia en A/B |
| Token, respuesta o refresh pendientes | A7: plazos completos SDK/fetch/body/refresh; cancelación por propietario; respuestas tardías ignoradas | Comprobado con transportes locales controlados, no una sesión móvil real | Interrupción real en QA y cambio de cuenta bajo supervisión |
| Recuperar historial sin reenviar | session-recovery: GET tras pérdida de respuesta; borrador conservado; no reenvío automático | Pruebas locales; todavía sin aceptación humana sobre despliegue final | Verificar Reintentar carga / Recuperar historial, mensaje persistido y conservación en el componente |
| Landing y guía accesibles | Estructura, foco y CSS responsivo; lint/tipos locales | Root midió 320 px, teclado, navegación por CTA y Copiar URL; sin overflow | Reconfirmar sobre SHA final y dispositivos; zoom al 200 % aún pendiente |
| Catálogo accesible | Detalles nativos y layout móvil; sin enlaces a proveedores/checkout | Root comprobó 320 px, dos servicios, dos suites, skills unavailable y detalles con teclado | Móvil real, lectores asistivos y zoom medido; no certificación integral WCAG |
| ChatGPT celular | Guía explica conectar primero desde web con misma cuenta y recurso | El test anterior del usuario no demuestra todos los casos actuales | A/B en cliente móvil, wallets/catalog/historial, conector realmente seleccionado |
| Identidad privada Bazaar | Readiness bloqueado; email/wallet/magic link no son vínculo de comprador | API observada no acredita asociación OAuth Carmelita ↔ propietario Bazaar | Contrato hospedado versionado, issuer/audience/scopes/revocación y aceptación entre propietarios |
| Compra nativa y recibos | Fronteras cerradas de preparación, firma, ejecución y handoff financiero; no recibos fabricados | No hay compra real aceptada ni firma dentro de ChatGPT | Compatibilidad, cliente y Bazaar; exactitud, expiración, doble confirmación y recuperación sin segundo cobro |
| Financiación Testnet | Requisitos descritos en bazaar-contract; no se firmó ni financiaron cuentas | Sozu permite dirección existente; no se ejecutó el faucet | Usuario verifica misma dirección, activo exacto y trustline; no habilita compra por sí sola |
| Mainnet | Fuera del alcance de esta entrega | Ninguna aceptación Mainnet nueva | Entrega y autorización posteriores; Testnet no se convierte en Mainnet |
| GitHub, CI, Preview y producción | Integración central y SHA local conocido | Preview46 QA protegida separada; correspondencia final aún por completar | Suite completa/build/CI sobre SHA final, fingerprint de recurso/issuer y despliegue, rollback |

## Corridas y referencias

| Evidencia | Alcance y resultado | Límite |
| --- | --- | --- |
| QA independiente A8 integrado | 223/223 casos en 28 archivos, 0 fallidos/cancelados/omitidos | Árbol con cambios locales A7/root; no aceptar el HEAD previo como identificación completa |
| QA A7 enfocado | 51/51 casos reportados por A7 y coordinador | Se solapa con A8; no sumar ambos como 274 pruebas distintas |
| ESLint y TypeScript por frente | A2–A7 reportan checks locales aprobados | No sustituyen corrida completa del SHA final |
| Bazaar contract público | HTTP 200, MCP 0.5.0 read-only, writes vacío, paidCall/signing false | Lectura de metadatos; cero prueba de ejecución o comprador privado |
| Adapter vivo | Registro del 5 de octubre, SHA c20c988; dos servicios/dos suites/skills unavailable | Sólo endpoints fijos de catálogo; providerCalls, ownerHistoryCalls y paymentCalls = 0 |
| UI root | Landing desktop y tres capturas a 320 px; teclado, navegación y Copiar URL | localhost y cambios presentes; versión final por reconfirmar |
| Suite requerida completa + build + CI final | **Pendiente al corte** | Registrar comando, SHA, enlace de corrida y resultado real; no transferir éxito de otro commit |

La fuente técnica detallada y los comandos de A8 están en [QA independiente](./qa-independent.md). El contrato, los gates y el faucet están en [Contrato Bazaar](./bazaar-contract.md). La compatibilidad se trata en [Borrador de consulta OpenAI](./openai-compatibility-inquiry.md), sin envío automático.

La evidencia de trabajo local se conserva privadamente en `work/mvp-closeout-20261005/`: bazaar-public-contract.json, bazaar-adapter-live.json, a1-preservation-receipt.json, branch-worktree-inventory.json, git-bundle-receipt.json, landing-desktop.jpg, landing-320-keyboard.jpg, guide-320-copy.jpg y catalog-320-inputs.jpg. No es un paquete público de producción y no debe publicarse íntegramente.

Root informó ancho de contenido 305 / viewport 320 en guía y catálogo y ausencia de overflow en landing. Los atajos Ctrl + + / = intentados no modificaron la medición; DPR 1 y ancho 1280 no demuestran zoom al 200 %. Ese caso permanece pendiente.

## Ficha de la aceptación final

| Campo | Estado al corte |
| --- | --- |
| SHA final integrado / PR | Por completar por coordinador |
| Comandos y logs de lint, tipos, suite completa y build | Por completar sobre ese SHA |
| Corrida CI y resultado / SHA que ejecutó | Por completar |
| Preview QA / recurso MCP / issuer / protection | Por verificar en despliegue final |
| Producción canónica / SHA / recurso MCP / issuer | No se declara actualizada por esta matriz |
| A/B independientes / cliente móvil / permisos | Pendiente humano |
| UI final 320 px / teclado / zoom 200 % | Reconfirmación final / zoom pendiente |
| Compra, identidad Bazaar, Guionista y recibos | Bloqueados; no prueba real aceptada |
| Rollback de producción | dpl_H96PfS3exwBSJ5NT47kF2kdqZtCJ / main65d5726 conserva el hotfix; 7ed histórico restauraría la superficie legacy |

El registro de usuarios usa SHA, origen, conector, permisos, seudónimo A/B, redes y resultado saneado. No publica secretos, tokens, emails, IDs de propietario, direcciones personales, magic links o firmas. Véase [Guía para primeros usuarios](./first-users.md).

## Decisión a las 72 horas

El objetivo vence el **8 de octubre de 2026 a las 00:27, America/Santiago**. Si pasan los gates de lectura y publicación, se podrá presentar ese alcance comprobado con los pendientes explícitos. Si faltan pruebas humanas o correspondencia de versión, no se declarará aceptación final. La compra seguirá bloqueada hasta resolver sus propios requisitos, aunque termine el plazo o se cierren ramas.

El usuario realiza el envío a 500 LatAm. Los documentos preparan una presentación revisable; no acreditan envío, aprobación ni compromiso de la aceleradora.
