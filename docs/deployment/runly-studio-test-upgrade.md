# Runly Studio: preparación del despliegue de pruebas

Fecha de inspección: 2026-10-25. **Publicación y despliegue pendientes de revisión.**
Se trabajó en main, sin ramas ni worktrees. No se aplicó ninguna migración, seed,
reset ni sincronización de módulos a la base compartida. No se reinició el VPS.
Por aclaración posterior del usuario, el alcance final es exclusivamente local;
la conexión e inspección del VPS quedan fuera de esta ejecución.

## Estado comprobado

El arreglo de `apps/shared/` ya estaba en `e56151e5`: COPY en Web/API/Worker e
inputs del release. En esta revisión se encontraron manifests ausentes durante
la instalación frozen: compiler y preview-runtime en Web, preview-runtime en
API/Worker. Se agregaron antes del install, conservando la caché posterior de
fuentes y las versiones del lockfile.

La comprobación dentro de imágenes recorre imports locales desde los entrypoints,
sin ejecutar el servidor ni sus jobs. Comprueba Studio, paquetes compartidos,
Prisma y generación PNG con Sharp en Linux/amd64. La Web se extrae de la imagen
real y se comprueba el grafo estático inicial y el import dinámico de Studio/Fabric.

| Imagen local temporal | Resultado |
| --- | --- |
| `runly-studio-validation:api-4a65e871` | Build aprobado; 862 módulos locales / 2806 imports verificados; rutas Studio, paquetes, Prisma y Sharp aprobados; arranque sin migrate/seed comprobado |
| `runly-studio-validation:worker-4a65e871` | Build aprobado; 264 módulos locales / 608 imports verificados; Studio, paquetes, Prisma y Sharp aprobados |
| `runly-studio-validation:web-4a65e871` | Build aprobado; Studio/Fabric lazy, chunk de 305785 bytes; no pertenece a los 12 chunks iniciales |

Las tres imágenes se reconstruyeron desde main limpio en `4a65e871`, incluyendo
los commits concurrentes de Proyectos. Runtime comprobado: Node 22.23.4, Linux x64.
No se sustituyeron tags de imágenes
en ejecución ni se publicaron estas imágenes. Son artefactos de validación,
no una declaración de release de los cambios concurrentes del repositorio.

Reproducción:

```sh
node --test scripts/tests/docker-shared-sources.test.mjs scripts/tests/api-entrypoint.test.mjs scripts/tests/deployment-preflight.test.mjs
node scripts/verify-studio-images.mjs \
  --api runly-studio-validation:api-4a65e871 \
  --web runly-studio-validation:web-4a65e871 \
  --worker runly-studio-validation:worker-4a65e871
pnpm docker:release:check
```

El dry-run seleccionó **API, Worker y Web**, y omitió Transcriber, TTS y Backup.
La regresión dirigida de core/engine/compiler/SDK, Studio, Canvas, POS, Notes,
Automatizaciones y Documents ejecutó 900 pruebas: 898 aprobadas, 0 fallidas,
2 omitidas. La comprobación adicional de Proyectos pasó sus 29 pruebas.
Las pruebas de empaquetado, preflight, arranque, env y preservación de backup
pasaron sus 24 pruebas. Esas pruebas no prueban login/Storage reales. Los resultados de
empaquetado, preflight, arranque, env y preservación de backup se registran en
`.artifacts/studio/deployment/`, junto con los logs y resultados privados.

## Base compartida: lectura real, sin modificaciones

Se abrió una transacción `BEGIN READ ONLY` contra la conexión configurada localmente.

- PostgreSQL 15.8; 213 migraciones locales y 213 aplicadas.
- Pendientes: **ninguna**. Fallidas sin resolver: **ninguna**. Aplicadas desconocidas: ninguna.
- `20261130000000_studio_design` ya está aplicada y `studio_design` existe.
- Studio, Automatizaciones y Documents figuran instalados/habilitados.
- `studio.view`, `studio.create` y `studio.edit` existen y están activos. Esto
  no demuestra que un usuario concreto tenga esas concesiones.
- Dos checksums no coinciden con los archivos actuales:
  - `20260902000000_chat_message_search`: coincide con `89613ccc`; el archivo
    actual añade search_path explícito a la función de normalización.
  - `20260911120000_notes_realtime_authorization`: coincide con `9e53c73d`;
    el archivo actual retira un ALTER de RLS y añade comentarios de compatibilidad.

No se editaron migraciones aplicadas ni `_prisma_migrations`. El nuevo preflight
responde **código 2 / ready=false** ante estas diferencias. Que no haya pendientes
no equivale a certificar ausencia de drift. Debe revisarse el estado efectivo y
acordarse cualquier corrección forward antes de aprobar la actualización.

Comprobación reutilizable desde el repositorio local (solo lectura):

```sh
node --env-file=.env prisma/deployment-preflight.mjs
```

En una imagen candidata, sin ejecutar su entrypoint, con el env de instalación:

```sh
docker run --rm --pull=never --env-file "$ENV_FILE" \
  --entrypoint node "$CANDIDATE_API_IMAGE" prisma/deployment-preflight.mjs
```

Usar la red y resolución de hosts de la instalación si la base es self-hosted.
El script no imprime la conexión ni sus credenciales. No sustituye una revisión
de backups, semántica de esquema o permisos efectivos de usuarios.

### Dependencias y efectos de las migraciones recientes

| Grupo | Dependencias y efecto | Estado observado |
| --- | --- | --- |
| automation_run/jobs/schedule/approvals/system_automation | Tablas aditivas; jobs/approvals referencian identificadores de ejecución; requiere uuidv7 disponible | Aplicadas |
| automation_webhooks/run_input | Token nullable, índice único, tabla de eventos e input JSON nullable; depende de las tablas anteriores | Aplicadas |
| documents_engine | Columnas kind/formato, mapeo/layout/FileAsset; backfill Growth y relajación de NOT NULL en generados | Aplicada |
| inventory_custody_documents_hub | Copia plantillas al hub preservando IDs/archivos y añade enlace a resguardos | Aplicada |
| lms_certificate_documents_hub | Copia plantillas subidas y layout al hub; conserva fuente design y columnas heredadas | Aplicada |
| documents_remove_block_templates | **Destructiva para plantillas de bloques y sus versiones**; conserva historia/archivos generados y los desvincula | Ya aplicada; no se propone repetirla |
| documents_template_visibility | Propietario/visibilidad y backfill de propietario | Aplicada |
| studio_design | Nueva tabla y restricciones/FKs, índice, RLS y revocación a anon/authenticated; no cambia tablas Canvas | Aplicada |

El código local actual utiliza el esquema posterior y sus pruebas dirigidas pasan.
No se conoce todavía la versión de código desplegada en el VPS ni se certifica
un downgrade a una imagen anterior al motor nuevo de Documents. Revertir una
imagen **no revierte datos ni migraciones**.

## Inicialización y concurrencia

La API ejecutaba migrate deploy y seed en cada arranque. Se añadió
`RUNLY_SKIP_DB_INIT=1` para omitir ambos pasos, y se probó en la imagen real con
comandos centinela, red deshabilitada y sin credenciales. Valores distintos de
0/1 hacen fallar el entrypoint antes de arrancar. El valor predeterminado 0
conserva el comportamiento anterior de otras instalaciones.

El override opt-in `infra/installer/docker-compose.no-db-init.yml` fija ese valor
en ambas variantes de API. **No hace de la API ni del worker un servicio de solo
lectura**: las rutas de aplicación y los jobs conservan sus escrituras; la API
también tiene provisión automática de modelos inline y carga de módulos custom.

Los instaladores ejecutan migraciones/seed como contenedores one-shot y después
arrancan la API, que los repite por defecto. En external, `--skip-migrate` y
`--up-only` evitan el paso one-shot, pero por sí solos no evitaban el entrypoint.
El instalador local no tiene un skip-migrate equivalente. No usar los wrappers
update-local/update-external en este primer despliegue compartido: recrean
servicios y pueden modificar configuración generada y ejecutar inicialización.

Prisma 7.8 proporciona exclusión de sus migraciones con advisory locking; esto
no serializa el seed posterior. El seed actual no tiene un lock global y puede
eliminar permisos obsoletos, recrear grants de administradores y sincronizar
manifests/blueprints. Dos versiones distintas de seed contra la misma base
pueden revertir permisos de la otra. La estrategia de este despliegue es **cero
migraciones y cero seed**, porque el esquema/catálogo ya está aplicado, y usar
el override de arranque solo después de revisar el drift. Si aparece una
migración nueva, detener el procedimiento y planificar un único inicializador
autorizado con ambos entornos coordinados; no ejecutar dos instaladores.

## VPS y respaldo: fuera del alcance actual

El usuario indicó continuar únicamente en local y no conectar por SSH.
**No se ha determinado el modo local/external del VPS, su carpeta de instalación,
imágenes/digests, volúmenes o respaldo.** No se reemplazan esas incógnitas por el
estado del equipo local ni se requiere acceso remoto para cerrar esta entrega.

Antes de autorizar una actualización, el operador debe recoger en privado:

1. Directorio y modo, comprobados con los servicios Compose ejecutándose y sus
   labels; si existen ambos env files, no inferir el perfil por presencia de archivos.
2. Imagen configurada e ID/digest de API/Web/Worker; guardar referencias de rollback
   y asegurar que las imágenes anteriores siguen disponibles.
3. Hashes y copia privada recuperable de `.env`, `.env.local`/`.env.external`,
   `.secrets/`, Compose/overrides y `custom-modules/`; permisos y mounts actuales.
4. Respaldo PostgreSQL **y bytes de todos los buckets Storage**, con cobertura,
   antigüedad, integridad y ensayo de recuperación. Un dump de PostgreSQL no
   contiene los objetos Storage: [documentación Supabase](https://supabase.com/docs/guides/platform/backups).
5. Estado de migraciones mediante el preflight de lectura, sin seed/migrate.
6. Coordinación con el entorno local y quién ejecuta los workers. No añadir
   otro worker a la misma base sin revisar colas, schedules, reintentos y efectos
   externos; una prueba puede consumir trabajo real del otro entorno.

Usar el [runbook de backup y recuperación](backup-recovery.md) y sus herramientas
inspect/extract/assess. Un snapshot listado, sin restauración probada, no se
reporta como recuperable. En esta ejecución no se verificó ningún backup real.

Preferir restaurar a una base/Supabase aislada para el primer smoke test, con
Storage/Auth de prueba y credenciales separadas. Mantener jobs y destinos de
correo/webhooks deshabilitados hasta revisar las colas restauradas; no conectar
una copia de prueba a los recursos compartidos por accidente.

## Publicación propuesta: tags dedicados, no latest

**No se ejecutó este bloque.** Requiere revisión del commit final, árbol limpio
y aprobación de publicación. Los cambios concurrentes sin commit de otras
sesiones deben terminarse/revisarse antes. El SHA debe estar disponible en GitHub
para distribuir el override exacto, pero no se hizo push en esta ejecución.

```bash
test -z "$(git status --porcelain)" || exit 1
RELEASE_SHA="$(git rev-parse HEAD)"
REGISTRY=raulbellosom/runlyerp
for IMAGE in api worker web; do
  docker buildx build --builder runly-multiplatform --platform linux/amd64 \
    --file "infra/docker/$IMAGE.Dockerfile" \
    --label "org.opencontainers.image.revision=$RELEASE_SHA" \
    --tag "$REGISTRY:$IMAGE-studio-$RELEASE_SHA" --push . || exit 1
done
```

Registrar los digests publicados y utilizar `repositorio@sha256:...` en el VPS.
No usar docker:release:all. El `pnpm docker:release` normal sigue apuntando a
latest compartidos; no es el comando elegido para esta prueba aislada.

## Comandos preparados para el VPS, después de aprobar los requisitos

Referencia para una ejecución futura por el operador, **desde la carpeta real
de instalación**. El modo debe confirmarse con los contenedores actuales.
Todavía no es un comando específico de un VPS verificado: esa inspección está
fuera del alcance actual por solicitud del usuario.

```bash
MODE=external  # usar local SOLO si ese es el perfil comprobado
ENV_FILE=".env.$MODE"
test -f "$ENV_FILE" && test -f .env && test -f docker-compose.yml || exit 1
COMPOSE=(docker compose -f docker-compose.yml)
test ! -f docker-compose.linux.yml || COMPOSE+=(-f docker-compose.linux.yml)
test ! -f docker-compose.hairpin.yml || COMPOSE+=(-f docker-compose.hairpin.yml)
COMPOSE+=(-f docker-compose.no-db-init.yml --profile "$MODE")
SERVICES=("runly-api-$MODE" "runly-worker-$MODE" "runly-web-$MODE")
```

Copiar previamente el override revisado desde el SHA aprobado a la instalación,
sin sustituir sus env files ni Compose principal. Mantener cualquier otro
override existente observado en sus labels. La interpolación usa el `.env`
actual generado por esa instalación; el env_file de cada servicio sigue siendo
su `.env.external` o `.env.local`.

Configurar los tres digests aprobados, sin modificar los archivos de configuración:

```bash
: "${API_DIGEST_REF:?falta digest API}"
: "${WORKER_DIGEST_REF:?falta digest Worker}"
: "${WEB_DIGEST_REF:?falta digest Web}"
if [ "$MODE" = external ]; then
  export RUNLY_API_IMAGE="$API_DIGEST_REF" RUNLY_WORKER_IMAGE="$WORKER_DIGEST_REF" RUNLY_WEB_EXTERNAL_IMAGE="$WEB_DIGEST_REF"
else
  export RUNLY_API_LOCAL_IMAGE="$API_DIGEST_REF" RUNLY_WORKER_LOCAL_IMAGE="$WORKER_DIGEST_REF" RUNLY_WEB_LOCAL_IMAGE="$WEB_DIGEST_REF"
fi
"${COMPOSE[@]}" config --images
"${COMPOSE[@]}" pull "${SERVICES[@]}"
```

Después de confirmar backups, rollback y preflight, **solo con aprobación**:

```bash
"${COMPOSE[@]}" up -d --no-deps "${SERVICES[@]}"
"${COMPOSE[@]}" ps "${SERVICES[@]}"
```

El worker solo entra en SERVICES cuando se haya aprobado su coexistencia o se
utilice la base aislada. No ejecutar down -v, resets, fresh, purge ni limpieza de
imágenes/volúmenes. Estos comandos no se ejecutaron durante la preparación.

## Rollback preparado

Antes del update, guardar por servicio su Config.Image, Image ID y RepoDigest;
proteger las imágenes previas con tags locales únicos y una copia `docker image
save` si el registro no garantiza su retención. Guardar hashes de las copias y
de la configuración. No declarar rollback disponible hasta probar acceso a esas
imágenes y a la recuperación de base/Storage.

Para rollback de código, volver a exportar las tres variables de imagen al digest
anterior, conservar el override sin DB init y ejecutar el mismo up --no-deps,
después de comprobar compatibilidad con el esquema vigente. No volver a ejecutar
el seed de una imagen antigua. Si hubiera que recuperar base/Storage, coordinar
primero ambos entornos: esa recuperación afectaría también a la instalación
local. No hay migraciones down automáticas en este plan.

## Smoke test real pendiente

Con el entorno autorizado y listo: login Supabase Auth; permiso y acceso Studio;
crear en blanco y desde plantilla; texto/formas e imagen original mediante
Files/Storage; guardar; reabrir desde otra sesión del mismo propietario; PNG de
página completa y píxeles originales; usuario distinto y otra empresa reciben
denegación. Compartir un diseño con otro propietario todavía no es una función
de esta vertical.

Después: abrir/editar/exportar un Board Canvas, una nota texto y Excalidraw,
planner/operación POS, una automatización de prueba sin destinos reales y una
plantilla/generado Documents. Comprobar logs sanitizados, estado de jobs, hashes
de env, inventario de mounts/custom-modules y repetir preflight de lectura.

Requisitos para un despliegue futuro: inventario del VPS, backup recuperable,
revisión de las dos diferencias de checksum, aislamiento/coordinación de
Auth/Storage/worker y finalización del trabajo concurrente ajeno. No son tareas
remotas de esta entrega local. **El despliegue permanece pendiente de revisión.**
