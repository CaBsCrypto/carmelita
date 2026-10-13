# Guion del producto — 90 segundos, evidencia registrada

Usar las pantallas reales ya abiertas, sin invocar tools ni reconfirmar. Rótulo/narración inicial obligatorio: **«Demo con lecturas reales registradas el 13 de octubre; no es una consulta nueva»**. Ocultar la línea de correo mediante encuadre de captura, sin cambiar autenticación o datos. No mostrar paneles de Privy/Stytch ni ventanas de código.

| Tiempo | Pantalla real | Narración |
| --- | --- | --- |
| 0–15s | `/preview-acceptance`, selector Tempo y tarjeta Tempo registrada; encuadrar desde la región Tempo, fuera del correo | «Esta es Carmelita con una wallet existente de Privy asociada a Tempo Moderato testnet, red42431. Muestro lecturas reales registradas durante la QA.» |
| 15–30s | Direcciones de la tarjeta EVM y Tempo, ambas `0x7A33…9d07` | «Tempo reutiliza la dirección EVM que ya tenía el usuario autenticado. La asociación se confirmó explícitamente y se repitió sin duplicar su identidad.» |
| 30–45s | Saldo0PathUSD, bloque39375318 y Consultado06:14:27.476Z de la tarjeta | «Este cero fue leído en cadena hoy a las03:14 de Chile; el bloque y la hora identifican la consulta registrada. No estoy ejecutándola de nuevo. Un error RPC se muestra como no disponible.» |
| 45–75s | Conversación real de ChatGPT, respuesta anterior de04:44:01UTC y wallet A | «Aquí ChatGPT consultó PathUSD: contrato0x20c0…0000, seis decimales, saldo bruto y formateado cero, bloque39366472 y su hash. El RPC público independiente confirmó el mismo bloque y saldo.» |
| 75–90s | Enlace al explorador de la misma dirección, o volver a tarjeta si el explorador no abre rápidamente | «La ruta del explorador corresponde a la misma wallet; no tiene transacciones visibles. Este avance cubre asociación y lectura testnet. Pagos Tempo quedan fuera; la prueba MCP independiente de B sigue pendiente.» |

No navegar a `/agent`, iniciar sesión de nuevo o pulsar Confirmar mientras QA esté cerrada. No presentar el JSON/CLI ni la visualización de resultados como UI del producto. La tarjeta no muestra contrato, saldo atómico, decimales ni hash: esos campos pertenecen a la respuesta registrada de ChatGPT.

Si se autoriza y ejecuta una nueva QA, reemplazar SOLO los datos de la toma nueva por lo realmente observado y volver a decir explícitamente cuál respuesta de ChatGPT es anterior. No cambiar la fecha/etiqueta del histórico ni copiar bloques previos como actuales.
