# Marketing Carmelita

Tres campañas en español: nuevos usuarios, guía de conexión y visión para empresas. Cada campaña tiene 60 y 15 segundos, en 1920×1080 y 1080×1920, a 30 fps: doce MP4. Música original, sin locución; los mensajes también se entienden sin sonido.

El proyecto es autónomo. No cambia la aplicación, permisos, base de datos, endpoints ni configuración Vercel. Base funcional: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`. Rama: `codex/videos`. No hace falta fusionar esta rama para usar los anuncios.

## Reproducir

Requisitos: Node 22+, FFmpeg y Chrome accesible para HyperFrames. Instalar sólo desde esta carpeta:

```sh
npm ci
npm run music
npm run generate
npm run check
npm run snapshots
npm run render
npm run verify
```

HyperFrames está fijado a 0.8.149 y GSAP a 3.14.2. `package-lock.json` preserva dependencias. Los comandos operan localmente, con telemetría deshabilitada; no usan render cloud, Vercel, TTS ni APIs de generación. El motor puede necesitar acceso al navegador local. La música usa sólo Node y FFmpeg.

`node scripts/batch.mjs check usuarios-15s-horizontal` verifica una selección. `render` conserva archivos existentes: para renderizar un cambio, mover primero el MP4 anterior a una carpeta de respaldo. Los assets compartidos se copian mecánicamente a cada composición mediante `generate`; esas copias, dependencias, renders y cachés no entran en Git ni en el ZIP fuente.

## Editar

- `content/campaigns.json`: textos, tiempos y narrativa. Cada principal debe sumar 60 segundos; cada corte, 15.
- `scripts/generate.mjs`: diseño, paleta y animación de cada relación de aspecto.
- `scripts/music.mjs`: partitura y síntesis deterministas.
- `compositions/*/index.html`: proyectos HyperFrames editables; una regeneración reemplaza los cambios directos. Editar el generador para cambios permanentes.
- `content/GUIONES.md` y `PUBLICACIONES.md`: guiones, ganchos y textos de acompañamiento.

## Mensajes y límites

La evidencia del piloto acredita registro, autorización y consulta de wallets propias. Las cinco redes son Avalanche Fuji, Base Sepolia, BNB Testnet, Solana Devnet y Stellar Testnet. Las consultas requieren una cuenta ChatGPT que permita MCP personalizados. La instalación es manual y OAuth solicita consentimiento.

Los ejemplos son ilustrativos y no incluyen correos, direcciones ni conversaciones reales. El video empresarial identifica la visión en desarrollo: Bazaar, compra, ejecución de servicios y alta pública de proveedores no se presentan como disponibles. No se promete activación instantánea, financiación de todas las redes ni aceptación móvil completa.

## Assets y derechos

El logo Carmelita procede de `public/brand` de la base indicada y se mantiene como marca del proyecto. Inter procede de https://github.com/rsms/inter y conserva su licencia OFL en `assets/fonts/OFL.txt`. GSAP procede del paquete fijado; su licencia acompaña la copia local. Las dos pistas musicales originales tienen CC0 sólo para esa composición y los WAV; véase `content/MUSICA.md`. Ninguna licencia musical relicencia las marcas ni herramientas.

## Entrega

MP4 y miniaturas se guardan en Drive `Marketing Carmelita`, junto a guiones, copies y ZIP fuente. `delivery/media-verification.json` registra formato, duración, decodificación, loudness y hashes. `delivery/drive-manifest.json` registra IDs y metadatos confirmados de la subida. No se cambian permisos de Drive ni se publican anuncios automáticamente.
