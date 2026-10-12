# Diseño de acceso con inglés principal

Esta entrega continúa `codex/landing-redesign` desde `1b25262`. Unifica ingreso, autorización y entrada al agente con la portada, la conexión, la guía y desarrolladores. La preparación y la verificación son locales; no hay push, fusión ni builds hospedados.

## Recorrido y presentación

- `/login` presenta «Sign in to Carmelita», creación o recuperación de cuenta y acceso a la guía. Conserva el ingreso Privy y el destino `/agent`. Se retiran promesas de historial completo, contratos, políticas y recibos del mensaje de bienvenida.
- `/oauth/authorize` usa la marca real, identidad, permisos y acciones con jerarquía legible. Conserva query, scopes, validación de callback, plazos, decisión única y aislamiento por propietario. Denegar muestra una confirmación específica y conserva el callback `access_denied`; Continuar vuelve al chat sin conectar Carmelita. La página tiene metadatos en inglés y `noindex`.
- `/agent` comparte la presentación de acceso en bienvenida sin sesión, carga y entorno sin configuración. ChatGPT es la entrada recomendada; el chat directo es la alternativa. `connect=privy`, sus condiciones de ingreso y los borradores existentes se conservan.
- Los avisos de preparación, error, preparación parcial y activación Stellar utilizan estilos compartidos. Los reintentos, límites temporales y condiciones de activación no cambian. El chat autenticado y la administración conservan sus interfaces.

El CSS Module de acceso usa Inter local, fondo `#fcfdfb`, verde `#153f32`, coral y superficies claras. No modifica estilos globales ni añade dependencias. OAuth aplica overrides locales con mayor especificidad para evitar resultados ambiguos al combinar módulos. Textos secundarios de al menos 14 px, controles de al menos 44 px, acciones principales de 52 px, foco visible y movimiento reducido.

## Idioma y preparación

El store conserva inglés como idioma inicial y de servidor. ES/PT siguen disponibles; la elección guardada se conserva al navegar, desmontar y recargar, sin detectar idioma por ubicación ni navegador. Metadatos de guía, desarrolladores y catálogo pasan a inglés. Los metadatos generales reflejan «Carmelita, your personal agent in ChatGPT» y las conexiones de aplicaciones en desarrollo.

La prueba detectó que cambiar idioma durante una preparación pendiente cancelaba la petición y creaba otra: el callback dependía de `locale` para traducir un error. Ahora guarda el tipo de fallo y traduce al renderizar. Su lifetime depende de identidad y acceso, conservando las cancelaciones por cambio de usuario. EN → ES → PT mantiene una preparación y cero abortos por idioma. El timeout también se traduce con el idioma actual.

Stellar es un ejemplo ilustrativo; no aparecen contactos, direcciones ni saldos reales. Activación confirmada y pendiente siguen dependiendo de la respuesta de red. XLM Testnet no tiene valor real; el ingreso no autoriza pagos, Mainnet ni financiación USDC.

## Evidencia y límites

La evidencia local está en `work/access-design-qa/`, excluida de Git, con un manifiesto asociado al commit final:

- Suite completa: 7 pruebas de tooling, lint y 1.054 pruebas de aplicación aprobadas, 2 omitidas. Build y TypeScript locales aprobados; el último ajuste de copy de denegación tiene lint y build final separados.
- Componentes reales con Privy, identidad, transporte y contenido del chat simulados: 45 combinaciones de pantalla × EN/ES/PT × 320/390/768/1024/1440 px, un H1, texto mínimo 14 px y sin desbordamiento horizontal. Ocho casos de avisos a 320/1440 px pasan con controles de al menos 44 px.
- Contraste de paleta: acción primaria 11,74:1, texto secundario 6,01:1, advertencia 7,89:1 y error 6,77:1. La verificación no afirma una auditoría WCAG completa.
- OAuth conserva una inspección y decisión al cambiar idioma; denegación, callback, error de inspección y cambio de identidad durante token/aprobación pendientes comprobados con respuestas sintéticas.
- Build Next real sin DB ni credenciales de ingreso: ingreso/agente muestran indisponibilidad y OAuth carga sin SDK configurado. Se comprobaron las tres páginas a 390/1440 px y reflujo 720 × 450, con Inter local y metadatos ingleses. Salto al contenido y siguiente Tab con foco de 3 px comprobados.

El navegador interno no aplicó el atajo de zoom nativo: ancho y DPR permanecieron iguales. Reflujo equivalente al 200 % aprobado; zoom nativo y dispositivos físicos siguen pendientes. La revisión aislada no certifica nuevo OAuth hospedado, preparación productiva ni aceptación de proveedores. No utiliza base productiva, credenciales, correos ni consultas privadas.

La actualización Graphify es AST, sin API/LLM. Se mantiene la limitación existente de extracción SQL por ausencia de `tree_sitter_sql`. La advertencia de múltiples lockfiles del worktree no impide el build ni requiere modificar la configuración productiva.

Catálogo, laboratorio, administración, Claude y rediseño completo del chat quedan para otra fase. Cualquier publicación requiere una decisión posterior conforme al control de costes de Vercel.
