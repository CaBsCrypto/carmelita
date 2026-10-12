# Música original de Marketing Carmelita

**Título:** Carmelita — Conversación abierta.

Composición instrumental original creada para esta campaña mediante síntesis local en Node.js. No utiliza canciones existentes, samples, grabaciones, voces ni servicios externos. El script combina pads suaves, bajos, notas pulsadas y percusión sintetizada, con un crecimiento ligero de capas en la versión larga.

## Archivos y uso

| Archivo | Duración | Formato | LUFS integrados | Pico real |
|---|---:|---|---:|---:|
| `assets/audio/brand-bed-60s.wav` | 60.000 s | PCM16, estéreo, 48 kHz | −18.00 | −6.69 dBTP |
| `assets/audio/brand-bed-15s.wav` | 15.000 s | PCM16, estéreo, 48 kHz | −18.00 | −6.91 dBTP |

Usar la pista correspondiente a la duración del anuncio, sin recortar la de 60 segundos directamente a 15. Ambas incluyen entrada suave de 0.5 segundos y salida de 2 segundos. Las dos orientaciones y los tres temas comparten esta identidad musical. No añadir locución. La narración visual debe entenderse también con el audio apagado.

## Reproducción

Desde la raíz de `marketing/videos/`:

```powershell
node scripts/music.mjs
```

Requiere Node.js, FFmpeg y FFprobe en PATH. No tiene dependencias npm y no realiza solicitudes de red. El script produce los dos WAV y `assets/audio/music-probes.json`, con metadatos, loudness, versión de FFmpeg y hashes SHA256. La semilla fija es `0x4341524d` y el tempo es 90 BPM; armonía Dmaj9, Bm9, Gmaj9 y Asus4, con melodía y arreglo propios.

El render local de referencia utiliza Node 24.14.0 y FFmpeg 8.1.2. Dos ejecuciones consecutivas produjeron los mismos bytes:

- 60 s: `dfa46b5c6d73a6261d82d225840e508c388109cd212cdd23d619680301059971`
- 15 s: `8d77f974f709f22bc4399241f22173884d9abb533d4f84aaa394263d076137cd`

El generador normaliza en dos pasadas y rechaza una salida fuera de −18 ±2 LUFS o por encima de −1 dBTP. FFprobe confirmó duración exacta, 48 kHz y dos canales. FFmpeg `astats` midió un pico de muestra de −6.70 dBFS y offset DC absoluto de 0.000054 en la versión de 60 segundos; no hay saturación. El WAV conserva margen suficiente para la posterior codificación AAC del MP4, que también debe medirse en la validación final.

## Licencia

La composición **Carmelita — Conversación abierta** y sus dos archivos WAV originales se ofrecen bajo **[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)**, para su reutilización, modificación y uso comercial sin atribución obligatoria.

Esta dedicación se limita a la composición y sus WAV sintetizados. No cambia la licencia del código del repositorio, del logo Carmelita, de fuentes, marcas, videos ni otros assets. Las licencias de esos elementos se documentan por separado.
