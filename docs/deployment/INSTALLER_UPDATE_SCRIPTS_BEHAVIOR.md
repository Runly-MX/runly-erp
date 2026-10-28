# Comportamiento de update-external.sh y update-local.sh ante interrupciones

Verificado con bases y Supabase desechables y un origen de distribucion controlado
(`scripts/verify-notes-installer-e2e.mjs`, escenas `update-script-*`). Los scripts no se
modificaron. No se ejecutaron contra instalaciones reales ni contra GitHub.

## Que hacen

1. `update-external.sh` / `update-local.sh` resuelven el commit de `main` en GitHub
   (`api.github.com/repos/Runly-MX/runly-erp/git/ref/heads/main`) o usan
   `RUNLY_INSTALLER_REF` si es un SHA de 40 caracteres.
2. Descargan `bootstrap-external.sh` / `bootstrap-local.sh` de ese SHA, que a su vez
   descarga el cargador (`update-installer.mjs`, con SHA-256 fijado en el bootstrap).
3. El cargador descarga `installer-release.json` y **todos** los archivos del manifiesto,
   verifica el SHA-256 de cada uno y solo entonces sustituye los archivos vivos con un
   diario que permite revertir el refresco.
4. Ejecuta `setup-external.mjs` / `setup-local.mjs` ya refrescado: Storage de Notes
   (gate), comprobacion de Studio Realtime, `pnpm db:migrate`, `pnpm db:seed`,
   recreacion de contenedores, `/health` y sonda anonima.

**Consecuencia**: lo que se instala es el `main` publicado en GitHub. Con commits sin
publicar se aplica el Installer publicado, no el local.

## Tres clases de interrupcion (no son equivalentes)

| Donde se interrumpe | Que queda | Como se recupera |
|---|---|---|
| **Refresco de scripts** (red caida, archivo corrupto, bootstrap inalcanzable) | Nada cambia: los archivos y `state.json` del Installer instalado son identicos, no se ejecuta setup, no hay migraciones ni contenedores nuevos | Repetir el comando cuando el origen responda |
| **Gate de Storage** (despues del refresco, antes de migrar) | Los scripts ya estan en la version nueva; esquema, seed, datos y contenedores no se tocan | Aportar el propietario temporal (ver el runbook) y repetir |
| **Recreacion de contenedores** (despues de migrar) | **Las migraciones permanecen aplicadas**; no se revierten. No quedan contenedores nuevos | Repetir: converge sin repetir ni revertir migraciones |
| **Migracion fallida** | Prisma registra la migracion como no terminada y **no la revierte automaticamente** | Ver abajo; requiere decision manual |

### Refresco interrumpido

Tres fallos simulados (y verificados): fallo de red al descargar un archivo del manifiesto,
archivo corrompido en transito (`INSTALLER_INTEGRITY_FAILED: <archivo>`) y bootstrap
inalcanzable (`curl` sale con 22 y `set -e` aborta). En los tres casos el Installer
instalado queda igual que antes (mismos archivos, mismo `state.json`), el esquema no
cambia y, al volver el origen, la repeticion termina bien. El cargador descarga y verifica
todo antes de sustituir un solo archivo; si fallara a mitad de la sustitucion, el diario
(`.runly-installer/journal.json`) se revierte en la siguiente ejecucion y se niega a
sobrescribir ediciones locales (`INSTALLER_ROLLBACK_CONFLICT`, `INSTALLER_LOCAL_CHANGES`).

### Recreacion de contenedores interrumpida

Se inyecta un fallo en el primer `docker compose up`, despues de la migracion. Resultado
verificado: la migracion de Notes permanece aplicada, no se crea ningun contenedor, el
Installer ya esta en la version nueva, y la repeticion termina bien con el mismo historial
de migraciones (sin duplicar ni revertir nada). No hay rollback automatico de Prisma.

### Migracion fallida

Se fuerza un conflicto (la tabla `note_image_binding` ya existe) para que
`20261028011349_notes_private_images` falle. Resultado verificado:

- La migracion queda en `_prisma_migrations` con `finished_at IS NULL` y
  `rolled_back_at IS NULL`; no se revierte sola y no se crea ningun contenedor.
- Corregir la causa **no basta**: la siguiente ejecucion se detiene en la comprobacion de
  Studio Realtime con `STUDIO_FAILURE_REQUIRES_REVIEW` ("la causa o el estado no
  corresponden al fallo transaccional conocido; no se modifica el historial"). El
  Installer se niega a seguir sobre un historial de migraciones inconsistente.
- La salida documentada es manual y deliberada:
  `node node_modules/prisma/build/index.js migrate resolve --rolled-back <migracion>`
  dentro de la imagen de la API con la conexion de la instancia. Solo es correcta si se
  confirma que la migracion no dejo cambios (las migraciones de Prisma sobre PostgreSQL
  se ejecutan dentro de una transaccion; el caso verificado falla en la primera sentencia).
  Si hay dudas, inspeccionar el esquema antes de marcarla. Despues la actualizacion
  converge y deja el historial vacio de migraciones no terminadas.

Nunca se debe suponer que una migracion Prisma aplicada se puede deshacer reiniciando el
Installer: el historial es inmutable y los arreglos son siempre migraciones nuevas.

## Como se probo sin tocar GitHub

`scripts/fixtures/installer-update/`:

- `bash-env.sh` (cargado con `BASH_ENV` en cada `bash` no interactivo) define una funcion
  `curl` que llama a `bin/curl`. Es necesario porque Git Bash antepone `/mingw64/bin` al
  `PATH` heredado. `bin/curl` sirve la distribucion versionada desde el directorio
  `RUNLY_TEST_ORIGIN` (respuesta de la API de refs, archivos del Installer) y rechaza
  cualquier otra URL, registrandola.
- `origin-preload.cjs` (`NODE_OPTIONS=--require`) hace lo mismo para el `fetch` del
  cargador y del Dev Kit, convierte `docker pull` y `docker image prune` en operaciones
  nulas (las imagenes son locales), rechaza el resto del trafico saliente y permite
  inyectar fallos (red, corrupcion, fallo unico del primer `compose up`).
- En el arbol instalado esta el Installer anterior (`2026.10.28.5`, leido de Git); el
  origen sirve el actual. Las escenas comprueban que el Installer pasa de `.5` a `.6`.
- Durante la puesta a punto de este arnes, una configuracion de `PATH` incorrecta dejo
  que el `curl` real hiciera dos lecturas publicas de solo lectura a GitHub
  (`api.github.com` y `raw.githubusercontent.com`, sin credenciales ni escrituras). Esta
  corregido y las escenas finales comprueban que el origen controlado atiende las
  peticiones.

## Limitaciones

No se ejecutaron `update-*.sh` sobre una instalacion real ni contra la distribucion
publicada; no se probo `update-local.sh` con Supabase CLI ni en Linux/macOS (solo Git Bash
en Windows); la interrupcion de la migracion se simulo por conflicto de esquema, no
matando el contenedor a mitad de ejecucion.
