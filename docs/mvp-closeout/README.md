# Carmelita + Bazaar — cierre de MVP

Inicio: 5 de octubre de 2026, 00:27 America/Santiago (03:27 UTC).
Objetivo de trabajo: 72 horas desde el inicio. No es una aprobación automática de publicación.

## Base y responsables

- Producción de referencia: `7edcb1890a76a7dfcf9f3eb4da50615807a951be`.
- Candidata de partida: PR46, `608bb84218be9834607aa414736fac98202520a5`.
- Scrum Master: agente coordinador de este chat; integración y publicación centralizadas.
- Dos subagentes activos por pareja. Los diez responsables se ejecutan en cinco olas.

| Pareja | Responsabilidades | Estado |
| --- | --- | --- |
| A1 / A2 | Respaldo, ramas / seguridad de demo legacy | Revisado; 33 archivos preservados, 41/41 pruebas de frontera, lint y tipos pasan |
| A3 / A4 | Catálogo Bazaar / contrato de consumo e identidad | En curso |
| A5 / A6 | Complemento y alta / landing | Pendiente |
| A7 / A8 | Recuperación de sesión / QA independiente | Pendiente |
| A9 / A10 | Publicación y ramas / demo y documentación | Pendiente |

## Criterios de salida

1. Trabajo local pendiente conservado y verificado antes de limpiar ramas.
2. Catálogo público de demo disponible; mutaciones y recibos sin propietario rechazados en servidor.
3. Bazaar canónico conectado con datos, estados parciales y límites honestos.
4. Landing con conexión guiada a ChatGPT y exploración de servicios; sin prometer instalación directa no comprobada.
5. Recuperación de sesión, plazos completos y aislamiento del propietario.
6. Pruebas, CI, Preview y evidencia vinculados al commit final. Alta independiente y teléfono real se registran por separado de los tests automáticos.
7. Producción usa configuración productiva, nunca el artefacto QA. Rollback de referencia preservado.
8. PR cerrados como incorporados, sustituidos o aplazados con evidencia; cierre no significa que todas las funciones estén terminadas.

## Dependencias que no deben falsearse

- Compra nativa en ChatGPT: bloqueada para publicación hasta aclarar compatibilidad con los términos y guías de OpenAI y acreditar firma por el usuario dentro del cliente.
- Bazaar: su sprint hospedado de compra x402 es independiente. Consumir su contrato aceptado; no duplicar ejecutor ni modificar su checkout desde este cierre.
- Magic link de historial: no implica delegación de compra o control de wallet. Vinculación requiere pruebas de ambas identidades.
- Tester independiente: solicitado al usuario; todavía no acreditado.
- Mainnet, voz, puentes y worker duradero de preparación: fuera de esta entrega.

## Registro de verificación

Cada frente entrega archivos, SHA cuando esté integrado, comandos y resultados, y límites restantes. El coordinador conserva evidencias saneadas en `work/mvp-closeout-20261005/`. No guardar secretos, magic links privados, tokens, firmas reutilizables ni direcciones personales en documentos públicos.
