# Validación de Marketing Carmelita

Estado del corte de revisión: **11 de octubre de 2026**. Este documento registra la aceptación de las composiciones y del contenido; la verificación de los MP4 y de la entrega en Drive se registra por separado cuando termina cada proceso.

## Contenido y evidencia

- Base funcional: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`. La prueba externa del 7 de octubre acredita registro, autorización y consulta de wallets propias. No acredita todos los casos móviles ni garantiza activación instantánea.
- Los anuncios de usuarios y conexión muestran un alta manual de MCP, autorización OAuth y consultas de wallets Testnet/Devnet. Indican que la cuenta ChatGPT debe permitir conectores personalizados.
- La campaña empresarial presenta una **visión en desarrollo** y una integración piloto por preparar. No anuncia alta pública de proveedores, Bazaar, compras ni ejecución de servicios como funciones disponibles.
- Los ejemplos son ilustrativos. No contienen correos, direcciones, credenciales ni conversaciones reales. Los CTA llevan a la guía de conexión o a la landing; no implican instalación automática ni inscripción a un piloto.

## Composiciones y revisión visual

El manifiesto contiene **12 composiciones únicas**: tres campañas, duraciones de 60 y 15 segundos y formatos 1920×1080 y 1080×1920, todos a 30 fps. Cada secuencia suma exactamente su duración.

Los doce informes finales `snapshots/*.check.json`, generados con HyperFrames 0.8.149, devuelven `ok: true`, con comprobación del navegador ejecutada:

| Comprobación | Resultado agregado |
|---|---|
| Errores de lint | 0 |
| Errores de runtime | 0 |
| Errores de layout en las muestras | 0 |
| Contrastes comprobados y aprobados | 742 de 742 |
| Advertencias heurísticas de lint | 72 |

Las advertencias corresponden a logos repetidos (`duplicate_media_discovery_risk`) y a escenas anidadas en una composición monolítica (`nested_structure_needs_subcomposition`). Son observaciones sobre descubrimiento de medios y organización de la edición en Studio; no son errores de runtime o layout. Los checks no usan modo estricto y no constituyen una auditoría exhaustiva de todos los fotogramas.

La revisión independiente de tres contact sheets —empresas horizontal de 60 s, conexión vertical de 60 s y usuarios vertical de 15 s— no detectó recortes, superposiciones ni problemas de legibilidad en los mensajes principales.

Se conserva una observación editorial menor: las tarjetas genéricas de escenas `statement` muestran una selección de cuatro redes, con Avalanche como titular, y omiten Stellar; esa tarjeta también aparece en la introducción empresarial. Las tarjetas explícitas de wallets y conversación muestran las cinco redes. La selección no se presenta como el catálogo completo y no bloquea la entrega, aunque puede mejorarse en otra revisión.

## Música y archivos finales

La música es instrumental original, sintetizada localmente sin locución ni muestras de terceros. Las fuentes WAV son estéreo, PCM de 16 bits a 48 kHz. `assets/audio/music-probes.json` registra **−18 LUFS** para ambas duraciones y picos verdaderos de −6,69 dBTP (60 s) y −6,91 dBTP (15 s).

La aceptación de los AAC contenidos en los MP4 queda pendiente del verificador final. `scripts/verify.mjs` comprueba duración, resolución, 30 fps, H.264, AAC estéreo, decodificación completa, volumen y hashes, y produce `delivery/media-verification.json`. Este documento no declara que los doce renders finales ni la subida a Drive hayan terminado.

## Aislamiento y fuentes recuperables

El proyecto está limitado a `marketing/videos/` en la rama `codex/videos`. No modifica la aplicación ni publica en Vercel. Dependencias, renders, snapshots y cachés están excluidos de Git y del ZIP fuente; las licencias acompañan los assets compartidos.

El grafo del repositorio se actualizó mediante extracción AST y registra **4.024 nodos**. Las advertencias por falta de extractor SQL no corresponden a cambios SQL: esta entrega no modifica SQL.

La entrega final deberá acompañarse de `delivery/media-verification.json`, `delivery/source-manifest.json` y `delivery/drive-manifest.json`. Estos documentos son los comprobantes de archivos, recuperación del ZIP y metadatos de subida; sus resultados no se anticipan en este corte.
