# Consulta de compatibilidad — borrador sin enviar

Destinatario previsto: soporte o equipo de plataforma de OpenAI. El usuario decide el canal y realiza el envío; este documento no se ha enviado.

## Contexto

Carmelita es un conector MCP personal para ChatGPT, con identidad autenticada, consultas de billeteras Testnet y catálogo de servicios. Queremos demostrar una tarea de Guionista descubierta en nuestro Bazaar, con confirmación específica, resultado e historial propios.

La propuesta futura usa x402 y USDC en Stellar Testnet, sin dinero real, compra de cripto ni custodia de fondos. La confirmación no autorizaría operaciones posteriores. Mainnet sería una entrega distinta, con nueva autorización y revisión.

## Preguntas concretas

1. ¿La restricción de transferencias de la sección 1.6(h) permite alguna prueba privada en Developer Mode usando exclusivamente activos Testnet sin valor monetario? Si existe, ¿cuáles son sus condiciones y límites explícitos?
2. ¿Puede una herramienta MCP preparar, solicitar confirmación o facilitar esa transferencia de prueba dentro de ChatGPT, o debe permanecer completamente fuera de sus servicios?
3. ¿La restricción de comercio de servicios digitales distingue una demostración sin monetización real de una compra comercial? ¿Cómo aplica a este caso de x402 Testnet?
4. ¿Qué flujo está admitido para acceder a un servicio gratuito o ya incluido en una cuenta, conservando confirmación, entrega e historial dentro de ChatGPT?
5. ¿Qué distribución y enlace de conexión pueden utilizarse para un piloto con cuentas independientes y móvil? No disponemos todavía de un enlace público de instalación aprobado.
6. ¿Se admite consultar metadatos de un catálogo que declara precios Testnet cuando el complemento mantiene bloqueadas preparación, aprobación, firma, ejecución y enlaces de checkout? Solicitamos distinguir ese acceso informativo de una oferta de compra.

## Fuentes consultadas

- [App Developer Terms, actualización publicada el 28 de septiembre de 2026](https://openai.com/policies/developer-apps-terms/): incluye conectores personalizados y limita transferencias monetarias, cripto y financieras mediante sus servicios.
- [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines): restricciones de comercio de servicios digitales y acceso a funciones ya incluidas.

No se encontró una excepción explícita para Testnet. No se interpreta Developer Mode, un faucet o la ausencia de valor monetario como autorización implícita. Este borrador solicita aclaración; no afirma que el caso esté aprobado.

## Condición de publicación

Mientras no haya una respuesta aplicable que resuelva la compatibilidad y pruebas técnicas del cliente, Carmelita no expondrá operaciones MCP que preparen, aprueben, firmen o ejecuten esta compra. Sus consultas y catálogo pueden seguir avanzando. No presentar una generación gratuita o simulación como compra real.
