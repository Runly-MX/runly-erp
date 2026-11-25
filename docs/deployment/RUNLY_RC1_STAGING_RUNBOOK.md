# RC1: manifiesto, staging, actualizacion y rollback

Fecha: 2026-11-25. Complementa `docs/audits/RUNLY_PLATFORM_STABILIZATION_RC1.md` (veredictos) y reutiliza los procedimientos existentes (`EXTERNAL_UPDATE_REHEARSAL_PLAN.md`, `EXTERNAL_BACKUP_ACQUISITION_RUNBOOK.md`, `INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`, `BACKUP_RESTORE_REHEARSAL_COMMANDS.md`, `backup-recovery.md`). Nada de lo siguiente se ejecuto contra una instalacion real. Todas las URLs y rutas son ejemplos.

## 1. Manifiesto del candidato

| Elemento | Valor |
|---|---|
| SHA de staging (ERP) | `e57d7f8171ab2347d58591adb30516bcb075a308` |
| Codigo de las imagenes | `adbfdbb108cf` (`apps/`, `packages/`, `prisma/`, `infra/` son identicos entre este y el SHA de staging; solo cambian pruebas, scripts de CI y docs, verificado con `git diff --name-only`) |
| Imagen API | `runly-notifications:api-adbfdbb108cf`, `sha256:32d4d8794f7b...` |
| Imagen worker | `runly-notifications:worker-adbfdbb108cf`, `sha256:94a6a0890f4e...` |
| Imagen web | `runly-notifications:web-adbfdbb108cf`, `sha256:0873a407f7d2...` |
| Atlas Web Builder | `893d34c`, `v0.11.1` (limpio, sin cambios) |
| Developer Hub | `1f1e864` (no se actualiza hasta ejecutar su sandbox, seccion 6) |
| runly-web | `e96f4dc` |
| Paquetes compartidos | manifiesto de un arbol limpio de `e57d7f817`: `.artifacts/shared-release/e57d7f8171ab2347d58591adb30516bcb075a308/manifest.json` (siete mas `website-blocks`, `dirty:false`); la fuente canonica para produccion sigue siendo el workflow de Actions, no el local |
| Migraciones incluidas | todas hasta `20270115000000_content_intelligence` (302 carpetas) |
| Migracion excluida | `20270116000000_content_intelligence_consolidation` y el codigo de `apps/content-worker`, `services/content-intelligence`, visores de Files y `website-origin-guard` posteriores a `e57d7f817` |

**Atencion: el remoto ya contiene la consolidacion.** `origin/main` esta en `28079331e` (incluye la migracion `20270116` y el codigo que la usa). No hay nada que "no empujar" para ERP. Consecuencia operativa: **nunca desplegar "main"**. Los scripts `update-local.sh` y `update-external.sh` resuelven el Installer de `main` salvo que se fije `RUNLY_INSTALLER_REF` con un SHA de 40 caracteres. `infra/installer` y `prisma/schema.prisma` son identicos entre `e57d7f817` y `main`, asi que el Installer es el mismo; lo que cambia es la imagen, y las imagenes del RC son las de `adbfdbb108cf`, que no traen la migracion `20270116`.

Si se decide que la consolidacion entra al RC, el candidato cambia: hay que construir imagenes desde ese SHA y repetir las pruebas de Content Intelligence y el worker de contenido (otra pila, no cubierta aqui).

## 2. Opcion de staging mas barata

No hay servidor de staging independiente. La alternativa mas simple compatible con la arquitectura es una **instalacion desechable en esta misma maquina** con el Installer local, con otro nombre de proyecto Compose, puertos en `127.0.0.1`, imagenes locales (`--skip-pull`), datos sinteticos y, para el ensayo de actualizacion, la red interna de Docker sin salida. Una segunda maquina virtual sin ruta a produccion es la siguiente opcion si se quiere medir rendimiento o probar telefonos reales (el telefono necesita alcanzar la instancia; eso exige un tunel o una VM accesible, decision del propietario).

Con una copia de datos de la instalacion real (la unica forma de cumplir C3): solo con respaldo autorizado, cifrado en transito, neutralizado (`scripts/rehearsal/replica-guard.mjs`) y sin ruta a Internet. Ver `EXTERNAL_BACKUP_ACQUISITION_RUNBOOK.md`.

## 3. Procedimiento

Todo en la copia aislada. Los comandos con `<...>` se completan al ejecutar; no pegar secretos en el chat.

1. **Identificar la version desplegada** (solo lectura, en el servidor): `docker compose ps --format json` y `docker inspect --format '{{.Config.Image}} {{.Image}}' <contenedor>` de api, worker y web; `cat .runly-installer/state.json` (version, ref, modo); migraciones aplicadas: `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY 1`. Guardar la salida como linea base.
2. **Delta de migraciones** (decide el rollback, seccion 5): `comm -13 <aplicadas.txt> <(ls prisma/migrations | grep -v lock)` da las migraciones nuevas; revisar cada una con `grep -inE "drop (table|column|schema)|rename |set not null|alter column .* type|truncate|delete from"`. Entre `e73cdf3ad` y el RC solo hay una (`20270115`, aditiva).
3. **Backup verificado antes de tocar nada**: `pg_dump -Fc` de la base (esquemas `public`, `storage`, `auth`), archivos de Storage, `.env*` y `.secrets` (cifrados), y `docs/deployment/backup-acceptance.md` para el flujo con restic. Verificar con `pg_restore --list` y restaurar en una base vacia (`scripts/rehearsal/verify-backup-restore.mjs` automatiza la comparacion de filas, claves foraneas e indices). Sin backup restaurable, no continuar.
4. **Entorno aislado**: proyecto Compose propio (`RUNLY_COMPOSE_PROJECT_NAME`), `.env` generado desde la plantilla y `node scripts/rehearsal/replica-guard.mjs --env-file=<env>` en verde, red sin salida si hay datos reales.
5. **Imagenes del SHA correcto**: reutilizar las locales y comprobar `docker image inspect --format '{{.Id}}'` contra la tabla de la seccion 1. Si hay que reconstruir: `git archive e57d7f817` a un directorio limpio y `pnpm docker:release` desde ahi (el tag publicado debe llevar el SHA; nunca `-latest` sin comprobarlo). La imagen DWG necesita la correccion `make -j2` de `infra/docker/dwg.Dockerfile`. Para un arbol limpio con `git worktree`, **no enlazar `node_modules` con uniones (junctions) del arbol principal**: `git worktree remove` las sigue y borra los archivos del arbol original (ocurrio en esta intervencion y se restauro con `git checkout` y `pnpm install --frozen-lockfile --offline --force`). Instalar dependencias en el worktree (`pnpm install --frozen-lockfile --offline`) o usar un clon aparte.
6. **Instalar la version previa y luego actualizar**: partir de las imagenes identificadas en el paso 1, y actualizar con `RUNLY_INSTALLER_REF=e57d7f8171ab2347d58591adb30516bcb075a308` y `RUNLY_API_IMAGE`, `RUNLY_WORKER_IMAGE`, `RUNLY_WEB_EXTERNAL_IMAGE` apuntando a las imagenes locales del RC, con `--skip-pull`. Las migraciones se ejecutan dentro de la imagen de la API (`pnpm db:migrate`, `pnpm db:seed`) con la gate de Storage del Installer.
7. **Health y readiness**: `GET /health` de la API y la web; `docker compose ps` sin reinicios; logs sin errores de arranque (no imprimir variables).
8. **Tareas reales del worker**: crear una notificacion y una automatizacion sencilla y comprobar que el worker la consume (hoy el worker solo tiene prueba de usuario y capacidades, no de arranque funcional).
9. **Conexiones entre servicios**: API a base, API a Storage, web a API (enlace profundo SPA 200), worker a base, y que la API sin base responda como esperado.
10. **Pruebas dirigidas de aceptacion** (no repetir la suite): `node scripts/ci/run-gates.mjs fast` en el SHA; `docs/audits/perf-f3/scripts/http-contract.mjs` (17 comprobaciones) contra la API; revocacion de permisos con un segundo usuario; modulo en cuarentena devuelve 423; las comprobaciones offline de la seccion 4 de este documento; instalar, actualizar, desinstalar y restablecer un modulo RME3.
11. **Recuperar si falla**: seccion 5.

## 4. Comprobaciones offline pendientes (en staging, con Chromium y datos de prueba)

Las 9 pruebas de PostgreSQL (`scripts/test-sync-postgres.mjs`) ya cubren el servicio y el cliente con `fake-indexeddb`. Falta en navegador real:

| Comprobacion | Como |
|---|---|
| IndexedDB real, primer sync de una empresa con mas de 500 filas por entidad | Playwright contra la instancia de staging, contar filas en `offline_records` por entidad y comparar con la API |
| Interrupcion y reanudacion | DevTools offline a mitad del primer sync; al volver, el conteo debe completarse sin duplicados |
| Revocacion de permisos | segundo usuario sin acceso: tras revocar, `sync/pull` devuelve 403 y no llegan registros nuevos; los ya almacenados siguen en el cache hasta cerrar sesion (**limite conocido**) |
| Cambio de usuario y de empresa | cerrar sesion limpia la boveda y el cache; cambiar de empresa no muestra registros de la anterior |
| Registros almacenados previamente | tras cerrar sesion y entrar con otro usuario, `offline_records` no contiene datos del primero |
| Borrados duros | ver abajo |

**Borrados duros: acotacion segura para el RC (sin cambiar protocolo).** El motor retira un registro local solo si el servidor envia `deleted:true`, y solo calendarios y eventos lo hacen. Para el resto (contactos, empleados, departamentos, puestos, vehiculos, conductores, productos, categorias y las cuatro entidades de Ledger) un registro borrado en el servidor permanece en el cache local hasta cambiar de empresa o limpiar datos. Se verifico que esto es **solo de lectura**: `sync-push-service` responde `NOT_FOUND` a una actualizacion de un registro que ya no existe (`apps/api/src/services/sync-push-service.js`, ruta `update`), de modo que una edicion offline de un fantasma no lo resucita ni corrompe datos. El riesgo es mostrar datos borrados sin conexion. Decision para el RC: **no se promete** exactitud de borrados en el uso sin conexion; los modulos con lectura offline (calendario con tombstones y Ledger de escritorio, que solo escribe en linea) son los unicos con pantalla offline. Si algun cliente lo necesita, la salida es `sync_tombstone` mas disparadores (cambio de esquema y protocolo, fuera de este RC). No se deshabilito codigo.

## 5. Rollback

Reglas:

- **Piso de seguridad:** la primera version con los cierres de F1B (usuario no root, cuarentena sin registro de confianza, RBAC granular, supervisor experimental apagado) es el codigo de `e73cdf3ad`, con imagenes locales `runly-candidate:{api,worker,web}-e73cdf3ad`. Cualquier version **anterior** a `e73cdf3ad`, incluida la desplegada hoy si es previa, reactiva los P0 originales y **no es destino de rollback**. (El informe RC1 decia "y anteriores", incluyendo `e73cdf3ad`; era una errata, corregida.)
- **Compatibilidad de migraciones:** las migraciones de Prisma son hacia adelante. Entre `e73cdf3ad` y el RC solo hay una, `20270115` (esquema nuevo `runly_content` y un disparador en archivos), aditiva: una imagen de `e73cdf3ad` arranca sobre una base con esa migracion aplicada sin restaurar la base. Eso **no** vale para el delta completo desde la version desplegada: se decide con el paso 2 (delta de migraciones). Si el delta tiene un `DROP`, `RENAME`, cambio de tipo o `SET NOT NULL`, el rollback exige restaurar la base del backup.
- **Una migracion fallida no se revierte sola** (`INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`): queda con `finished_at IS NULL`; la salida es `migrate resolve --rolled-back <migracion>` dentro de la imagen de la API, solo tras confirmar que no dejo cambios.

Procedimiento:

1. Parar escrituras (modo mantenimiento o detener web y worker).
2. Decidir segun el delta: **solo imagenes** (delta aditivo y sin mutaciones que la version anterior no entienda) o **imagenes mas base restaurada**.
3. Restaurar la base del backup del paso 3 en una base nueva, validar (conteos, claves foraneas, migraciones) y cambiar la conexion; no sobrescribir la base original hasta validar.
4. Archivos: los objetos de Storage subidos despues del backup **no se pierden** al restaurar solo la base (quedan huerfanos en el bucket); restaurar el bucket solo si el backup incluye archivos y se acepta perder los posteriores. Anotar los huerfanos para reconciliarlos.
5. **Mutaciones posteriores al backup** (registros, usuarios, pedidos, mensajes): se pierden al restaurar la base. Antes de restaurar, exportar lo creado desde el backup (`pg_dump` de la base actual) para revision y reaplicacion manual. Es una decision de negocio, no automatica.
6. Levantar las imagenes de `e73cdf3ad` o posteriores con `RUNLY_INSTALLER_REF` fijo, `/health`, y repetir las pruebas dirigidas del paso 10.
7. Orden inverso al de actualizacion: Hub, paquetes compartidos, ERP; y solo a una combinacion de la matriz ERP-Atlas-Hub con catalogos registrados en ambos.

## 6. Hub: sandbox y orden

Estado en `RUNLY_PLATFORM_STABILIZATION_RC1.md` seccion 10. Reproducir:

```text
cd <erp-limpio-en-e57d7f817> && pnpm release:shared
cd <hub> && node scripts/prepare-marketplace-validator.mjs --manifest <erp-limpio>/.artifacts/shared-release/e57d7f8171ab2347d58591adb30516bcb075a308/manifest.json --deps <directorio con node_modules de sharp yauzl jszip zod acorn> --out <raiz>/e57d7f817
set MARKETPLACE_VALIDATOR_ROOT=<raiz>/e57d7f817
set HUB_TEST_INTERCHANGE_DIR=<raiz>/e57d7f817/node_modules/@runly/studio-interchange
node --test tests/website-av-pipeline.test.js tests/website-capabilities.test.js tests/marketplace-validation.test.js tests/marketplace-validator-wiring.test.js tests/marketplace-validator-install.test.js
```

Orden de actualizacion: ERP (API, worker, web), paquetes compartidos del SHA ya publicado, Hub con su sandbox, y solo entonces plantillas con audio y video. El Hub nunca antes que ERP. No se publico ningun paquete ni plantilla.

## 7. Sincronizar los repositorios (no ejecutados)

Estado verificado con `git ls-remote`: ERP `origin/main` = `28079331e`; runly-web `e96f4dc`, Hub `1f1e864` y Atlas `893d34c` ya coinciden con el remoto (ahead 0). **No hay nada que empujar de los cuatro repositorios salvo los commits de esta intervencion en ERP**, y esos cambian CI, scripts y un Dockerfile, no el codigo de las imagenes.

```text
git -C <erp> status --short
git -C <erp> log --oneline origin/main..HEAD
git -C <erp> push origin main
```

Despues de empujar: Actions > Quality Gates > Run workflow > tier `release`, `full_suite` activado, sobre ese SHA. Sin etiquetas `v*` (una etiqueta dispara el tier release y, segun el workflow, no despliega nada, pero es publica), sin despliegue automatico (ningun workflow despliega; `shared-packages.yml` publica solo con `publish=true` manual).

## 8. Licencias y artefactos (inventario, no dictamen)

**Restricciones de staging interno** (uso en una instalacion propia, sin redistribuir): ninguna bloquea. Mantener `country-state-city` y FFmpeg como estan.

**Restricciones de distribucion comercial** (instalador de escritorio, PWA, imagenes publicadas a terceros), a revisar con asesoria juridica:

| Tema | Detalle |
|---|---|
| GPL | `ffmpeg-core.wasm` compilado con `--enable-gpl` (x264, x265, libvpx, LAME); `country-state-city` 3.2.1 (GPL-3.0, ~2.1 MB en el navegador); LibreDWG 0.13.3 en la imagen `runly-dwg` (GPL-3.0, proceso externo sin enlazar); paquetes del sistema GPL en las imagenes base (busybox, apk-tools, gettext, libstdc++, musl-utils: ver `docs/audits/evidence/container-packages-adbfdbb108cf.txt`) |
| ODbL | datos de `dr5hn/countries-states-cities-database` dentro de `country-state-city`; servicio geografico preparado e inactivo, no se activo |
| Sin procedencia registrada | sonidos, logos de modulos, `og-image.png`, modelos Piper, 112 paquetes npm sin archivo de licencia, 2 sin licencia declarada (`buffers`, `khroma`) |
| Avisos pendientes | `THIRD_PARTY_NOTICES` y los 555 textos existen; faltan oferta de fuente correspondiente de los binarios GPL y avisos de distribucion de escritorio y PWA |
| SBOM | npm (1323 versiones) y Rust (625 crates) hechos; **contenedores**: listado de paquetes del sistema de las tres imagenes (`apk list -I`) como evidencia parcial; falta un SBOM CycloneDX/SPDX con herramienta dedicada (`syft` o `docker scout sbom`, no instaladas aqui), incluyendo imagenes de Postgres, LiveKit, Collabora, Piper, DWG y transcriptor |
| Para revision juridica | fuente correspondiente del GPL de FFmpeg y si basta cargarlo como archivo aparte; patentes H.264 y AAC; alcance de "compartir igual" de la ODbL en archivos derivados por pais; MPL-2.0 en cinco crates; `Apache-2.0 AND LGPL-3.0-or-later` en `@img/sharp-win32-x64`; textos y avisos exigidos en la distribucion |

No se sustituyo FFmpeg ni se activo el servicio geografico.
