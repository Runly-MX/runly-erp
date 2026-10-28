# Runly: certificacion integrada y Release Candidate (local)

La preparacion del ensayo (estado: no ejecutado, que falta) esta en la seccion B. El dictamen vigente del candidato esta en la seccion A (SHA de producto `40e1b6b0a6d6`, Installer `2026.10.28.6`).
La seccion 0 documenta el candidato intermedio `44e09bb7f71d` y las secciones 1 a 13 la certificacion
previa sobre `330e4a712`; se conservan por trazabilidad.

Fecha: 2026-10-28. Alcance: exclusivamente local (Docker y Supabase desechables).
No se uso SSH, VPS, credenciales de produccion, publicacion de imagenes ni
`update-local.sh` / `update-external.sh`. No se publico ni desplego nada.

Este documento certifica la integracion, no introduce funcionalidades. Las unicas
modificaciones de codigo de esta pasada son correcciones de fixtures de prueba
(seccion 2).

## B. Preparacion del ensayo sobre copia restaurada (2026-10-28)

**Estado: ensayo NO ejecutado.** No existe copia restaurada ni respaldo de la instalacion
real en el equipo (se comprobo: ni contenedores, ni volumenes, ni volcados del Runly real;
solo stacks de otros proyectos y los desechables de prueba). No se ha sustituido el ensayo
por datos sinteticos. Plan completo en `EXTERNAL_UPDATE_REHEARSAL_PLAN.md`.

### B.1 Candidato congelado y divergencia con `main`

- Certificado: SHA de producto `40e1b6b0a6d6dd0fc03a724163c8be56b034179d`, Installer
  `2026.10.28.6`, contrato `studio-realtime-1`. Commits certificados de esta fase:
  `ccbfe9f31` (enlace profundo), `44e09bb7f` (gate antes de migrar) y `40e1b6b0a`
  (arnes). Imagenes y digests en A.2; presentes en Docker con los mismos digests.
- `main` (= `origin/main` mas cinco commits locales) contiene **57 archivos de producto
  distintos** del SHA certificado (46 en `apps/api/src`, 5 en `packages/ui`, 3 en
  `apps/desktop`, SDK y contratos de Studio): trabajo de otra sesion sin certificar. **`infra/`
  y `prisma/` son identicos al SHA certificado**, de modo que el Installer `.6` y el historial
  de migraciones no cambian. No se usa nada de lo posterior en el ensayo.
- Los scripts `update-external.sh`/`update-local.sh` descargan el Installer de `main` y las
  imagenes que indique `.env.external`; el plan los sustituye por el Installer extraido del
  SHA certificado con `--skip-pull` e imagenes locales fijadas por etiqueta y digest.

### B.2 Herramientas para el ensayo (validadas solo contra la replica desechable)

| Herramienta | Funcion |
|---|---|
| `scripts/rehearsal/replica-guard.mjs` | revisa el `.env` de la replica y senala por **nombre** (nunca valor) cualquier ajuste que apunte fuera de ella o lleve una credencial real; `--print-overrides` da los valores neutralizantes |
| `scripts/rehearsal/replica-inventory.mjs collect/compare` | inventario de solo lectura: migraciones, todas las tablas (filas y hash del contenido), modulos, buckets, **SHA-256 de cada objeto de Storage**, guard y politica de Notes, resumen semantico de permisos/membresias/identidades y tablas con alcance externo; rechaza hosts que no sean loopback o privados |
| `external-affected-replica-rehearsal` (E2E) | ejecuta esas herramientas contra la replica sintetica y comprueba que, tras la actualizacion, solo cambian las tablas esperadas |

Resultado en la replica sintetica: el inventario tras la actualizacion difiere unicamente en
las tablas que una actualizacion escribe de forma legitima (`audit_log`, `blueprint`,
`module_migration`, `note_image_binding`, `note_image_storage_state`,
`realtime_authorization_revision`, `role`, `role_permission`, `runly_field`, `runly_model`,
`runly_module` y las tablas nuevas `inventory_*`), en las migraciones anadidas, en la
proteccion de Notes y en los buckets. `role` y `role_permission` cambian el hash de fila
(marcas de tiempo del seed) pero **no** sus resumenes semanticos (permisos concedidos,
membresias, identidades), que son identicos. Ningun objeto de Storage ni tabla de negocio
cambia.

### B.3 Lo que falta para ejecutar el ensayo

1. Un respaldo completo de la base (esquemas `public`, `storage`, `auth`) y de los objetos de
   Storage, y el inventario de produccion del mismo momento, entregados con autorizacion
   separada (no se pidieron ni se usan).
2. Una maquina o red de ensayo sin ruta de salida (criterio de aceptacion con un `fetch` que
   debe fallar; no se puede comprobar en este equipo de desarrollo sin una red dedicada).
3. La decision del responsable sobre que datos de la copia se neutralizan (tokens push,
   credenciales SMTP/OAuth, webhooks, conexiones de modulo) antes de arrancar el Worker.
4. Credencial de prueba de propietario de Storage de la replica.

**Dictamen de esta fase**: el candidato y las herramientas estan preparados; el ensayo
**no** puede iniciarse hasta cumplir B.3. Esto no es un GO ni un NO GO para una
actualizacion real: esa decision depende del resultado del ensayo.

## A. Cierre final: SHA de producto `40e1b6b0a6d6dd0fc03a724163c8be56b034179d`

Actualizacion del 2026-10-28. Local; sin SSH, sin actualizaciones reales, sin publicacion
Docker, sin acceso a bases ni a Storage reales, sin tocar archivos de otras sesiones. **Esta
seccion sustituye a las secciones 0 y 12 como dictamen vigente.** La seccion 0 (SHA
`44e09bb7f`) documenta el candidato intermedio y las secciones 1 a 13 la certificacion
previa sobre `330e4a712`.

### A.1 Notes movil: causa, correccion y repeticion

**Era un defecto del producto, enmascarado por el arnes.** `ModuleOutlet` redirige la raiz
de un modulo (`/app/m/<modulo>/`) a su primera pantalla con `navigate(destino, { replace })`
**sin la query string ni el hash**. Un enlace profundo como
`/app/m/runly.notes/?note=<id>` perdia `?note=` y abria la lista en lugar de la nota. La
otra redireccion del mismo archivo (alias de modulo) si conserva `search` y `hash`.

Evidencia de la causa (captura de fallo del fixture, dos fallos independientes): la
cronologia solo contenia `goto done`, ninguna pulsacion, y la pagina terminaba en
`/app/m/runly.notes/notes` sin `?note=` con la lista de notas visible. El fixture tenia un
respaldo que pulsaba una tarjeta por su titulo; funcionaba o no segun el titulo que la
nota tuviera en ese momento (las pruebas previas la renombraban al pegar contenido). Por
eso parecia intermitente (2 de 6 fallos con el SHA final anterior, 1 de 3 con el previo),
cuando en realidad el enlace profundo nunca funcionaba. No se amplio ningun timeout ni se
anadio ningun reintento.

Correccion (`ccbfe9f31`): `moduleRootRedirect` (nueva funcion pura en `apps/desktop/src/app/`)
calcula el destino conservando `search` y `hash` y fusionando con la query propia del item de
navegacion. Prueba de regresion unitaria (4 casos). Los fixtures dejan de enmascarar el
defecto: se elimino el respaldo de pulsacion en `notes-images-ui.mjs` y el clic sobre la
tarjeta en `realtime-2/ui.mjs` (solo funcionaba mientras `?note=` se perdia).

Repeticion con un verificador dedicado (`scripts/verify-notes-mobile-deeplink.mjs`: contexto
tactil nuevo, inicio de sesion, enlace profundo, el editor debe aparecer sin pulsar nada y
la URL conserva `?note=`), sobre worktrees limpios:

| Build | Resultado |
|---|---|
| Antes de la correccion (`ba30e4fad`, worktree limpio) | **0 de 20**; las 20 terminan en `/notes` sin `?note=` |
| Despues (`ccbfe9f31`, worktree limpio) | **20 de 20** |
| SHA final (`40e1b6b0a`, worktree limpio) | **20 de 20** |
| Notes con actualizacion y UI completa, SHA final, sin respaldo | 3 de 3; instalacion nueva: pasa |
| Notes realtime + seguridad, SHA final (+1 linea de fixture) | 3 de 3, `releaseBlockers: []` |

Efecto en el producto: cualquier enlace de modulo con query en la raiz (notificaciones,
enlaces compartidos, MirAI) abria la lista. Es un cambio de solo frontend (la imagen Web).

### A.2 Candidato limpio y compatibilidad

- **SHA de producto certificado**: `40e1b6b0a6d6dd0fc03a724163c8be56b034179d` (arbol
  `0d1ed288b9322a96ec51d2b254aa047401290c50`). Las imagenes salen de `git archive` de ese
  commit y toda la validacion se ejecuto desde un worktree limpio (`git status` vacio, arbol
  identico) con los `node_modules` enlazados. La unica excepcion: el paso de Notes realtime
  con UI se ejecuto en un segundo worktree limpio de `40e1b6b0a` con un unico archivo de
  fixture del commit `7fcd10c8c` (una linea).
- Lo que ya no es el mismo codigo: **`origin/main` esta en `8f00ba0da`** y contiene mis
  commits hasta `40e1b6b0a` (el Installer `.6` esta publicado en `main`) **mas un commit
  de Studio de otra sesion** (51 archivos, +2.888 lineas en `apps/`, `packages/` y
  `prisma/`; sin cambios en `infra/`) que **no** esta certificado. HEAD local esta 4
  commits por delante de `origin/main` (tres de otra sesion y uno mio de fixtures).

| Imagen | Tag local | Digest (id) |
|---|---|---|
| API | `runly-notifications:api-40e1b6b0a6d6` | `sha256:42101cf2c44162522a4dd1c83b4b0ad96df9c8ceb589b8f3388415a28247766a` |
| Worker | `runly-notifications:worker-40e1b6b0a6d6` | `sha256:d08b38102dad335fe02d7256840de4ab10941fc7ee51be3b6d7adf7e90dc3537` |
| Web | `runly-notifications:web-40e1b6b0a6d6` | `sha256:8c86ce4e8a995c3246826afb4fbe8756d66f45dc5f92aa64f69c212506a08ee0` |

- Installer `2026.10.28.6`; `generate-installer-release.mjs --check` pasa; contrato
  `studio-realtime-1` presente en las tres imagenes. Los hashes anteriores (`330e4a712` y
  `44e09bb7f`) no se reutilizan: la imagen Web cambia con la correccion y estas son
  imagenes nuevas.
- Compatibilidad: Installer `.6` + imagenes del mismo SHA o posterior a `ccbfe9f31`. Una API
  anterior con la Web nueva (o al reves) funciona: la correccion solo toca el frontend. Un
  Installer `.5` con cualquier imagen sigue teniendo el orden defectuoso del gate.
- **Para publicar imagenes certificadas hay que construirlas del commit
  `40e1b6b0a`, no del `HEAD` actual de `main`**, que incluye codigo de Studio sin
  certificar. Si se quiere publicar `HEAD`, hay que volver a certificarlo.

### A.3 Scripts de actualizacion

Documento detallado: `INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`. Ocho escenas
(`update-script-*`) sobre un origen de distribucion controlado (el Installer `.5` leido de
Git esta instalado; el origen sirve el `.6`): todas PASS.

| Escena | Resultado |
|---|---|
| `update-external.sh` completo (refresco `.5` a `.6`, gate, migraciones, contenedores, `/health`, lecturas anonimas denegadas) | PASS |
| Storage no preparado tras el refresco | PASS: scripts actualizados, esquema y datos sin tocar |
| Refresco interrumpido: fallo de red, archivo corrupto, bootstrap inalcanzable | PASS: el Installer instalado queda igual; la repeticion termina bien |
| Recreacion de contenedores interrumpida (despues de migrar) | PASS: las migraciones **permanecen aplicadas** (sin rollback); la repeticion converge sin repetirlas |
| Migracion fallida | PASS: queda sin terminar en `_prisma_migrations`, no se revierte sola; el Installer se niega a seguir (`STUDIO_FAILURE_REQUIRES_REVIEW`) aunque se corrija la causa; tras `migrate resolve --rolled-back` converge |
| `update-local.sh` | PASS |

Las tres clases de interrupcion (refresco, migracion, recreacion de contenedores) son
distintas y se tratan por separado en el documento. No se asume rollback automatico de una
migracion Prisma. Durante la puesta a punto del arnes, un `PATH` mal construido dejo que
`curl` hiciera dos lecturas publicas de solo lectura a GitHub (sin credenciales ni
escrituras); esta corregido y verificado.

### A.4 Ensayo de la external afectada (replica sintetica)

`external-affected-replica-rehearsal`: una **replica desechable** construida como la dejo
el Installer `.5`: migraciones y seed aplicados con `pnpm db:migrate` y `db:seed`, sin
preparar Storage, buckets `runly-notes` y `atlas-notes` publicos, sin guard ni politica,
usuarios y permisos del seed, una nota, y cuatro objetos historicos (dos PNG, un PDF y un
PNG en `atlas-notes`). Resultado (PASS):

1. **Sin credencial de propietario**: se detiene antes de migrar o sembrar. El estado
   completo de la replica es identico antes y despues (historial de migraciones, usuarios,
   permisos, notas, hash SHA-256 de cada objeto, buckets) y no hay contenedores.
2. **Con credencial temporal** (solo en el entorno del proceso): prepara, cierra ambos
   buckets, actualiza. La conexion no aparece en la salida, ni en `.env.external`, ni en el
   entorno del contenedor de la API; los valores existentes de `.env.external` se
   conservan. Historial de Prisma, usuarios, permisos, notas y los bytes de cada objeto
   quedan iguales.
3. **Peticiones anonimas reales** a cada objeto (URL publica, objeto, autenticada y
   render) y al listado de ambos buckets: ninguna devuelve 200 y los listados estan vacios.
4. **Repeticion**: segundo update con la misma credencial; sin cambios.

**Pendiente (no inventado)**: el ensayo sobre una **copia restaurada de la instancia real**
no se ha hecho; no hay respaldo restaurado disponible para esta sesion. La replica es
sintetica y no demuestra nada sobre datos, volumen ni configuracion reales.

### A.5 Regresiones y compuertas con el SHA final

| Area | Resultado |
|---|---|
| Installer E2E (diez originales + ocho de scripts + replica) | **19 de 19** |
| Studio E2E + seguridad | PASS: cursor 117 ms, revocacion 19,9 s, reconexion 5,8 s, 0 `live`, socket crudo sin reentrar |
| Studio benchmark (30 s) | 0 `live`/min, 0 escrituras; p95 de 14,7 a 50,9 ms |
| Aislamiento entre empresas | 14 de 14 |
| Canvas, CPU total 1/5/10 | 1,31 / 28,38 / 53,12 s |
| Notes, CPU total 1/5/10 | 8,69 / 35,55 / 69,03 s |
| Chat (`chat-ui`), CPU total 1/5/10 | 9,67 / 49,14 / 149,35 s (otras corridas: 9,41 / 47,60 / 125,77; certificado: 14,28 / 102,13 / 208,30) |
| Errores HTTP en esas corridas | 0 |
| Notificaciones, p95 de aparicion 1/5/10 | 69 / 166 / 315 ms; 0 perdidos, 0 duplicados, seguridad 0 fallos |
| Notificaciones, rafaga de 100 a 10 usuarios | API 8,0 s, PG 14,7 s, Realtime 4,1 s; ultimo aviso visible a 10,0 s |
| `pnpm lint` (worktree limpio) | exit 0 |
| `build:web` (worktree limpio) | exit 0 |
| `test:mcp` | 189 de 208; 17 fallos heredados (`parent_note_id`) |

Variacion: Chat con 10 usuarios cuesta mas que en la corrida anterior (149 frente a 126 s)
y sigue por debajo del valor certificado; el CPU de PostgreSQL en la rafaga varia de 14,1 a
23,8 s entre corridas de la misma maquina. Se registra como variacion entre corridas, no
como cambio atribuible al codigo (que no cambio entre ellas).

**Suite Node en el worktree limpio**: 5.692 pruebas: 5.665 PASS, 12 FAIL, 15 SKIP (suman
5.692). Las 12 son las 11 heredadas (nueve archivos, identicas a la linea base `133a8972`:
Contacts (2), transcripcion, configuracion publica del sitio, `module-runtime-routes` (2),
catalogo de runtime, snapshot del devkit, `runly-env-config`, `docker-shared-sources`,
portapapeles de ProseMirror) mas una nueva: `storefront-sdk/react-exports`, que importa
`packages/storefront-sdk/dist/react/index.js`, una **salida de build ignorada por Git**
que no existe en un checkout limpio. No es una regresion: es una dependencia oculta de la
suite respecto a un build previo (y explica las 9 pruebas menos respecto a la corrida del
arbol de trabajo, 5.701). Los dos fallos heredados de Contacts siguen contabilizados.

### A.6 No ejecutado y limitaciones

- Ensayo sobre una copia restaurada de la instancia real (pendiente, sin respaldo).
- `update-external.sh` / `update-local.sh` contra GitHub real o sobre una instalacion real;
  Linux/macOS; `update-local.sh` con Supabase CLI.
- Interrupcion del proceso a mitad de una migracion (matar el contenedor): se simulo por
  conflicto de esquema y por fallo del `compose up`.
- Push/FCM y Tauri reales; PWA movil; DND de extremo a extremo; cambio de empresa en vivo;
  inbox E2E; plantillas, guardado y exportacion de Studio en navegador; Chat con adjuntos,
  invitados y llamadas en navegador.
- Memoria y fugas de conexiones; CPU y memoria del Worker; 20 usuarios con 1.000
  notificaciones; `test:mcp` en el baseline.
- **Supabase Cloud y proveedores gestionados**: no se probaron. Sin acceso de propietario
  al esquema `storage` la preparacion es imposible (NO GO).
- Dependencia oculta de la suite respecto a `dist` de `storefront-sdk` (A.5).

### A.7 Dictamen, separado

**1. ¿Esta Runly lista para ensayar la actualizacion de una instalacion existente con
datos restaurados? SI (GO para iniciar el ensayo en una copia restaurada).** Condiciones:

1. Usar el Installer `2026.10.28.6` ya presente en `main` (`origin/main` lo contiene) con
   imagenes construidas **del commit `40e1b6b0a`** (o de un SHA posterior que se haya
   vuelto a certificar). Las imagenes locales de esta entrega sirven para un ensayo local
   sin registro (`RUNLY_*_LOCAL_IMAGE`), como hace la E2E.
2. Copia de seguridad previa y copia restaurada sin ningun acceso a la instancia real
   (base y almacenamiento de objetos).
3. Credencial de propietario temporal segun `EXTERNAL_NOTES_STORAGE_RECOVERY.md`
   (`read -rs`, solo en el entorno del proceso, `unset` al terminar), y repetir el ensayo
   **sin** ella para confirmar que se detiene antes de tocar el esquema.
4. Que el ensayo mida lo no medido (A.6) y registre el resultado con hashes de objetos,
   historial de migraciones y peticiones anonimas, como en la replica.

**2. ¿Que condiciones siguen faltando para publicar y actualizar instalaciones reales?**
(Esto **no** esta autorizado; requiere la autorizacion explicita del responsable.)

1. Resolver la **divergencia entre lo certificado y `main`**: `main` contiene un commit de
   Studio sin certificar (`8f00ba0da`) y otros tres posteriores. Decidir si se publica
   `40e1b6b0a` o se certifica el `HEAD`.
2. Construir y publicar las imagenes con `pnpm docker:release` desde ese SHA (no se hizo
   aqui) y comprobar su contrato `studio-realtime-1` y los hashes.
3. Completar el ensayo sobre la copia restaurada real y obtener su resultado.
4. Confirmar que la instalacion real tiene la credencial de propietario (o el SQL
   aplicado por el administrador); sin ella el Installer se detiene por diseno.
5. Plan de rollback aceptado: no reabrir el bucket; las migraciones Prisma no se revierten;
   una migracion fallida requiere resolucion manual documentada.
6. Comunicar que las imagenes descargadas mientras el bucket era publico no se pueden
   retirar.
7. Riesgos residuales aceptados: coste de CPU en rafagas (R1), 11 pruebas Node y 17 de MCP
   heredadas, dependencia de la suite respecto a `dist`, memoria/Worker/20 usuarios sin
   medir, `update-*.sh` no ejecutados contra la distribucion real.
8. Proveedores gestionados sin acceso al esquema `storage`: NO GO.

| Modalidad | Modulo (nivel 1) | Instalacion local (nivel 2) | Ensayo en copia restaurada (nivel 3) | Despliegue real (nivel 4) |
|---|---|---|---|---|
| Local nueva / existente | GO | GO | Preparado | No autorizado |
| External con credencial de propietario | GO | GO | Preparado | No autorizado |
| External sin credencial, Storage ya preparado | GO | GO | Preparado | No autorizado |
| **External afectada (migrada, sin guard) con credencial temporal** | GO | GO (replica) | **GO para iniciar el ensayo** | No autorizado |
| External sin credencial y sin preparar | NO GO (se detiene antes de tocar nada) | NO GO | No aplica | No autorizado |
| Proveedor sin acceso a `storage` (p. ej. Supabase Cloud) | NO GO | NO GO | No aplica | No autorizado |

---

## Anexo: candidato intermedio `44e09bb7f` y certificacion previa

## 0. Release Candidate intermedio: SHA `44e09bb7f71d46f02517db7af0c91fd25ea447c0`

Actualizacion del 2026-10-28, posterior a la certificacion de `330e4a712` (secciones 1 a
13, conservadas abajo por trazabilidad). Local, sin SSH, sin actualizaciones reales, sin
publicacion Docker, sin acceso a instancias existentes. (Sustituida por la seccion A.)

### 0.1 Estado del repositorio

- HEAD local: `44e09bb7f` (rama `main`). `origin/main` esta en `330e4a712`
  (`git fetch` de solo lectura): el local esta **3 commits por delante y 0 por detras**.
  No hay nada ajeno en el remoto. Los tres commits no publicados son
  `bf16ccd1e` (fixtures de prueba), `6a014228c` (informe) y `44e09bb7f` (orden del
  preflight, Installer `2026.10.28.6`).
- **Arbol no limpio**: `apps/desktop/src/modules/runly.studio/components/StudioResources.jsx`
  tiene una edicion sin commit de otra sesion (se anade `ToolButton` al import desde
  `@runly/ui`). No es de esta tarea, no se descarto ni se incorporo. El SHA se fija
  por commit y las imagenes se construyen con `git archive`, por lo que esa edicion
  **no** esta en ellas. Las pruebas que construyen el frontend desde el arbol de
  trabajo (UI de Notes/Canvas) si la incluyeron; es un cambio de una linea en una
  pantalla de Studio que esas pruebas no abren.
- Pendiente de commit en esta entrega: `scripts/verify-notes-installer-e2e.mjs`
  (E2E ampliada), `docs/deployment/EXTERNAL_NOTES_STORAGE_RECOVERY.md` y este informe.
  Son pruebas y documentacion, sin codigo de producto.

### 0.2 Imagenes, Installer y contratos

Construidas con `scripts/build-local-api-image.mjs --ref=44e09bb7f71d46f02517db7af0c91fd25ea447c0`.

| Imagen | Tag local | Digest (id) |
|---|---|---|
| API | `runly-notifications:api-44e09bb7f71d` | `sha256:e9d93230881148dbe13b21514a229a358dcb0eb82fcb3eaef7e92a9afb14ecfb` |
| Worker | `runly-notifications:worker-44e09bb7f71d` | `sha256:73ac7f8805a1c61af812e701d97b80e5ccde586c5733173fa7904afe5d251951` |
| Web | `runly-notifications:web-44e09bb7f71d` | `sha256:e103de8d3d539c2170cdfb686b9873cd5ee943d37a4776555831b140149287cf` |

- Installer `2026.10.28.6`; `node scripts/generate-installer-release.mjs --check` pasa.
- Contrato `io.runly.installer.contract=studio-realtime-1` presente de forma nativa en
  las tres imagenes e igual a `INSTALLER_CONTRACT`.
- Las imagenes incluyen `notes-storage-preflight.mjs`,
  `prepare-notes-storage-owner.sql` y migraciones hasta
  `20261211000000_studio_retired_asset_lineage`.
- Los alias `runly-studio:rc-…`, `runly-notes-private:rc-…` y `…:api-…` apuntan a la
  misma imagen API (mismo id); los scripts validan el nombre del repositorio.
- Las imagenes del SHA `330e4a712` quedan obsoletas para el ensayo: el par Installer
  mas imagenes debe ser del mismo SHA.

### 0.3 Installer: 10 de 10 E2E con las imagenes finales

`scripts/verify-notes-installer-e2e.mjs` (bases y Supabase desechables):

| Caso | Resultado |
|---|---|
| local-existing-upgrade, local-fresh | PASS |
| external-owner-available, external-no-owner-prepared | PASS |
| external-no-owner-unprepared, external-bad-owner-credential, external-partial-preparation | PASS; esquema, historial de migraciones y filas del seed identicos antes y despues del fallo |
| external-regression-to-unsafe | PASS: **base ya migrada (con `20261028011349_notes_private_images` y `20261211000000_studio_retired_asset_lineage`) y Storage sin guard** |
| external-skip-migrate-unprepared (`--skip-migrate`), external-up-only-unprepared (`--up-only`) | PASS |

Ante falta de permisos (sin propietario, credencial incorrecta, preparacion parcial,
guard ausente) el installer se detiene antes de cualquier migracion o seed. Evidencia:
(1) instantanea del esquema (migraciones aplicadas, catalogo de columnas, filas del seed)
igual antes y despues; (2) en la base ya migrada, el contenedor de la API en
ejecucion conserva identificador, imagen y `StartedAt` tras el intento fallido (no se
reemplaza ni reinicia); (3) el estado de Storage, el numero de notas y los objetos no
cambian; (4) la credencial no aparece en la salida ni en el entorno del contenedor de la
API. Control negativo: con el orden anterior la prueba falla.

Recuperacion de la base migrada con guard ausente, ejecutada con el script de estado
**tal como esta en el runbook** (la E2E extrae el bloque del documento): el historial de
Prisma se conserva, `notes` y todos los objetos de Storage quedan iguales, el guard y la
politica se restauran (`1/1`), el bucket vuelve a privado, la nota conserva su
contenido y una segunda recuperacion es idempotente.

### 0.4 Procedimiento de recuperacion de la external afectada

`docs/deployment/EXTERNAL_NOTES_STORAGE_RECOVERY.md`: estado de la instancia, copia de
seguridad previa, script de estado de solo lectura (antes y despues), preparacion
temporal del propietario (`read -rs`, variable solo en el entorno del proceso, nunca en
argumentos ni en `.env.external`, pasada por nombre al contenedor de un solo uso con
`--rm`, `unset` al terminar, alternativa con el SQL aplicado por el administrador),
recuperacion, verificacion y tabla de fallos. **No reabrir el bucket** en ningun
caso.

**Condicion critica**: `update-external.sh` descarga el installer desde `main` en
GitHub. Mientras los tres commits no estan publicados en `origin/main`, ejecutaria el
installer `.5` (con el orden defectuoso). Antes del ensayo hay que publicar los
commits (lo decide quien publica; no se hizo) o usar el installer de este arbol
directamente (`node setup-external.mjs` desde `infra/installer`).

### 0.5 Regresiones criticas con el SHA final

| Area | Resultado |
|---|---|
| Notes, instalacion nueva (`verify-notes-private-storage.mjs`) | PASS |
| Notes, con actualizacion y UI (`--upgrade --ui`) | **Intermitente**: 4 PASS y 2 FAIL en 6 ejecuciones del SHA final (fallo: no aparece el editor al abrir la nota con viewport movil, 30 s). Con la imagen anterior `330e4a712049`, en condiciones identicas: 2 PASS y 1 FAIL. Mismo codigo de producto; no es regresion del Installer ni de este SHA. Causa raiz sin aislar |
| Notes realtime + seguridad (Tiptap, awareness, imagenes privadas, revocacion) | PASS, `releaseBlockers: []`, `privateNoteImagePubliclyReadable: false` |
| Studio E2E + seguridad | PASS: cursor 107 ms, revocacion 20,6 s, reconexion 5,9 s, 0 peticiones `live`, socket crudo sin reentrar tras expirar |
| Studio benchmark (30 s) | 0 `live`/min y 0 escrituras de presencia; p95 de 16,5 a 50,8 ms en todos los escenarios |
| Aislamiento entre empresas contra PostgreSQL | 14 de 14 |
| Canvas, CPU total 1/5/10 usuarios | 1,11 / 26,9 / 49,8 s (certificado: 1,20 / 29,59 / 62,65) |
| Notes, CPU total 1/5/10 | 8,2 / 34,4 / 68,1 s (certificado: 11,24 / 41,81 / 77,18) |
| Chat (`chat-ui`), CPU total 1/5/10 | 9,4 / 47,6 / 125,8 s (certificado, otro modo: 14,28 / 102,13 / 208,30) |
| Errores HTTP en esas corridas | 0 |

Notificaciones (45 s por escenario; 1 / 5 / 10 usuarios):

| Metrica | 1 | 5 | 10 |
|---|---:|---:|---:|
| Nueve avisos, p95 de aparicion | 61 ms | 155 ms | 297 ms |
| Dos pestanas, p95 | 81 ms | 150 ms | 289 ms |
| Caida de Realtime, p95 de recuperacion | 133 ms | 102 ms | 95 ms |
| Reposo, llamadas SQL por ventana | 127 | 648 | 1.557 |
| Rafaga de 100 avisos: CPU API / PG / Realtime | 1,3 / 0,7 / 0,3 s | 3,4 / 4,4 / 1,4 s | 7,8 / 14,1 / 4,1 s |
| Rafaga: ultimo aviso visible (p95) | 1,9 s | 4,6 s | 9,2 s |
| Perdidos / duplicados / fallos de seguridad | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

La rafaga de 10 usuarios varia entre corridas de la misma maquina (PG 14,1 s en esta,
21,1 y 23,8 s en las de `330e4a712`; visible 9,2 s frente a 14,2 y 14,7 s). La
linea base previa (PG 6,7 s, API 3,7 s, visible 27,5 s) sigue siendo mas barata en CPU y
mas lenta en visibilidad: el coste de la entrega inmediata en rafagas (R1) continua.
El CPU de Realtime del escenario de caida es invalido (contador reiniciado).

### 0.6 Pruebas generales con el SHA final

| Gate | Resultado |
|---|---|
| Suite Node (950 archivos, lotes de 80) | 5.701 pruebas: 5.675 PASS, 11 FAIL, 15 SKIP, 0 canceladas (suman 5.701; +1 prueba nueva del orden del gate) |
| Installer (`infra/installer/__tests__`) | 108 de 108 |
| `pnpm lint` | exit 0 |
| `pnpm --filter @runly/desktop build:web` | exit 0 |
| `pnpm test:mcp` | 208 pruebas: 189 PASS, 17 FAIL, 2 SKIP (heredado) |

**Fallos heredados de Node (11, 9 archivos, identicos a la linea base `133a8972`
anterior a este trabajo)**: `contacts-proposal-module` (2, los dos de Contacts),
`call-transcript-analysis-service` (1), `public-website-capture-config` (1),
`module-runtime-routes` (2), `module-runtime-catalog` (1), `installer-devkit-snapshot`
(1), `runly-env-config` (1), `docker-shared-sources` (1),
`prosemirror-clipboard-security` (1). Ninguno es un archivo de esta entrega.

**Fallos heredados de MCP (17)**: `column n.parent_note_id does not exist`; el runner crea
la base con `prisma db push` desde `schema.prisma`, pero esas columnas solo existen en la
migracion `20261117000000_notes_references_and_subpages`. Codigo y runner son anteriores
a este trabajo; no se ejecuto `test:mcp` en el baseline (clasificacion por causa e
historial).

### 0.7 No ejecutado

Push/FCM real y Tauri; PWA movil; DND de extremo a extremo; cambio de empresa en vivo;
inbox E2E en navegador; plantillas, guardado y exportacion de Studio en navegador; Chat
con adjuntos, invitados y senales de llamada en navegador; actualizacion interrumpida a
mitad del proceso (proceso del installer matado); `update-local.sh` /
`update-external.sh` ejecutados directamente; memoria y fugas de conexiones; CPU y
memoria del Worker; 20 usuarios con 1.000 notificaciones; `test:mcp` en el baseline; el
runbook de recuperacion sobre una copia restaurada de la instancia real.

### 0.8 Limitaciones de Supabase Cloud y proveedores gestionados

No se probo. El gate necesita crear una politica RESTRICTIVE sobre `storage.objects` y un
trigger sobre `storage.buckets`, lo que exige ser propietario de ambas tablas. Si el
proveedor no concede ese acceso a ninguna credencial utilizable, la preparacion es
imposible y esa configuracion es NO GO (no hay alternativa que no implique abrir el
bucket, que esta prohibido). Con una credencial que solo lea, `--verify` falla cerrado.

### 0.9 Riesgos residuales actualizados

| Id | Riesgo | Gravedad |
|---|---|---|
| R1 | Coste de CPU en rafagas de avisos (agrupar por destinatario: mejora posterior) | Media |
| R2 | `test:mcp` rojo por incompatibilidad runner/esquema | Media |
| R4 | UI de Notes (movil, abrir la nota desde la lista) intermitente: 2 de 6 en el SHA final y 1 de 3 en el anterior | Baja a media; revisar el fixture antes de usarlo como compuerta |
| R5 | 11 pruebas Node heredadas | Baja |
| R7 | Memoria, conexiones, Worker y 20 usuarios sin medir | Media |
| R9 | `update-external.sh` usa el installer publicado en `main`: con los commits sin publicar aplica el `.5` | **Alta hasta publicar** |
| R10 | Edicion ajena sin commit en `StudioResources.jsx` | Baja (fuera de las imagenes) |

### 0.10 Dictamen vigente

Niveles: (1) GO local del modulo; (2) GO local de la instalacion; (3) preparado para
ensayo en copia restaurada; (4) autorizado para despliegue real. **El nivel 4 no se
concede.**

| Configuracion | 1 | 2 | 3 |
|---|---|---|---|
| Installer local (nueva y existente) | GO | GO | Preparado |
| Installer external con credencial de propietario | GO | GO | Preparado |
| Installer external sin credencial, Storage ya preparado | GO | GO | Preparado |
| **External migrada con Storage sin preparar (la afectada), con credencial temporal de propietario** | GO | GO | **GO para iniciar el ensayo en copia restaurada** |
| External sin credencial y sin preparar | NO GO (se detiene antes de tocar nada, por diseno) | NO GO | No aplica |
| Proveedor sin acceso al esquema `storage` (p. ej. Supabase Cloud) | NO GO | NO GO | No aplica |
| Notes, Studio, Canvas, Chat, Notificaciones | GO | GO | Preparado (R1, R4) |

**Recomendacion: GO para iniciar el ensayo en una copia restaurada de la external,
bajo estas condiciones**:

1. Usar installer `2026.10.28.6` e imagenes del SHA `44e09bb7f71d` (hashes de 0.2), no
   las de `330e4a712`.
2. Que el ensayo use el installer de este arbol o que los tres commits se publiquen
   antes (R9); si no, `update-external.sh` aplicara el `.5`.
3. Copia de seguridad previa de la base y del almacenamiento de objetos, y la copia
   restaurada sin contacto con la instancia real.
4. Credencial de propietario temporal segun el runbook, y ensayar ademas **sin** ella
   para ver que se detiene sin tocar el esquema.
5. Medir en el ensayo lo no medido (0.7) y repetir la UI de Notes con actualizacion
   (R4).

Esto no es una autorizacion de despliegue productivo.

---

## Anexo: certificacion previa sobre `330e4a712` (secciones 1 a 13)

## 1. SHA certificado e imagenes

Candidato: `330e4a71204990cc6b5bd7f4dfdfe20bd08a8296` (rama `main`, arbol limpio al
congelarlo). Las tres imagenes se construyeron con `scripts/build-local-api-image.mjs
--ref=<SHA>` (archivo `git archive` del SHA, sin cambios locales).

| Imagen | Tag local | Digest (id) |
|---|---|---|
| API | `runly-notifications:api-330e4a712049` | `sha256:de6655e51930cb01faa3e7611dd5ad8ff054cf93538c0f42d46e84cb02576322` |
| Worker | `runly-notifications:worker-330e4a712049` | `sha256:d2121ecefad9e4ad57da500954b55735f6ac17e9e88a9d19065a86bbfee2882c` |
| Web | `runly-notifications:web-330e4a712049` | `sha256:cdf17d8397367de3cbca39f205c7ea97dff9033ac8952700add652a767b3564c` |

Los alias `runly-studio:rc-…`, `runly-notes-private:rc-…` y `runly-notes-private:api-…`
apuntan a la misma imagen API (mismo id `de6655e51930`): los scripts de prueba validan
el nombre del repositorio de la imagen, por lo que se re-etiqueto sin reconstruir.

Version del Installer (`infra/installer/release-files.json`): `2026.10.28.5`.

Actualizacion posterior: una actualizacion real de `update-external.sh` con el installer
`2026.10.28.5` aplico migraciones antes de que el gate de Storage se detuviera. El installer
`2026.10.28.6` ejecuta el gate antes de cualquier migracion (ver
`NOTES_PRIVATE_STORAGE_SECURITY_CLOSURE.md`, seccion "Orden de actualizacion"). Este
candidato debe publicarse con el installer `.6`, no con el `.5`.
Version de `package.json`: `0.1.0` (sin cambios). Edicion: Jaguar.

Compatibilidad entre componentes: API, Worker y Web salen del mismo SHA; el Installer
del mismo SHA los orquesta (los 8 escenarios del apartado 3 los usan juntos).

Commit posterior: `bf16ccd1e` modifica unicamente scripts de prueba
(`scripts/measure-studio-realtime.mjs`, `scripts/verify-user-isolation.mjs`) y
`.gitignore`. Las imagenes se construyeron en `330e4a712`; el codigo de producto de
`bf16ccd1e` es identico al del candidato.

## 2. Correcciones indispensables de fixtures (no de producto)

| Fixture | Problema | Correccion |
|---|---|---|
| `measure-studio-realtime.mjs` | La API del candidato no arrancaba (`NOTES_STORAGE_OWNER_PREPARATION_REQUIRED`): el fixture no preparaba el propietario de Storage. El control de seguridad nuevo funcionaba como se disena. | Prepara el propietario desechable en `--phase=after`, igual que los demas fixtures. |
| `verify-user-isolation.mjs` | El stub de Supabase era anterior a la migracion `20261210000000_studio_realtime_ephemeral` (faltaban `auth.sessions` y el rol `runly_studio_socket` con `USAGE` en `realtime`). | Se anaden ambos al bootstrap del stub. |

## 3. Instalaciones y actualizaciones (imagenes del candidato)

`scripts/verify-notes-installer-e2e.mjs` con las tres imagenes del candidato. Ejecuta
los `setup-local.mjs` / `setup-external.mjs` reales sobre pilas desechables con puertos
libres. Resultado: 8 de 8 PASS.

| Caso | Tipo | Resultado |
|---|---|---|
| local-existing-upgrade | Local, instalacion existente (imagen previa, buckets publicos, nota e imagen testigo) | PASS |
| local-fresh | Local nueva | PASS |
| external-owner-available | External con credencial de propietario | PASS |
| external-no-owner-prepared | External sin credencial, Storage preparado | PASS |
| external-no-owner-unprepared | External sin credencial, Storage sin preparar | PASS (el installer se detiene antes de reemplazar contenedores) |
| external-bad-owner-credential | Credencial de propietario incorrecta | PASS (falla sin exponer la credencial) |
| external-partial-preparation | Preparacion parcial (politica sin guard o viceversa) | PASS (falla cerrado) |
| external-regression-to-unsafe | Storage preparado que regresa a estado inseguro | PASS (falla cerrado) |

Cada caso verifica (no se acepta solo `/health`): lecturas anonimas denegadas por URL
publica, por endpoint de objeto y por render; listado anonimo vacio; bytes originales
de la imagen testigo y nota intactos; `note_image_binding` con la imagen historica;
repeticion idempotente.

Matriz solicitada y cobertura:

| Requisito | Cubierto por |
|---|---|
| Instalacion local nueva | local-fresh |
| Actualizacion local existente | local-existing-upgrade |
| Instalacion external preparada | external-no-owner-prepared |
| Actualizacion external existente | external-owner-available / external-no-owner-prepared (parten de base con datos) |
| Credencial de propietario ausente | external-no-owner-prepared / -unprepared |
| Storage no preparado / preparado | external-no-owner-unprepared / -prepared |
| Permisos faltantes | external-bad-owner-credential, external-partial-preparation |
| Actualizacion repetida | repeticion idempotente dentro de cada caso |
| Preservacion de datos testigo | nota e imagen testigo verificadas en cada caso |
| Recuperacion de una actualizacion interrumpida | **Cobertura parcial**: external-partial-preparation y external-regression-to-unsafe cubren un estado intermedio/inseguro; no se mato el proceso del installer a mitad de ejecucion. |

Regresion de Notes con el candidato (`runly-notes-private:api-330e4a712049`):
`verify-notes-private-storage.mjs` instalacion nueva PASS; con `--upgrade --ui` PASS
(imagenes historicas, Excalidraw con manifiesto historico, nota publica y Excalidraw
publico sin abrir Storage, previews autorizados).

## 4. Integracion Realtime con identidades reales

Todas las pruebas usan Supabase Auth/Realtime/Storage desechables, JWT reales y
Chrome via Playwright.

### Studio
`measure-studio-realtime.mjs --security --e2e`:
- Seguridad PASS: socket real solo entra a su scope efimero exacto; Auth/anon/otro
  diseno/reuso de tokens de API denegados; politica global restrictiva sin cambios;
  legacy live sigue autorizado; VIEWER obtiene capacidad efimera pero no persiste.
- E2E PASS: cursores (109 ms), presencia/salida (24 ms), multipagina, multiples
  pestanas, MCP con aprobacion y commit real, coexistencia protocolo viejo/nuevo,
  reconexion tras 30 s (17,1 s), refresco de token, caida solo de API, revocacion
  (cierre de canales en 20,2 s dentro del lease), cambio de diseno y desmontaje sin
  fugas de canales ni participantes, 0 peticiones `/live`.
- Plantillas, guardado y exportacion: cubiertos por la suite Node (Studio) y los
  verificadores de interchange existentes; **no se reejecutaron en navegador** en esta
  certificacion.

### Canvas, Notes, Chat
`measure-realtime-2.mjs --ui --security --strict` (Notes, 2 usuarios), 2 de 2 PASS,
`releaseBlockers: []`: el cliente no puede falsificar `canvas changed`; awareness
verificado y suplantacion rechazada; sockets cerrados/revocados sin actualizaciones;
`privateNoteImagePubliclyReadable: false`; rotacion de autorizacion bloqueada ~770 ms
bajo latencia inyectada de 750 ms (barrera `FOR SHARE` intacta).
Cubre Y.js, Tiptap (edicion remota), Excalidraw, imagenes privadas, autosave,
recarga/reconexion y revocacion.

**Hallazgo**: la primera ejecucion combinada (4 modulos, 1/5/10 usuarios) fallo una vez
en `UI_TIMEOUT: Tiptap remote edit` (limite de 15 s). Se repitio dos veces con la
misma configuracion minima y paso ambas. No se aislo la causa raiz; se clasifica como
intermitencia bajo carga (riesgo residual R4). Chat (mensajes, adjuntos, typing,
presence, contadores, chat flotante, invitados, senales de llamadas) se ejercito en
`chat-ui` (mensajes, contadores, conversaciones) y por la suite Node; **adjuntos,
invitados y senales de llamada no se reejecutaron en navegador** con el candidato.

### Notificaciones
`measure-notifications.mjs` (1/5/10 usuarios, escenarios A, C, D, E, F, H, J, S):
broadcast inmediato a campana, inbox, dos pestanas, caida de Realtime con
recuperacion, seguridad con identidades reales (0 fallos de 12 verificaciones por
corrida, 3 corridas), 0 avisos perdidos. Lecturas, contadores, preferencias, DND,
dedupe y worker con proveedores simulados: suites unitarias (11 de
`notificationSync`, dedupe, servicio, worker); DND y push/FCM reales **no** se
validaron end to end.

## 5. Seguridad

| Verificacion | Resultado |
|---|---|
| Aislamiento entre empresas contra PostgreSQL (`user-isolation.integration`, bootstrap limpio con todas las migraciones) | 14 de 14 PASS (Studio, Canvas, Notes, Chat, Calendario, finanzas personales, MirAI, archivos) |
| Studio: otro diseno, anon, reuso de tokens, revocacion | PASS |
| Notificaciones ajenas / canales de otra empresa | `S_security` 0 fallos (3 corridas por tamano) |
| Notas e imagenes privadas | lectura anonima denegada (URL publica, objeto, render, listado) en el E2E del installer (8 casos) y en las regresiones de Notes (nueva y con actualizacion) |
| Sesiones expiradas / revocaciones | Studio (lease 30 s, expiracion verificada), Canvas/Notes (cierre de sockets), Chat |
| RLS y politicas de Storage | sin cambios; politica RESTRICTIVE `runly_notes_private_images_v1` y trigger guard verificados de solo lectura por el installer |

## 6. Rendimiento (candidato)

Ventanas comparables a `RUNLY_REALTIME_2_LOCAL_VALIDATION.md` (60 s, actividad
activa). CPU en segundos por ventana; "certificado" es la cifra "despues" de ese
informe. Mediciones unicas por celda, no promedios estadisticos.

| Modulo | Usuarios | CPU total candidato | CPU total certificado |
|---|---:|---:|---:|
| Canvas | 1 / 5 / 10 | 1,11 / 27,9 / 50,0 | 1,20 / 29,59 / 62,65 |
| Notes | 1 / 5 / 10 | 9,7 / 34,4 / 65,4 | 11,24 / 41,81 / 77,18 |
| Chat (chat-ui) | 1 / 5 / 10 | 9,4 / 47,4 / 123,2 | 14,28 / 102,13 / 208,30 |

Canvas y Notes conservan o mejoran la reduccion. Chat: la comparacion no es
equivalente (el informe certificado usa el modo "Chat hooks"; aqui el modo `chat-ui`),
por lo que solo se concluye que no se observa deterioro. Errores HTTP: 0 en todas las
celdas.

Studio (30 s, `--phase=after`, sin `--security`): 0 peticiones `live` por minuto y 0
escrituras de presencia; SQL con 10 usuarios 297 llamadas en 30 s frente a 77.980 en
60 s de la linea base; p95 de entrega 15,9 a 68 ms (537 ms en el primer escenario de
conexion, `cursor-1`). Ventana distinta de la certificada: mejora conservada, no
comparacion estricta.

### Notificaciones (45 s por escenario)

| Metrica | 1 usuario | 5 usuarios | 10 usuarios |
|---|---:|---:|---:|
| Nueve avisos, p95 de aparicion en campana | 73 ms | 171 / 183 ms | 352 / 492 ms |
| Linea base previa (p95) | 26,7 s | 26,9 s | 28,1 s |
| Reposo: llamadas SQL por ventana | 132 | 674 | 1.623 |
| Reposo: CPU API / PG / Realtime (s) | 0,13 / 0,42 / 0,17 | 0,76 / 0,58 / 0,20 | 0,91 / 0,94 / 0,20 |
| Dos pestanas, p95 | n/a | n/a | 466 ms |
| Caida de Realtime, p95 de recuperacion | 275 ms | 10,1 s (valor atipico) y 184 ms (repeticion) | 0 ms (p50 y p95 sobre 10 muestras) |
| Avisos perdidos / toasts duplicados | 0 / 0 | 0 / 0 | 0 / 0 |

Las cifras con dos valores son dos corridas independientes del candidato (`rc` y
`rc2`). El p95 de 10,1 s con 5 usuarios en la caida de Realtime no se reprodujo en la
repeticion (184 ms); queda registrado como valor atipico no explicado (R3). El CPU de
Realtime en el escenario J es invalido (contador reiniciado al reiniciar el
contenedor, sale negativo) y no se usa.

Los valores del p95 son algo mayores que los del informe de Notificaciones (67, 170,
305 ms) pero del mismo orden y 50 a 80 veces menores que la linea base.

### Rafaga de 100 avisos a 10 usuarios (1.000 entregas)

| Corrida | CPU API | CPU PG | CPU Realtime | SQL | Ultimo aviso visible (p95) |
|---|---:|---:|---:|---:|---:|
| Linea base previa | 3,7 s | 6,7 s | 0,3 s | n/d | 27,5 s |
| Informe de Notificaciones | 9,3 s | 16,6 s | 4,2 s | n/d | 10,6 s |
| Candidato `rc` | 12,3 s | 23,8 s | 6,5 s | 18.159 | 14,7 s |
| Candidato `rc2` | 12,3 s | 21,1 s | 5,3 s | 18.634 | 14,2 s |

El candidato cuesta mas CPU en rafagas que la linea base previa (PG 3,1 a 3,5 veces,
API 3,3 veces, Realtime 18 a 22 veces) y entre 27 y 43 % mas PG que mi medicion
anterior, con una latencia visible de 14 s (anterior 10,6 s; linea base 27,5 s). Las
dos corridas del candidato son consistentes entre si; la diferencia con la medicion
anterior no se aislo (carga del equipo vs. cambio de codigo). Con 5 usuarios: 5,6 a
6,3 s visibles, PG 4,8 a 5,9 s; con 1 usuario: 2,2 s.

Causa: cada aviso se emite por Broadcast privado a cada destinatario; en una rafaga
de N avisos a U usuarios son N x U escrituras en `realtime.messages` y N x U
autorizaciones. Agrupar eventos por destinatario (un evento "hay novedades" con
coalescencia de 100 a 250 ms, y recuperacion por `/notifications/summary`) reduciria
el costo sin tocar la seguridad. **No se implemento**: no hay bloqueo de estabilidad
ni de seguridad (0 perdidos, 0 duplicados, sin errores, seguridad intacta). Clasificado
como mejora posterior, prioridad media; solo importa para empresas que emiten rafagas
de cientos de avisos.

### No medido en esta certificacion
Memoria (RSS) y fugas de conexiones no se midieron de forma equivalente (el informe
Realtime 2 tampoco tiene comparacion RSS inicial/final para 60 s); CPU y memoria del
Worker; 20 usuarios y 1.000 notificaciones; PWA movil suspendida.

## 7. Pruebas generales

| Gate | Resultado |
|---|---|
| Suite Node completa (950 archivos `*.test.js` / `*.test.mjs` rastreados, lotes de 80, concurrencia 4) | 5.700 pruebas: 5.674 PASS, 11 FAIL, 15 SKIP, 0 canceladas, 0 todo (5.674 + 11 + 15 = 5.700) |
| `pnpm lint` | exit 0 |
| `pnpm --filter @runly/desktop build:web` | exit 0 |
| Imagenes Docker API / Worker / Web | construidas |
| Installer E2E (candidato) | 8 de 8 |
| Aislamiento entre empresas contra PostgreSQL | 14 de 14 |
| `pnpm test:mcp` | **208 pruebas: 189 PASS, 17 FAIL, 2 SKIP** (ver abajo) |
| Regresiones Files / SDK | incluidas en la suite Node (sin fallos nuevos) |

### Reconciliacion con "4.323 / 4.310 / 7"
El conteo anterior (4.323 pruebas, 4.310 aprobadas, 7 fallidas) correspondia a una
lista de archivos mas corta. Las 6 pruebas restantes de ese conteo (4.323 - 4.310 - 7)
no se pueden identificar retroactivamente: eran omitidas u otro estado. La ejecucion
actual si esta contabilizada al 100 %: 15 omitidas, todas con condicion propia de
omision en el codigo (`RUN_CROSS_TENANT_TESTS`, `DATABASE_URL` ausente, Docker o
variables de entorno), por ejemplo "cross-tenant security", "applyConnectionWrites
against PostgreSQL", "schema evolution against PostgreSQL" y pruebas de UI sin
navegador. Varias de esas condiciones se cubren en otra via en esta certificacion
(aislamiento contra PostgreSQL 14/14, Studio contra PostgreSQL desechable). No se
agrego ningun skip.

### Fallos heredados: linea base reproducible
Se extrajo `133a897210e3` (commit anterior al primer cambio de este trabajo) con
`git archive` en un directorio temporal bajo el repositorio (node_modules enlazados) y
se ejecutaron los 9 archivos que fallan. Resultado: **fallan exactamente los mismos 9
archivos y las mismas 11 pruebas** en la linea base y en el candidato.

| Archivo | Pruebas | Causa observada |
|---|---:|---|
| `calls/__tests__/contacts-proposal-module.test.js` | 2 | heredada (Contacts) |
| `calls/__tests__/call-transcript-analysis-service.test.js` | 1 | heredada |
| `__tests__/public-website-capture-config.test.js` | 1 | heredada |
| `__tests__/module-runtime-routes.test.js` | 2 | espera 404, recibe 500 |
| `services/__tests__/module-runtime-catalog.test.js` | 1 | catalogo de runtime desactualizado (`generate-module-runtime-catalog.mjs`) |
| `scripts/__tests__/installer-devkit-snapshot.test.js` | 1 | snapshot del devkit desactualizado respecto a `@runly/ui` |
| `scripts/__tests__/runly-env-config.test.js` | 1 | los `bootstrap-*.sh/.ps1` no referencian `lib/env-compat.mjs` (origen `134766907`/`c204d5cea`) |
| `scripts/tests/docker-shared-sources.test.mjs` | 1 | la copia temporal no incluye `scripts/generate-installer-release.mjs` (origen `c204d5cea`) |
| `scripts/tests/prosemirror-clipboard-security.test.mjs` | 1 | prueba de navegador, falla en este entorno |

Los dos fallos heredados de Contacts siguen contabilizados (primera fila).

### `test:mcp`: 17 fallos
Causa verificada: `column n.parent_note_id does not exist` (Postgres `42703`). El
runner (`scripts/test-runly-mcp.mjs`) crea la base con `prisma db push` desde
`schema.prisma`, pero las columnas de subpaginas de Notes (`parent_note_id`) solo
existen en la migracion `20261117000000_notes_references_and_subpages`. Tanto el codigo
que usa esas columnas (`23395cbc5`) como el runner (`d9acfe6e0`) estan en el commit
`133a8972` (anteriores a este trabajo). **No se reejecuto `test:mcp` en el
baseline**; la clasificacion se basa en la causa y en el historial, no en una
ejecucion comparativa. Afecta a las herramientas `notes_*`, `projects_workload`,
`projects_time_summary`, `documents_kinds` y `documents_templates`, y a las pruebas
integradas que las usan. Recomendacion: cambiar el runner a `prisma migrate deploy`,
o dejar de modelar esas columnas fuera del esquema. No es un bloqueo del candidato,
pero deja sin cobertura automatica de integracion la capa MCP de Notes.

### Otros hallazgos
- `packages/sdk/src/domains/chat.js` define `assignOperator` dos veces (lineas 421 y
  479); la segunda sobrescribe a la primera (esbuild avisa `duplicate-object-key`).
  No se modifico: es una correccion de producto fuera de alcance. Hay que decidir cual
  firma es la correcta.

## 8. Compatibilidad y condiciones de actualizacion

- **Storage de Notes con propietario**: el bucket `runly-notes` pasa a privado con
  politica RESTRICTIVE y trigger guard. La politica y el trigger requieren el
  propietario del esquema `storage`. En instalaciones locales con Supabase
  autoalojado el installer lo ejecuta con `supabase_admin` (`notes-private-storage-owner.sql`).
  En external hay que proporcionar la credencial de propietario (solo por entorno,
  nunca por argumentos) o haber preparado Storage antes. Sin eso el installer **se
  detiene antes de reemplazar contenedores** y la API del candidato tampoco arranca.
- **Periodo de mantenimiento**: aplicar con Notes sin escrituras activas. El proceso
  inventaria referencias antiguas y las enlaza (`note_image_binding`); notas abiertas
  durante la migracion deben recargarse.
- **URLs antiguas de imagenes**: las URLs publicas directas de Storage dejan de
  funcionar para siempre (bucket privado). Las imagenes se sirven por la ruta
  autorizada de la API; las notas publicas resuelven sus imagenes sin abrir Storage.
  Copias o enlaces que alguien ya descargo o guardo mientras el bucket era publico no
  se pueden retirar.
- **Frontend anterior y caches**: la API sigue aceptando el protocolo anterior de
  Studio (coexistencia verificada). Un frontend viejo no tiene el handler de resumen
  ni el dedupe por id de notificacion: seguira funcionando con polling, pero con
  duplicados mas probables. Service Worker: el nuevo `sw-notifications.js` publica
  `count`; un SW viejo en cache lo omite y la deduplicacion cae a `dk:`/contenido
  (cubierto por pruebas unitarias, no por E2E con SW real). Recomendado: publicar Web
  y API juntas y forzar la actualizacion del SW.
- **Imagenes compatibles**: API, Worker y Web del mismo SHA con el installer
  `2026.10.28.5`; no mezclar con imagenes anteriores a `17a5b0561` (la API vieja no
  conoce el guard de Storage).
- **Supabase Cloud y proveedores gestionados**: no se probo. Si el proveedor no deja
  crear politicas/triggers en el esquema `storage`, la preparacion con propietario es
  imposible y el despliegue queda en NO GO para esa configuracion.
- **Supabase CLI de desarrollo**: no certificado; solo aplica `--verify` y se detiene
  si Storage no esta preparado.

## 9. Riesgos residuales

| Id | Riesgo | Gravedad | Mitigacion |
|---|---|---|---|
| R1 | Rafagas de avisos: coste PG/API/Realtime elevado | Media (solo bajo rafagas) | Agrupar por destinatario (mejora posterior, prioridad media) |
| R2 | `test:mcp` rojo por incompatibilidad runner/esquema | Media (pierde cobertura) | Runner con migraciones |
| R3 | Valor atipico de 10,1 s en recuperacion de Realtime (5 usuarios), no reproducido | Baja | Repetir en el ensayo en clon |
| R4 | Fallo intermitente de UI "Tiptap remote edit" (1 de 3 corridas, bajo carga) | Baja a media | Repetir en el ensayo; investigar si reaparece |
| R5 | 11 pruebas heredadas rojas (9 archivos) | Baja (identicas en la linea base) | Limpieza independiente |
| R6 | `assignOperator` duplicado en el SDK de Chat | Baja | Decidir firma correcta |
| R7 | Memoria/conexiones, Worker CPU, 20 usuarios no medidos | Media (desconocido) | Medir en el ensayo |
| R8 | Imagenes ya descargadas con el bucket publico no recuperables | Inherente | Comunicar al cliente |

## 10. Funcionalidades no probadas

Push/FCM real y Tauri; PWA movil; DND end to end; cambio de empresa en vivo; inbox
Playwright E2E; plantillas/guardado/exportacion de Studio en navegador; Chat con
adjuntos, invitados y senales de llamada en navegador; actualizacion interrumpida
(proceso matado a mitad del installer); `update-local.sh` / `update-external.sh`
ejecutados directamente; proveedor real y Supabase Cloud; 20 usuarios con 1.000
notificaciones; Worker CPU y memoria; `test:mcp` en la linea base.

## 11. Procedimiento de rollback seguro

1. Antes de actualizar: copia de seguridad de la base y del bucket `runly-notes`
   (incluidos los objetos), y registro de los tags/digests de las imagenes actuales.
2. Si falla el gate de Storage: **no hay estado a deshacer**, el installer se detiene
   antes de reemplazar contenedores.
3. Si falla despues del arranque: volver a los tags anteriores de API/Worker/Web y
   `up -d`. Las migraciones Prisma aplicadas son inmutables y aditivas; no se
   revierten.
4. **No reabrir el bucket** como parte del rollback: la API anterior espera objetos
   accesibles por URL publica, pero reabrirlo expone imagenes privadas. Si se
   necesita la API anterior, mantener el bucket privado: las imagenes de notas no se
   mostraran hasta restaurar el candidato (degradacion aceptable frente a exposicion).
5. Si hay que restaurar objetos: usar la copia de seguridad del bucket; el binding en
   `note_image_binding` es independiente y se conserva.

## 12. Dictamen por configuracion

Niveles: (1) GO local del modulo; (2) GO local de la instalacion; (3) preparado para
ensayo en clon restaurado; (4) autorizado para despliegue real.
**El nivel 4 no se concede: requiere autorizacion explicita del responsable.**

| Configuracion | 1. Modulo | 2. Instalacion local | 3. Ensayo en clon | 4. Despliegue real |
|---|---|---|---|---|
| Studio | GO | GO | Preparado | No autorizado |
| Canvas | GO | GO | Preparado | No autorizado |
| Notes (incl. Storage privado) | GO | GO | Preparado | No autorizado |
| Chat | GO (con alcance de seccion 4) | GO | Preparado | No autorizado |
| Notificaciones | GO local, rafagas con coste cuantificado (R1) | GO | Preparado | No autorizado |
| Installer: local nueva / existente | GO | GO | Preparado | No autorizado |
| Installer: external con credencial de propietario | GO | GO | Preparado | No autorizado |
| Installer: external sin credencial, Storage ya preparado | GO | GO | Preparado | No autorizado |
| Installer: external sin credencial y sin preparar | NO GO | NO GO (se detiene por diseno) | No aplica | No autorizado |
| Proveedor gestionado sin acceso al esquema `storage` (p. ej. Supabase Cloud) | NO GO | NO GO | No aplica | No autorizado |
| Supabase CLI de desarrollo | No certificado | No certificado | No aplica | No autorizado |

Condiciones del nivel 3 (ensayo en clon restaurado): restaurar un clon de cada
instalacion real, ejecutar el installer del SHA candidato, repetir el gate de Storage,
medir memoria/conexiones/Worker, repetir R3 y R4, y confirmar las imagenes
historicas de Notes en el clon.

Este informe no declara un GO global ni autoriza ningun despliegue.

## 13. Reproduccion

Los scripts de apoyo de la corrida estan en `.artifacts/rc/` (ignorado por Git). Comandos
principales, todos con las imagenes del candidato:

```text
node scripts/build-local-api-image.mjs --ref=330e4a71204990cc6b5bd7f4dfdfe20bd08a8296 --kinds=api,worker,web
node scripts/verify-notes-installer-e2e.mjs --api-image=… --worker-image=… --web-image=…
node scripts/verify-notes-private-storage.mjs --api-image=runly-notes-private:api-330e4a712049 [--upgrade --ui]
node scripts/measure-studio-realtime.mjs --phase=after --api-image=runly-studio:rc-330e4a712049 --seconds=30 --security --e2e
node scripts/measure-realtime-2.mjs --phase=after --api-image=runly-notes-private:rc-330e4a712049 --modules=canvas,notes,chat-ui --users=1,5,10 --seconds=60 --activity=active
node scripts/measure-realtime-2.mjs --phase=after --api-image=… --modules=notes --users=2 --seconds=10 --ui --security --strict
node scripts/measure-notifications.mjs --api-image=runly-notifications:api-330e4a712049 --label=rc --users=1,5,10 --window=45
node scripts/verify-user-isolation.mjs
pnpm lint
pnpm --filter @runly/desktop build:web
pnpm test:mcp
```

Salidas completas: `.artifacts/rc/*.log`, `.artifacts/notifications/rc-*`,
`.artifacts/studio/realtime/rcbench*.json`.
