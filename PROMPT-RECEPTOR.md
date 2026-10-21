# Instrucciones para el agente de la notebook: Carmelita / tempo-qa

Continúa únicamente este proyecto desde `codex/migracion-tempo-qa-saneada-20261021-b61e42` en `https://github.com/CaBsCrypto/carmelita.git`. La fuente fue `refs/heads/codex/tempo-qa` en `efc9d2a11688b4d2e96bdf08217a08e998b7a109`. Revisa `README-MIGRACION.md`, `MIGRACION-SANEAMIENTO.json`, el manifiesto y el resumen final del emisor. Comprueba allí si esta rama se publicó y cuál es su SHA final; no inventes ese hash ni uses otra rama por conveniencia.

## Recuperar sin sobrescribir trabajo

Usa una carpeta nueva permitida. Si ya existe un clon, comprueba primero sus cambios, índice, remotos, ramas y permisos: no ejecutar reset, clean, stash ni checkout que pueda sobrescribir trabajo. No necesitas que la PC original siga encendida para clonar GitHub.

Estos comandos recuperan la rama exacta **sin checkout** y sólo leen su metadata/documentación:

```text
git clone --no-checkout --branch codex/migracion-tempo-qa-saneada-20261021-b61e42 --single-branch https://github.com/CaBsCrypto/carmelita.git carmelita-migracion-tempo-qa-saneada-20261021-b61e42
cd carmelita-migracion-tempo-qa-saneada-20261021-b61e42
git rev-parse HEAD
git show HEAD:README-MIGRACION.md
git show HEAD:PROMPT-RECEPTOR.md
git show HEAD:MIGRACION-SANEAMIENTO.json
git show HEAD:MANIFIESTO-MIGRACION.json
```

El SHA de HEAD debe coincidir exactamente con el resumen final. `--single-branch` no recupera automáticamente las otras ramas de migración ni main. Audita primero configuración Git, hooks, templates, atributos y filtros; evita ejecución automática no revisada y no eludas un hook obligatorio. Revisa rutas, lista completa y hashes de los blobs antes de materializar el árbol. Tras comprobar que el checkout no invoca filtros/hooks no autorizados, se puede usar:

```text
git -c core.autocrlf=false checkout --no-recurse-submodules codex/migracion-tempo-qa-saneada-20261021-b61e42
```

Revisa antes de ejecutar `MIGRACION-VERIFICAR.py`; después, `python MIGRACION-VERIFICAR.py --ref HEAD` comprueba los blobs y `python MIGRACION-VERIFICAR.py --ref HEAD --working-tree` compara además los archivos materializados. Usar una copia revisada del verificador no autoriza ejecutar la aplicación. No traer objetos LFS/submódulos inesperados sin revisar acceso, costes y autorización.

## Preparar un entorno de prueba autorizado

Iniciar sesión con la misma cuenta no instala herramientas ni configura Neon, Privy, Stytch, callbacks, datos o claves. La instalación de herramientas/dependencias, ejecución, configuración de secretos y restauración de datos requieren la autorización correspondiente en la notebook. No confundir el permiso para publicar la migración con permiso para operar servicios.

Lee pins y scripts de esta rama. La raíz activa fija Node 24.14.0 y npm 11.6.1; el subproyecto de video tiene requisitos propios. No actualizar paquetes por iniciativa ni copiar node_modules o binarios nativos de otra arquitectura. Crear `.env.local` sólo en destino, usando los nombres de `.env.example` y valores recuperados por un canal seguro; no pegarlos en chat ni GitHub. Elegir una base aislada y datos sintéticos. Para datos ya cifrados se necesita la **misma CONNECTOR_ENCRYPTION_KEY**; no regenerar claves o resetear bases para arrancar.

Desde la raíz de la aplicación, después de revisar scripts y obtener autorización:

| Comando | Efecto |
| --- | --- |
| `npm ci --no-audit --no-fund` | Descarga/instala el lockfile; puede ejecutar lifecycle de dependencias. |
| `npm run lint` | Ejecuta ESLint. |
| `npm test` | Ejecuta `tsx --test tests/*.test.ts`; no incluye helpers SQL `.mts`. |
| `npm run build` | Ejecuta Next y genera `.next`; revisar variables/servicios que el build pueda consultar. |
| `npm run dev` | Inicia el servidor local, normalmente en puerto 3000. |
| `npm start` | Inicia el servidor del build ya generado; requiere revisar el puerto y configuración. |

Los snapshots pueden diferir: manda el `package.json` de la rama elegida. `qa:local` agrupa lint/test/build; `qa` añade comprobaciones remotas de producción. `runtime:doctor` consulta Fuji. Los scripts de aceptación, gateway, backfills y wallets pueden crear datos o realizar operaciones externas; no son pruebas de arranque genéricas. No ejecutar `db:migrate`, migraciones de producción, cron ni scripts financieros automáticamente. La extensión del navegador necesita revisión, instalación/consentimiento y un perfil autorizado; comprobar su expectativa de localhost:3000 frente a los scripts que usen 3001.

## Alcance específico

Esta rama conserva exclusivamente el tema «tempo-qa». Revisar los README y scripts específicos incluidos antes de continuar. No asumir compatibilidad con los cambios actuales de wallet preparation ni combinarla con otros snapshots. Las historias de personal apps, backend, contratos, wallet, diagnóstico, routing y QA siguen siendo trabajos independientes.

`personal-apps-bazaar` y wallet preparation contienen migraciones diferentes numeradas 0022. Cualquier integración futura necesita reconciliar la secuencia de Drizzle y revisar esquema/datos; no aplicar ambas automáticamente. Los resultados operativos antiguos no acreditan la aceptación del código actual.

## Checklist de validación

- [ ] SHA exacto, lista de rutas, manifiesto y contenido recibido comprobados; registrar la plataforma y comandos realmente ejecutados.
- [ ] Runtimes, permisos, variables, claves y servicios de prueba disponibles; no depender de perfiles o rutas personales de la PC original.
- [ ] Con autorización, completar instalación, lint, pruebas pertinentes, build local y arranque. Un fallo o un paso no ejecutado se informa como tal.
- [ ] Identificar el comportamiento concreto del tema a partir de su diff y sus documentos; seleccionar una prueba significativa con datos sintéticos.
- [ ] Comprobar éxito, error y aislamiento de identidad cuando el tema gestione datos de usuario; distinguir mocks de acceso real autorizado.
- [ ] Revisar migraciones, contratos y efectos externos antes de invocar scripts. No usar resultados de QA históricos como evidencia de este SHA.
- [ ] Para la aplicación, completar un flujo útil: autenticación de prueba autorizada, petición/respuesta o error controlado, recarga y persistencia aislada si se autoriza. Abrir una ventana por sí solo no basta.
- [ ] Repetir el flujo representativo con la PC ORIGINAL APAGADA o desconectada, manteniendo Internet para los servicios remotos necesarios. Comprobar que no depende de túneles, shares, VPN, archivos o procesos exclusivos de esa PC.
- [ ] Informar qué quedó verificado, qué usó mocks, qué requiere aceptación humana y qué continúa pendiente. No declarar la migración probada hasta ejecutar el flujo en esta notebook.

## Continuar desde esta rama

Para trabajo nuevo, una vez autorizado, crear una rama de continuación basada en la migración y mantener clara su procedencia. Por ejemplo, tras elegir un nombre único:

```text
git switch -c codex/continuacion-tempo-qa
```

Los commits y pushes posteriores requieren el alcance autorizado correspondiente. No mezclar snapshots sólo para reunirlos. La tabla de README identifica las otras ramas previstas y el resumen del emisor confirma cuáles existen con su SHA. Para recuperar una rama adicional, usar su nombre exacto:

```text
git fetch origin refs/heads/NOMBRE_EXACTO:refs/remotes/origin/NOMBRE_EXACTO
```

Ese ejemplo contiene un placeholder deliberado; no ejecutarlo sin sustituirlo por la rama elegida y revisada.

## Revisar la relación con main y el futuro PR

Una rama no se conecta a main mediante login: comparte historia cuando tiene un ancestro común. La rama predeterminada comprobada era `main`; volver a verificarla antes de integrar, sin renombrar nada. En el clon de una sola rama, traer main explícitamente:

```text
git fetch origin refs/heads/main:refs/remotes/origin/main
git merge-base HEAD origin/main
git diff --stat origin/main...HEAD
```

Fetch recupera referencias sin mezclar archivos. Un merge sí puede cambiar archivos y producir conflictos. El origen activo estaba 99 commits detrás del main comprobado; revisar las diferencias reales antes de proponer integración. Atención a las migraciones 0022 distintas de personal-apps-bazaar y wallet preparation: requieren reconciliación, no ejecución consecutiva automática.

El futuro PR tendría base `main` y compare en la migración o continuación elegida. Revisar antes diferencias completas, conflictos, checks y efectos de CI/hosting. **No crear PR sin autorización separada**; si se autoriza sin otra indicación, crearlo como borrador. No hacer push directo a main, force-push, auto-merge, merge ni deploy. Abrir un PR puede iniciar CI e integrar a main puede iniciar builds/publicación; los controles de coste de Vercel y las Previews desactivadas deben mantenerse. Un preview requiere autorización independiente y no sustituye la validación local.

Conservar la PC original, las ramas originales y el stash hasta confirmación humana. Separar siempre publicación (VERIFICADA/FALLÓ/NO REALIZADA) de continuación (READY/BLOCKED/NOT VERIFIED). Esta entrega queda BLOCKED por accesos/configuración y validación de destino pendientes; READY por sí solo nunca significa probado en la notebook.
