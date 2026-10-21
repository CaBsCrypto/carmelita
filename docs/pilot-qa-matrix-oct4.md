# Matriz de QA para continuar la migración

Esta guía conserva el método de validación. Se omitieron rutas personales, referencias a recibos privados, cifras de registros reales y resultados operativos históricos. No certifica el estado de este snapshot.

| Área | Comprobación requerida |
| --- | --- |
| Identidad de la fuente | Fijar el commit y comprobar que el código permanezca limpio antes y después. |
| Proveedores | Cubrir identidad exacta, ambigüedad, inactividad, ausencia, errores transitorios, cancelación, caché y distinción entre null y cero. |
| Paridad de canales | Comprobar contratos compartidos, idiomas, autorización, scopes y aislamiento por propietario. |
| Wallets | Cubrir frases naturales, exploradores, estado de registro y ausencia de efectos financieros. |
| Regresión local | Ejecutar las pruebas pertinentes y registrar comando, resultado y SHA nuevos. |
| Entorno autenticado | Verificar por separado web, ChatGPT, revocación, teléfono y aceptación humana cuando estén autorizados. |

Las pruebas controladas no equivalen a aceptación humana ni a consultas autenticadas reales.

Los artefactos históricos de aceptación deben conservar su procedencia original. Una actualización de hashes del runtime no convierte evidencia histórica en aceptación del código actual.

Si se autorizan comparaciones de registros, producción y QA requieren referencias separadas. Capturar un BEFORE inmediatamente antes de la prueba y un AFTER al finalizar. Igualdad de conteos no acredita igualdad de cada valor ni ausencia de actividad externa.

Publicar únicamente evidencia revisada que excluya identidades, direcciones personales, credenciales, conexiones y datos operativos privados.
