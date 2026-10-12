# Carmelita, tu agente personal en ChatGPT

Rama: `codex/landing-redesign`. Base: `caa3cd3757dbe6e2473bc78eeedca45ee2bb1542`.

La portada presenta a Carmelita como agente personal en ChatGPT: una cuenta propia, información y permisos que el usuario controla. Presenta el recorrido de añadir Carmelita manualmente en ChatGPT y autorizar una identidad. Mantiene el CTA recomendado y ofrece ingreso directo. Español, inglés y portugués conservan el selector y el recorrido existentes.

Tras elegir el enfoque de complemento de ChatGPT, el usuario pidió recuperar la definición amplia de agente personal del README y la narrativa del producto. El titular es «Carmelita, tu agente personal en ChatGPT». La visión de conectar aplicaciones y servicios aparece después de los beneficios, marcada «Nuestra visión · En desarrollo». Cada integración necesita su propia validación.

Stellar es el ejemplo principal para la presentación a una conferencia: figura en la apertura, la conversación ilustrativa y la sección «Pregunta. Carmelita consulta por ti». La demostración describe consultas de registro, estado de activación y saldo XLM con referencia al explorador. No muestra datos personales, importes, direcciones ni resultados de activación inventados. Las otras cuatro redes conservan su explicación en la FAQ.

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

## Presentación 3D · 12 de octubre de 2026

La revisión conserva el mensaje de agente personal, el CTA recomendado y Stellar como primer ejemplo. La tarjeta incorpora capas y relieve CSS, una inclinación pequeña con el puntero y una escena decorativa de órbitas y nodos. Los botones y el contenido permanecen en HTML, fuera del canvas. Se ajustaron las columnas del hero y el acabado del panel Stellar para integrar la composición.

Three.js queda fijado en `0.186.1` y sus tipos en `0.186.0`, con lockfile. `landing-depth-scene.ts` administra únicamente sus geometrías, materiales, renderer y canvas; `landing-depth-stage.tsx` controla importación diferida, visibilidad, preferencias, resize, interacción y limpieza. La escena se carga sólo con al menos 900 px, hover y puntero preciso, cuando está visible y no se solicita movimiento reducido. Móvil conserva el acabado CSS. No hay bucle de render permanente: se redibuja al cambiar tamaño o pose, y la interpolación termina al alcanzar el destino. Se limita el DPR a 1,5; no se utilizan texturas, sombras ni postprocesado.

El control de aceptación incluye la configuración de dependencias en los seis grupos de consultas. Se regeneró únicamente `acceptance-runtime.json` con el helper existente. Restaurar en memoria la configuración anterior reproduce exactamente las seis huellas previas: no cambió código de ejecución de consultas. El manifiesto y la evidencia histórica conservan sus bytes; no se reescribieron observaciones ni se certificó nueva aceptación. La comparación antes/después no cambia el estado de disponibilidad o aceptación de ninguna consulta en esta candidata. El informe queda en `runtime-refresh.json`.

El botón «Reducir efectos», traducido a los tres idiomas, permite aplanar la tarjeta y retirar la escena. La preferencia del sistema evita la inicialización GPU y elimina las transiciones. Fallos de WebGL, importación o pérdida de contexto conservan la conversación y la decoración CSS. La implementación sigue las referencias oficiales de [render por demanda](https://threejs.org/manual/pages/rendering-on-demand.html), [resize responsivo](https://threejs.org/manual/pages/responsive.html) y [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html).

Evidencia local en `work/landing-qa-depth/`, excluida de Git:

- ES/EN/PT en 320, 390, 768, 1024 y 1440 px: 15 combinaciones sin desbordamiento; texto visible mínimo de 14 px. Cero canvas por debajo de 900 px y uno en los dos anchos de escritorio probados.
- Scene real: 9 draw calls, 3.440 triángulos, DPR 1 en este navegador. Son contadores del renderer, no una medición de FPS ni de memoria GPU.
- Fixture con el Stage real en React StrictMode: reducción manual, preferencia JS de movimiento reducido simulada, pérdida real del contexto y WebGL no disponible conservan HTML y dejan cero canvas y cero RAF pendientes.
- Tres ciclos de desmontaje y montaje retiran canvas, listeners de preferencia y RAF pendientes; al volver se crea un solo canvas. Resolver una importación retenida después del desmontaje no crea contexto; el siguiente montaje recupera la escena.
- La interpolación de una pose extrema termina. Una comparación posterior en reposo durante un segundo mantuvo iguales los contadores de render y RAF, con cero cuadros pendientes. La primera muestra tomada durante la interpolación sí avanzó, como corresponde.
- Revisión independiente del ciclo de vida y de React sin bloqueos concretos. `pending` puede permanecer en un Stage fuera del viewport hasta su entrada; no indica por sí solo un error de hidratación.
- Build de producción local: se repitieron las 15 combinaciones de tamaño e idioma; control de efectos con Espacio, foco visible, salto al contenido y siguiente Tab al CTA aprobados. Cinco FAQ abiertas por teclado y reflujo equivalente al 200 % sin desbordamiento. Contraste de 59 pares de texto, incluidas las FAQ abiertas, mínimo 5,49:1. Guía, documentación e ingreso directo conservan sus destinos; el ingreso local mantiene el aviso esperado sin credenciales Privy. Sin errores o warnings en la consola de esta portada.
- `qa:local` final aprobado: 7 pruebas del tooling Graphify, lint sin warnings, 1.048 pruebas de aplicación aprobadas y 2 omitidas, build y TypeScript aprobados. Graphify actualizado por AST con los nuevos archivos: 3.866 nodos y 10.008 aristas. El build local advierte sobre los múltiples lockfiles de este worktree anidado; no falla ni requiere cambiar la configuración de producción.

La preferencia OS del fixture sólo simula `matchMedia`; no prueba el CSS de una configuración nativa de sistema. La verificación manual de esa preferencia, zoom real al 200 % y dispositivos físicos sigue pendiente. Los contadores no certifican liberación física de VRAM. Los checks requeridos y las capturas del build final se registran en el manifiesto local asociado al commit entregado.

## Conversación protagonista · 12 de octubre de 2026

Tras comparar tres alternativas, se aplica la apertura «Conversación protagonista». Conserva el título de agente personal en ChatGPT y Stellar como primer ejemplo. La tarjeta clara presenta una pregunta y una respuesta explicativa, sin dirección, saldo numérico ni estado inventado. El explorador aparece como texto ilustrativo, sin simular un enlace a una cuenta real. La nota Testnet ilustrativa queda dentro de la tarjeta; los fondos de prueba y la autorización se explican debajo.

El CTA mantiene su destino `/connect-chatgpt`, con «Recomendado» asociado mediante `aria-describedby` fuera del botón. El ingreso directo conserva `/agent?connect=privy`. Se reduce el texto inicial y se mantienen ES/EN/PT. La portada ya no importa `LandingDepthStage`: las órbitas y el control de efectos se retiran de esta apertura, y la profundidad se resuelve con una inclinación CSS estática que desaparece en móvil y con movimiento reducido. Los archivos de la exploración Three.js se conservan en la rama; no se inicializa WebGL en esta variante.

La evidencia local está en `work/hero-conversation-qa/`, excluida de Git. Se comprobaron quince combinaciones de idioma y ancho (320, 390, 768, 1024 y 1440 px), sin desbordamiento y con texto visible de al menos 14 px; cero canvas en todos los casos. Reflujo equivalente al 200 %, destino del CTA y regreso a la portada aprobados. Las capturas documentan escritorio y móvil. El build local y los checks requeridos se registran por separado; esta revisión no certifica una nueva conexión OAuth ni publicación hospedada.

## Continuidad de la landing · 12 de octubre de 2026

La apertura aprobada de «Conversación protagonista» se conserva. El resto sigue su paleta, tipografía y superficies claras, con este orden: beneficios ligeros, caso Stellar, pasos de conexión, preguntas frecuentes, visión de aplicaciones en desarrollo e invitación final. La franja de beneficios tiene un título accesible y tres subtítulos; la jerarquía visible reserva los títulos principales para las secciones.

Stellar es el primer ejemplo desarrollado, dentro de un panel blanco con pregunta y respuesta ilustrativa. No muestra saldos, direcciones ni una activación inventada. Conserva la condición de confirmación de red y la posibilidad de un estado pendiente. Los pasos comparten un contenedor con una lista accesible; las FAQ ofrecen foco visible dentro de su panel. La visión usa un diagrama simple de aplicaciones → Carmelita → ChatGPT, expresamente marcado como desarrollo y con compras/ejecución pendientes. El CTA final repite el acceso recomendado a la guía y conserva ingreso directo como alternativa.

Se mantienen español, inglés y portugués; contratos de identidad, MCP y wallets intactos. Los destinos nuevos sólo usan `/guide#chatgpt` y `/guide`, ya existentes. No se añaden dependencias ni GPU.

Evidencia en `work/landing-continuity-qa/`, excluida de Git: 21 combinaciones de idioma y ancho (320, 390, 768, 899, 900, 1024 y 1440 px), sin desbordamiento, un H1, texto visible ≥14 px y enlaces/summary de al menos 44 px. Las cinco FAQ se abren con Enter, manteniendo foco de 3 px dentro del panel. Con todas abiertas, 79 pares de texto tienen contraste mínimo 5,73:1. Reflujo equivalente al 200 % y enlace Stellar a la guía con regreso a la portada aprobados. Zoom nativo y dispositivos físicos no se certifican. `qa:local` completó tooling Graphify, lint, 1.048 pruebas aprobadas (2 omitidas), TypeScript y build. Graphify se actualizó mediante AST: 3.873 nodos y 9.504 aristas.

Esta revisión queda en un commit local de la misma rama. Las capturas y el manifiesto identifican la candidata; no hay push, fusión ni publicación hospedada.

## Fuentes y conexiones · 12 de octubre de 2026

Se retiran «Nuestro primer caso de uso» y sus variantes EN/PT. La sección se presenta como «Una conversación. Varias conexiones»: Stellar sigue como ejemplo destacado, seguido de datos de mercado de CoinGecko/CoinMarketCap y el piloto UNBLCK. La apertura, la invitación final, una FAQ sobre cuentas de proveedores y los metadatos reflejan ese alcance. Se preservan el título de agente personal, el botón recomendado y la línea visual clara.

La revisión de afirmaciones públicas usa el registry y evidencia existente:

- Stellar: lectura de cuenta Testnet, registro, activación y XLM. No se inventan una cuenta activa, dirección ni saldo; la red debe confirmar la activación.
- Mercado: `app/queries/market.ts` y `app/market-data/service.ts` implementan búsqueda y cotizaciones, con CoinGecko principal y CoinMarketCap alternativo. La matriz de canales registra mercado real del 1 de octubre; `docs/pilot-provider-diagnosis-2026-10-04.md` conserva un diagnóstico de metadata de CMC. No se convierte ese diagnóstico en aceptación actual de cotizaciones CMC, ni se afirma alianza comercial. Precios Mainnet no valoran fondos Testnet.
- UNBLCK: `offchain.unblck.hub_state` lee créditos, días abiertos y reservas del propietario con identidad ya vinculada. La última matriz registra timeout web / 403 ChatGPT; se muestra «Integración piloto» y validación de acceso pendiente, también en metadatos sociales. No se anuncian vinculación automática, reservas o cancelaciones desde ChatGPT.

La inspección local de `evaluateQueryAcceptance` dejó mercado y lecturas personales pendientes por `implementation_fingerprint_changed`; UNBLCK permanece pendiente por `real_channel_acceptance_missing`. Es estado de certificación y no un interruptor de ejecución en el registry. La evidencia histórica y sus hashes se conservan sin reescribir. Esta edición no cambia runtime, contratos, scopes, fuentes ni manifiestos de aceptación y no realiza nuevas consultas autenticadas al proveedor.

Las capturas y verificaciones están en `work/landing-connections-qa/`, excluidas de Git: 21 combinaciones de idioma/ancho, sin desbordamiento, un H1, texto visible mínimo de 14 px y Stellar primero en todos los casos. Las seis FAQ se abren con Enter y conservan foco visible. Con todas abiertas, 94 pares de texto tienen contraste mínimo 5,73:1; reflujo equivalente al 200 % sin desbordamiento. Zoom nativo, dispositivos físicos y una nueva aceptación operativa de proveedores siguen fuera de esta revisión visual. Los checks y el build local se registran en el manifiesto de la candidata final.

## Consultas como recorrido · 12 de octubre de 2026

La revisión aprobada centra el relato en las preguntas que una persona puede hacer a Carmelita. Conserva «Carmelita, tu agente personal en ChatGPT», la apertura de conversación, el botón recomendado, los enlaces de ingreso y la línea visual clara. La explicación inicial describe información personal, mercado y permisos.

«Pregunta. Carmelita consulta por ti» reúne dos ejemplos en un panel. Stellar ocupa la primera fila y presenta dirección, activación y saldo XLM como campos consultables, sin resultados inventados. La segunda pregunta consulta el precio de XLM: muestra el tipo de respuesta en USD y la identificación de fuente y momento. CoinGecko y CoinMarketCap se mencionan debajo de esa respuesta, como fuentes, con sus roles principal y alternativo. La consulta de mercado permanece separada del valor de los fondos Testnet.

El recorrido continúa con tres pasos de instalación manual, la visión de aplicaciones en desarrollo, las preguntas frecuentes y la invitación final. UNBLCK aparece únicamente como piloto dentro de la visión: lectura de créditos, días y reservas de una cuenta ya vinculada, con validación de acceso pendiente. No se invita a ejecutar acciones ni se anuncia una integración aceptada. La FAQ conserva compatibilidad de cuenta ChatGPT, alta durante OAuth, cinco redes, dirección EVM compartida, confirmación Stellar y XLM nativo sin trustline.

Se mantienen ES/EN/PT y los metadatos reflejan las consultas y la visión. No cambian backend, identidad, MCP, wallets, fuentes o evidencia de aceptación. No se añaden dependencias, llamadas autenticadas ni WebGL. La evidencia de esta candidata se guarda en `work/landing-questions-qa/`, excluida de Git.

Verificación local: tooling Graphify (7 pruebas), lint sin warnings y suite con 1.048 aprobadas, 2 omitidas y 0 fallidas. El primer build se detuvo por acceso denegado de SWC al resolver la ruta Windows del worktree dentro del sandbox; se conserva ese log. El build y TypeScript se completaron correctamente al repetir exclusivamente el build local fuera de esa restricción. Lint se volvió a comprobar sobre los TSX finales después del orden definitivo de secciones. No se repitió la suite de aplicación sin cambios que lo justificaran.

El build local renderizado pasó 21 combinaciones ES/EN/PT × 320, 390, 768, 899, 900, 1024 y 1440 px: sin desbordamiento, un H1, texto visible ≥14 px, Stellar primero y UNBLCK dentro de la visión. Se revisaron capturas a 320 y 900 px. Salto al contenido y siguiente Tab al CTA conservaron foco; las seis FAQ se abrieron con Enter y foco visible de 3 px. Se comprobaron 98 pares de contraste con mínimo 5,73:1. El reflujo equivalente al 200 % pasó a 720 × 450; zoom nativo y dispositivos físicos siguen pendientes. El CTA abre `/connect-chatgpt`; inicio de sesión, guía y desarrolladores conservan sus destinos. No hubo errores de consola en la portada. Graphify actualizado por AST: 3.871 nodos, 10.019 aristas, 170 comunidades; la dependencia de extracción SQL sigue ausente. No se cambia la certificación operativa de proveedores.

## FAQ para integrar un servicio · 12 de octubre de 2026

La FAQ añade «¿Cómo hago para que mi servicio aparezca en Carmelita?» en ES/EN/PT. Explica la preparación de un piloto: describir el servicio y una consulta concreta, reunir documentación API/MCP si existe, definir autorización y preparar la validación de resultados, permisos, aislamiento y errores. El enlace «Preparar mi integración» abre `/developers#pilot`, la sección existente de preparación. La FAQ pasa a titularse «Preguntas frecuentes» para incluir tanto conexión de usuarios como integración de servicios.

La incorporación requiere revisión y validación; el alta pública y automática sigue en desarrollo. Esta página no promete recepción de solicitudes ni un registro de proveedores habilitado: actualmente no hay formulario de solicitud montado en el portal. La revisión modifica únicamente copia y presentación de la FAQ; no implementa alta, pagos ni ejecución.

Validación enfocada en `work/landing-service-faq-qa/`: lint y build/TypeScript locales aprobados; ES/EN/PT a 320, 720 y 1440 px (nueve casos), sin desbordamiento, texto mínimo de 15 px y tres pasos numerados. Apertura con Enter y enlace al piloto comprobados en el navegador. Graphify actualizado por AST (3.871 nodos, 10.019 aristas), con la limitación SQL ya documentada. La suite de aplicación de la revisión anterior no se repitió para este cambio de copia y presentación. Sin push, fusión ni publicación Vercel.

## Publicación

El 12 de octubre se verificaron `previewDeploymentsDisabled: true` y el Ignored Build Step que omite ramas distintas de `main`. El proyecto conserva máquina Standard fija y concurrencia adicional desactivada. El PR se entrega como borrador para revisión en GitHub: no fusionar ni publicar sin la decisión posterior prevista en la política de costes. Esta tarea no crea despliegues Vercel ni cambia configuración hospedada.
