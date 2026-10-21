# Demo verificable de Tempo — 90 segundos

Estado: **demo de punta a punta no grabada ni ejecutada**. El conector QA existente devolvió `Protected by Vercel Authentication`; no hay evidencia de consulta Tempo desde ChatGPT con este código. No mostrar una respuesta simulada como una llamada real. Las pruebas y límites actuales constan en `docs/tempo/validation.md`.

La demo completa se habilita cuando exista un Preview aislado autorizado con SHA identificado, un usuario de prueba autenticado y el plugin conectado a ese endpoint. No necesita fondos, firmas ni un pago.

| Tiempo | Acción y evidencia visible | Narración |
| --- | --- | --- |
| 0–15 s | Mostrar URL y SHA del Preview correcto; login Privy de prueba ya iniciado y wallet EVM existente | «Esta es la rama Tempo en un Preview aislado. Reutilizamos la wallet EVM del usuario autenticado.» |
| 15–30 s | Asociación explícita de Tempo en UI; mostrar dirección estable. Repetir asociación o mostrar registro validado sin duplicados | «Agregar Moderato conserva dirección e identidad. La asociación no crea otra wallet ni da permiso de firma.» |
| 30–55 s | En ChatGPT conectado a ese Preview, descubrir wallets y ejecutar consulta actual de `tempo:moderato` | «ChatGPT consulta solo la wallet de esta sesión. Este resultado viene del servidor y del RPC de Moderato.» |
| 55–75 s | Respuesta muestra testnet, 42431, misma dirección, PathUSD/contrato, balance bruto y decimal, bloque/hash y hora | «El token y sus seis decimales están verificados en el mismo bloque. Cero es un saldo leído; un fallo se presenta como no disponible.» |
| 75–90 s | Abrir el enlace real de explorer de esa dirección; cerrar con alcance Fase A | «La dirección coincide. La ausencia de historial es válida. Entregamos lectura testnet; los pagos permanecen deshabilitados.» |

Prompt de lectura sugerido, sin IDs arbitrarios ni secretos:

> Descubre mis wallets registradas en Carmelita y consulta su estado actual solo en Tempo Moderato testnet. Muestra dirección, chain ID verificado, token y contrato, saldo bruto y decimal, bloque consultado, hora de lectura y enlace al explorador. Si falla la lectura, indica el estado y su causa.

Guardar evidencia sanitizada de las llamadas, URL/SHA verificadas y datos públicos de red. No mostrar email, tokens de acceso, Privy app secret, cabeceras Authorization ni IDs de proveedor innecesarios. Un hash o una wallet registrada no acreditan actividad ni saldo.

Si la conexión sigue bloqueada, la demo honesta debe terminar en ese bloqueo y mostrar por separado la lectura RPC pública y las pruebas locales. Debe titularse «avance local y RPC público; integración ChatGPT pendiente», y no presentarse como la demo de aceptación de Fase A.
