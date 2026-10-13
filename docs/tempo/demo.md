# Demo de Tempo — recorrido de 90 segundos

Estado: **consulta real de A ejecutada desde ChatGPT; vídeo de 90 segundos no grabado**. Este recorrido muestra resultados registrados, no una consulta nueva ni aceptación completa de Fase A. B pasó login/asociación/lectura en UI; su MCP con grant QA independiente continúa bloqueado. El cliente separado ya existe sin grants, pero ChatGPT rechazó crear la App nueva; el PM decidió entregar con esa App pendiente. Los accesos públicos temporales están retirados. [Validación](validation.md) y [datos sanitizados](evidence/preview-qa-20261013.json).

| Tiempo | Evidencia que se muestra | Narración |
| --- | --- | --- |
| 0–15 s | Preview `dpl_2fLJAdDjcxvtqkNccRwuFJ3GpEPL`, SHA `5a5fec9`; wallet A `0x7A33…9d07` | «Esta lectura se hizo en Moderato testnet y una base QA separada. Reutilizamos la wallet EVM existente de Privy.» |
| 15–30 s | Asociación explícita y repetida: una identidad canónica y un binding Tempo por usuario; UI A–B–A volvió a la dirección A | «Agregar la red conservó identidad y dirección. No creó otra wallet ni concedió firma.» |
| 30–55 s | Abrir la [conversación real de A](https://chatgpt.com/c/6acdb6c2-413c-83e9-a081-e596f320a021): primer error RPC y reintento exitoso | «La primera lectura informó no disponible. El reintento consultó el saldo desde ChatGPT sin inventar un cero.» |
| 55–75 s | Respuesta registrada `04:44:01Z`: 42431, PathUSD, contrato `0x20c0…0000`, seis decimales, saldo bruto/decimal `0`, bloque `39366472`; RPC independiente coincidió en ese bloque | «Cero es un saldo medido. Dirección, token, bloque y monto coinciden con la comprobación independiente.» |
| 75–90 s | [Explorador de A](https://explore.testnet.tempo.xyz/address/0x7A33b72BddF1d6D01c279b6cC9049c5E751f9d07), ruta comprobada y cero transacciones visibles; estado pendiente de B MCP | «La misma dirección no tiene historial visible. A funciona desde ChatGPT; faltan la prueba MCP de B y negativos de seguridad. Los pagos Tempo de Fase B siguen fuera de alcance.» |

La comparación adicional del conector en esta conversación usó `read_personal_wallets` y `read_personal_wallets_balances({networks:["tempo:moderato"]})`: lectura `04:44:31.979Z`, bloque `39366523`, mismo saldo y dirección, contrastados por RPC. El informe distingue esta llamada de la conversación web anterior.

Prompt utilizado para descubrimiento/lectura, sin IDs arbitrarios:

> Descubre mis wallets registradas en Carmelita y consulta su estado actual solo en Tempo Moderato testnet. Muestra dirección, chain ID verificado, token y contrato, saldo bruto y decimal, bloque consultado, hora de lectura y enlace al explorador. Si falla la lectura, indica el estado y su causa.

Reintento que obtuvo el resultado: pedir únicamente la lectura de balances para `tempo:moderato`. No se comprobó la causa concreta del primer error `tempo_rpc_unavailable`.

No iniciar una llamada nueva a la App revocada para repetir esta demo: el conector puede abrir reautenticación y restablecer el grant. Una sesión nueva de QA requiere ventana autorizada y cierre de sus accesos. No mostrar correos, códigos, credenciales, Authorization ni IDs privados en una grabación. El historial del explorador no se usa como prueba del balance TIP-20.
