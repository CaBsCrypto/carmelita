# Carmelita como complemento de ChatGPT

Rama: `codex/landing-redesign`. Base: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`.

La portada explica qué es Carmelita y qué permite consultar: información de la cuenta autorizada, wallets y estado de red, y datos de mercado mediante los adaptadores de lectura existentes. Presenta el recorrido de añadir Carmelita manualmente en ChatGPT y autorizar una identidad. Mantiene el CTA recomendado, ofrece ingreso directo y separa la visión de servicios bajo «En desarrollo». Español, inglés y portugués conservan el selector y la persistencia existentes.

El usuario eligió el enfoque «Complemento de ChatGPT: qué es y qué permite consultar» frente a las otras dos propuestas. La revisión sustituye el titular centrado en wallets y la tabla de direcciones del hero por una conversación ilustrativa con tres tipos de consultas. Stellar es el primer caso de uso en una sección propia y encabeza las redes de la FAQ. No hay datos personales ni resultados de activación inventados.

No se anuncian Bazaar, compras, ejecución de servicios ni historial completo como prestaciones disponibles. Stellar distingue preparación de wallets y confirmación de activación por la red; XLM es nativo y no requiere trustline. La guía compartida permite crear identidad durante OAuth y propone comprobar Stellar como consulta posterior. Las consultas de mercado son de lectura y dependen de fuentes disponibles; esta revisión de interfaz no certifica la disponibilidad actual de cada proveedor ni muestra cotizaciones en vivo.

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
| Contraste renderizado | 73 pares de texto, incluidas FAQ abiertas; mínimo 5,49:1; sin fallos |
| Teclado | Salto al contenido, acceso al CTA, foco visible y apertura/cierre de FAQ |
| Navegación | Guía, documentación de desarrolladores e ingreso directo conservan sus destinos; comprobados desde la portada renderizada |
| Regreso tras el salto al contenido | Corregido con NextLink; Volver restaura la portada y Avanzar restaura la guía |
| Reflujo equivalente al 200 % | Sin desbordamiento a 720 × 450, equivalente a una ventana 1440 × 900 ampliada |

El controlador del navegador interno no aplica zoom real mediante el atajo de teclado; la comprobación manual al 200 % sigue pendiente. El servidor local no tiene credenciales Privy: el destino de ingreso muestra su aviso de indisponibilidad esperado. Esta revisión no repite el alta ni OAuth contra producción, ni certifica nuevos flujos de wallets.

Capturas y mediciones de la revisión elegida quedan en `work/landing-qa-companion/`, sin datos privados y excluidas de Git; `work/landing-qa/` conserva la revisión anterior. Se guardaron vistas completas y recortes del hero de escritorio y móvil en ES/EN/PT. La revisión independiente comprobó estilos heredados, traducciones, React y la imagen social. Graphify se actualizó con AST (3.851 nodos, 9.981 aristas), sin llamadas LLM; su extractor SQL sigue sin modelar algunas migraciones porque no está instalado tree_sitter_sql.

## Publicación

El 11 de octubre se verificaron `previewDeploymentsDisabled: true` y el Ignored Build Step que omite ramas distintas de `main`. El proyecto conserva máquina Standard fija y concurrencia adicional desactivada. El PR se entrega como borrador para revisión en GitHub: no fusionar ni publicar sin la decisión posterior prevista en la política de costes. Esta tarea no crea despliegues Vercel ni cambia configuración hospedada.
