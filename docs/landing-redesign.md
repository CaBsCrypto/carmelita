# Carmelita, tu agente personal en ChatGPT

Rama: `codex/landing-redesign`. Base: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`.

La portada presenta a Carmelita como agente personal en ChatGPT: una cuenta propia, información y permisos que el usuario controla. Presenta el recorrido de añadir Carmelita manualmente en ChatGPT y autorizar una identidad. Mantiene el CTA recomendado y ofrece ingreso directo. Español, inglés y portugués conservan el selector y el recorrido existentes.

Tras elegir el enfoque de complemento de ChatGPT, el usuario pidió recuperar la definición amplia de agente personal del README y la narrativa del producto. El titular es «Carmelita, tu agente personal en ChatGPT». La visión de conectar aplicaciones y servicios aparece después de los beneficios, marcada «Nuestra visión · En desarrollo». Cada integración necesita su propia validación.

Stellar es el primer ejemplo para la presentación a una conferencia: figura en la apertura, la conversación ilustrativa y la sección «Empezamos con Stellar». La demostración describe consultas de registro, estado de activación y saldo XLM con enlace al explorador. No muestra datos personales, importes, direcciones ni resultados de activación inventados. Las otras cuatro redes conservan su explicación en la FAQ.

No se anuncian compras, ejecución general de servicios ni historial completo como prestaciones disponibles. Stellar distingue preparación de wallets y confirmación de activación por la red; XLM es nativo y no requiere trustline. La guía compartida permite crear identidad durante OAuth y propone comprobar Stellar como consulta posterior. Esta revisión de interfaz no certifica nuevos proveedores ni presenta aceptación de la conferencia. El README conserva referencias históricas que no se trasladan a promesas actuales de producción.

## Reproducir localmente

Usar Node 24.14.0 y npm 11.6.1, las versiones fijadas por el proyecto:

```sh
npx --yes npm@11.6.1 ci --no-audit --no-fund
npm run qa:local
npm run start -- --hostname 127.0.0.1 --port 8143
```

Inter se sirve desde `public/fonts/InterVariable.woff2`, con su licencia SIL OFL adjunta. La fuente y el logo provienen de los assets propios existentes. La imagen social se regenera con `node scripts/render-landing-social.mjs`; esta utilidad requiere Python con fontTools y Brotli, además de Sharp instalado por Next. El TTF derivado queda en `work/`, excluido de Git. No hay descarga de fuentes durante un build.

## Verificación

Verificación de la revisión elegida del 11 de octubre de 2026 (Santiago), incluyendo el build de producción local:

| Caso | Resultado |
| --- | --- |
| Graphify tooling | 7 pruebas aprobadas |
| Lint | Aprobado, sin warnings |
| Suite de aplicación | 1.048 aprobadas, 2 omitidas, 0 fallidas |
| Build y TypeScript | Aprobados |
| ES/EN/PT a 320, 390, 768, 1024 y 1440 px | 15 combinaciones, sin desbordamiento ni texto visible menor de 14 px |
| Contraste renderizado | 74 pares de texto, incluidas FAQ abiertas; mínimo 5,49:1; sin fallos |
| Teclado | Salto al contenido, acceso al CTA, foco visible y apertura/cierre de FAQ |
| Navegación | Guía, documentación de desarrolladores e ingreso directo conservan sus destinos; comprobados desde la portada renderizada |
| Regreso tras el salto al contenido | NextLink con destino absoluto `/#home-content` y foco explícito mediante ref; dos activaciones conservan URL y foco, y Volver/Avanzar restauran portada y guía |
| Reflujo equivalente al 200 % | Sin desbordamiento a 720 × 450, equivalente a una ventana 1440 × 900 ampliada |

El controlador del navegador interno no aplica zoom real mediante el atajo de teclado; la comprobación manual al 200 % sigue pendiente. El servidor local no tiene credenciales Privy: el destino de ingreso muestra su aviso de indisponibilidad esperado. Esta revisión no repite el alta ni OAuth contra producción, ni certifica nuevos flujos de wallets.

Capturas y mediciones de la revisión de agente personal quedan en `work/landing-qa-personal-agent/`, sin datos privados y excluidas de Git; `work/landing-qa/` y `work/landing-qa-companion/` conservan las revisiones anteriores. Se guardaron vistas completas y recortes del hero de escritorio y móvil en ES/EN/PT, además de una vista de 320 px. La revisión independiente comprobó estilos heredados, traducciones, React y la imagen social. Graphify se actualizó con AST (3.851 nodos, 9.982 aristas), sin llamadas LLM; su extractor SQL sigue sin modelar algunas migraciones porque no está instalado tree_sitter_sql.

## Publicación

El 11 de octubre se verificaron `previewDeploymentsDisabled: true` y el Ignored Build Step que omite ramas distintas de `main`. El proyecto conserva máquina Standard fija y concurrencia adicional desactivada. El PR se entrega como borrador para revisión en GitHub: no fusionar ni publicar sin la decisión posterior prevista en la política de costes. Esta tarea no crea despliegues Vercel ni cambia configuración hospedada.
