# Plan de ensayo: actualizacion de una external sobre una copia restaurada

Estado: **plan preparado; el ensayo NO se ha ejecutado.** No existe en el equipo de desarrollo
ninguna copia restaurada ni respaldo de la instalacion real (se comprobo: no hay contenedores,
volumenes ni archivos de volcado del Runly real; solo stacks de otros proyectos y los
desechables de prueba). Por decision explicita, este ensayo no se sustituye por datos
sinteticos: la replica sintetica de `scripts/verify-notes-installer-e2e.mjs`
(`external-affected-replica-rehearsal`) valida el flujo y las herramientas, **no** demuestra
nada sobre los datos, el volumen ni la configuracion reales.

Candidato autorizado para el ensayo: SHA de producto
`40e1b6b0a6d6dd0fc03a724163c8be56b034179d`, Installer `2026.10.28.6`, contrato
`studio-realtime-1`. No se usa nada posterior sin volver a certificarlo.

## 0. Que falta para poder ejecutarlo

Como identificar un respaldo existente, generar uno nuevo de forma autorizada, trasladarlo
cifrado y restaurarlo en una replica aislada esta en `EXTERNAL_BACKUP_ACQUISITION_RUNBOOK.md`
(diagnostico de solo lectura, generacion y traslado, restauracion, consistencia y aislamiento).

Necesita una decision y accion de quien administra la instalacion real, con autorizacion
separada (no se pidio ni se usa en este trabajo):

1. Un **respaldo** de la base de datos de la external (volcado logico completo, incluidos los
   esquemas `public`, `storage` y `auth`) y de los **objetos de Storage** (los archivos de
   los buckets `runly-notes` y `atlas-notes` y los demas).
2. El inventario de producto en el momento del respaldo (version del Installer instalado,
   imagenes y digests en uso, migraciones aplicadas) para comparar con la restauracion.
3. Una maquina de ensayo aislada (ver 2) donde restaurarlo.
4. Credenciales **de prueba** para todo lo que no sea la propia replica. La credencial de
   propietario de Storage del ensayo es la del Postgres de la replica, no la de produccion.

Si esto no existe, el ensayo no puede empezar. No se debe improvisar con un respaldo
parcial ni con acceso temporal a produccion.

## 1. Congelar el candidato

- Commits certificados: `ccbfe9f31` (correccion del enlace profundo del modulo),
  `44e09bb7f` (gate de Storage antes de migrar, Installer `.6`) y `40e1b6b0a` (arnes de
  pruebas), sobre la cadena certificada previa (`ba30e4fad` y anteriores).
- Divergencia: `main` (y `origin/main`) contiene ademas commits de Studio de otra sesion
  **sin certificar** (57 archivos de producto distintos desde `40e1b6b0a`: 46 en
  `apps/api/src`, 5 en `packages/ui`, 3 en `apps/desktop`, y el SDK y los contratos de
  Studio). `infra/` y `prisma/` son **identicos** al SHA certificado, de modo que el
  Installer `.6` y el historial de migraciones no cambian.
- Imagenes certificadas (locales; no publicadas):

| Imagen | Tag | Digest |
|---|---|---|
| API | `runly-notifications:api-40e1b6b0a6d6` | `sha256:42101cf2c44162522a4dd1c83b4b0ad96df9c8ceb589b8f3388415a28247766a` |
| Worker | `runly-notifications:worker-40e1b6b0a6d6` | `sha256:d08b38102dad335fe02d7256840de4ab10941fc7ee51be3b6d7adf7e90dc3537` |
| Web | `runly-notifications:web-40e1b6b0a6d6` | `sha256:8c86ce4e8a995c3246826afb4fbe8756d66f45dc5f92aa64f69c212506a08ee0` |

- Antes del ensayo, volver a comprobar: `docker inspect` de las tres imagenes (mismos
  digests y etiqueta `io.runly.installer.contract=studio-realtime-1`),
  `node scripts/generate-installer-release.mjs --check`, y que
  `git rev-parse 40e1b6b0a^{tree}` sea `0d1ed288b9322a96ec51d2b254aa047401290c50`.
- **No usar `update-external.sh`/`update-local.sh` tal cual**: descargan el Installer de
  `main` (hoy identico en `infra/`, pero puede cambiar) y las imagenes que indique
  `.env.external`. Para el ensayo:
  1. Extraer el Installer del SHA certificado a la carpeta de ensayo:
     `git archive 40e1b6b0a6d6dd0fc03a724163c8be56b034179d infra/installer | tar -x`.
  2. Verificar su manifiesto (`installer-release.json`).
  3. Ejecutar `node setup-external.mjs --skip-pull --skip-dev-kit` (o el `.sh` con
     `RUNLY_INSTALLER_REF=40e1b6b0a6d6dd0fc03a724163c8be56b034179d` si se quiere probar el
     camino de los scripts; en ese caso los archivos del Installer salen del commit
     fijado), con `RUNLY_API_IMAGE`, `RUNLY_WORKER_IMAGE` y `RUNLY_WEB_EXTERNAL_IMAGE`
     apuntando a las **imagenes locales certificadas** (no a `latest`).
  4. `--skip-pull` evita que un `docker pull` sustituya la imagen local; sin el, un tag
     local que no existe en un registro falla.

## 2. Preparar la replica aislada

### 2.1 Restaurar (solo con el respaldo autorizado)

1. Maquina o red Docker de ensayo **sin ruta a produccion**. Nombre de proyecto Compose
   propio y distinto del de produccion (`RUNLY_COMPOSE_PROJECT_NAME`).
2. Levantar un Supabase desechable de la **misma version** que la instalacion real
   (mismos servicios y versiones que los de `infra/installer/supabase`); sin exponer
   puertos fuera de `127.0.0.1`.
3. Restaurar la base: `pg_restore --no-owner --no-privileges` (o `psql` para un volcado
   plano) con el rol propietario de la replica; despues volver a aplicar los roles y los
   permisos propios de Supabase que el volcado no incluya. Registrar y no ocultar cualquier
   error de restauracion.
4. Restaurar los objetos de Storage en el backend de Storage de la replica (volumen de
   archivos o MinIO local), conservando las rutas `companies/<empresa>/notes/<nota>/...`.
   Verificar que `storage.objects` y los archivos coinciden (cada objeto debe poder
   descargarse con la clave de servicio de la replica).
5. Comprobar la restauracion con el inventario (2.4) y comparar con el inventario de
   produccion tomado en el momento del respaldo: mismo numero de usuarios, empresas,
   notas, archivos, objetos y migraciones.

### 2.2 Aislamiento de salida

Lo que una restauracion arrastra y puede alcanzar el exterior: configuracion del `.env`
(claves de IA, FCM/Firebase, respaldo S3, LiveKit, OAuth de Google, SMTP) y **datos en la
base** (credenciales SMTP/OAuth, tokens push, suscripciones, webhooks, conexiones de modulo,
tareas programadas). El Worker puede enviar correos a usuarios reales o notificaciones push
con ellos.

1. **Entorno**: generar el `.env.external` de la replica a partir del de ensayo (nunca copiar
   el de produccion) y aplicar los valores neutralizantes:
   `node scripts/rehearsal/replica-guard.mjs --print-overrides`.
   Verificar con `node scripts/rehearsal/replica-guard.mjs --env-file=<.env.external de la replica>`
   (sale con error si alguna variable apunta fuera de la replica o contiene una credencial
   real; imprime solo **nombres**, nunca valores).
2. **Datos**: el inventario lista las tablas que pueden alcanzar el exterior
   (`externalReach.tables`, p. ej. `fcm_device_token`, `push_subscription`,
   `google_calendar_connection`, `notification_delivery`, `module_connection`,
   `automation_webhook_event`) y las claves de `instance_config` relacionadas. Antes de
   arrancar cualquier contenedor de aplicacion, **decidir con el responsable que se
   neutraliza** en la copia (vaciar tokens, deshabilitar canales de entrega, anular
   credenciales y webhooks). Esa neutralizacion se registra como una lista de cambios y
   la linea base de comparacion se toma **despues** de ella (inventario 0 = restaurado,
   inventario 1 = neutralizado, linea base del ensayo). No se escribe SQL contra tablas
   desconocidas sin revisarlo.
3. **Red**: la replica no debe poder resolver ni alcanzar Internet. En Linux, regla
   `DOCKER-USER` que descarte el trafico de la subred de la replica hacia destinos no
   privados; en Docker Desktop (sin esa posibilidad), ejecutar la replica en una maquina
   virtual sin ruta de salida. Como **criterio de aceptacion** (obligatorio, antes de
   migrar nada): desde un contenedor de la replica,
   `docker run --rm --network <red-de-la-replica> <imagen API> node -e "fetch('https://example.com').then(()=>process.exit(1),()=>process.exit(0))"`
   debe terminar con codigo 0 (la peticion falla). Si sale 1, la replica tiene salida y
   no se continua.
4. **Worker**: arrancarlo solo cuando los canales de entrega esten neutralizados; si hay
   duda, no arrancarlo y ensayar solo API y Web (el Installer lo incluye, por lo que
   debe usarse un `docker-compose` de usuario que lo deshabilite durante la primera fase).

### 2.3 Credenciales

- Todas las credenciales del ensayo son de prueba y distintas de las reales: claves de
  Supabase de la replica (las genera el stack desechable), `JWT_SECRET` propios,
  propietario de Storage = rol Postgres de la replica.
- Ninguna credencial de produccion se copia, se pega o se guarda en la maquina de ensayo.
- La conexion de propietario temporal se pasa solo por entorno (`read -rs`), segun
  `EXTERNAL_NOTES_STORAGE_RECOVERY.md`.

### 2.4 Inventario y hashes (antes de modificar nada)

```text
export REPLICA_DATABASE_URL=...  REPLICA_SUPABASE_URL=...  REPLICA_SERVICE_ROLE_KEY=...   # solo de la replica
node scripts/rehearsal/replica-inventory.mjs collect --output=inventario-0-restaurado.json
```

Recoge, sin imprimir secretos: version de PostgreSQL, historial de migraciones (terminadas y
revertidas), modulos instalados, todas las tablas publicas con su numero de filas y un
resumen (hash) del contenido de cada una (hasta 100.000 filas), buckets con su visibilidad,
**todos los objetos de Storage con su SHA-256 descargando cada uno** (los no legibles se
marcan `UNREADABLE`), presencia de la politica y el guard de Notes, y las tablas con
posibilidad de alcance externo. Rechaza una base o un Storage cuyo host no sea loopback o
privado salvo que se nombre con `--allow-host`.

Tomar tambien el inventario de contenedores e imagenes (`docker ps`, `docker image inspect`
con digests) y el estado de los archivos de la carpeta del Installer (`state.json`).

## 3. Ensayo

Siempre sobre la replica; antes de cada intento, restaurar a un **estado conocido**
(instantanea del volumen de PostgreSQL y Storage, o volver a restaurar el respaldo).

1. **Sin credencial de propietario.** Ejecutar la actualizacion con el Installer certificado
   (seccion 1). Esperado: se detiene con `NOTES_STORAGE_NOT_PREPARED` **antes** de
   migraciones, seed, Studio o contenedores.
   `replica-inventory.mjs collect --output=inventario-1-sin-credencial.json` y
   `compare inventario-0 inventario-1-sin-credencial` debe decir "No unexpected differences"
   (sin permitir ninguna seccion). Confirmar tambien que los contenedores siguen siendo los
   mismos (identificador e `StartedAt`).
2. **Restaurar al estado conocido** y repetir con la **credencial temporal** (entorno del
   proceso, `unset` al terminar). Esperado: prepara politica y guard, cierra los buckets,
   migra lo pendiente, reemplaza contenedores, `/health` y sonda anonima correctos.
3. `collect --output=inventario-2-actualizado.json`; `compare` contra la linea base permitiendo
   solo `migrations-added`, `protections`, `buckets` y las tablas que el arranque de la API
   escribe de forma legitima (se identifican en este mismo ensayo y se documentan una a una;
   cualquier otra diferencia, especialmente en `objects` o en tablas de negocio, es un fallo).
4. Verificaciones adicionales:
   - Peticiones anonimas reales (URL publica, objeto, autenticada, render, listado) a una
     muestra representativa y a todos los objetos de Notes: ninguna devuelve 200.
   - Funcional: iniciar sesion, abrir una nota con imagenes historicas, una nota publicada,
     Archivos, Studio, Canvas, Chat y Notificaciones; abrir un enlace
     `/app/m/runly.notes/?note=<id>` en movil.
   - Seguridad entre empresas con las dos empresas reales de la replica.
   - La conexion privilegiada no esta en logs, `.env.external` ni en el entorno del contenedor
     de la API (`docker inspect`).
5. **Interrupcion controlada y recuperacion** (solo en la replica): interrumpir una vez
   despues de migrar (por ejemplo, impedir el primer `docker compose up`) y comprobar que la
   repeticion converge sin repetir ni revertir migraciones. **No** se repara
   automaticamente una migracion fallida: si ocurre, analizar `_prisma_migrations` y el
   esquema, decidir y documentar (ver `INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`).
6. **Metricas** durante el ensayo: CPU y memoria de API, Worker, PostgreSQL y Realtime
   (`docker stats` o los contadores de `cgroup` como en `scripts/measure-*.mjs`), conexiones
   a PostgreSQL (`SELECT count(*) FROM pg_stat_activity` por rol, antes, durante y despues
   de una carga de 10 usuarios) para detectar fugas, y duracion de cada fase.

## 4. Informe y dictamen del ensayo

Debe incluir: SHA, Installer e imagenes (digests) usados; estado anterior y posterior
(inventarios 0, 1 y 2 y su comparacion); integridad de datos y de cada objeto;
resultados funcionales y de seguridad; metricas; incidentes y recuperacion; riesgos
pendientes; y un dictamen **GO/NO GO para plantear despues** una actualizacion real. Un
GO del ensayo no autoriza el despliegue: eso requiere autorizacion explicita separada.

## 5. Criterios de parada

Detener el ensayo y no continuar si: la replica alcanza Internet; aparece una credencial real
en cualquier archivo, log o entorno; una diferencia inesperada en objetos o tablas de
negocio tras el paso 1; una migracion queda a medias (analizar antes de tocar); cualquier
herramienta pide conectarse a un host que no sea la replica.

## 6. Herramientas disponibles y su validacion

| Herramienta | Uso | Validacion realizada |
|---|---|---|
| `scripts/rehearsal/replica-guard.mjs` | revisa el entorno de la replica; `--print-overrides` | pruebas unitarias; nunca imprime valores |
| `scripts/rehearsal/replica-inventory.mjs collect/compare` | inventario con hashes y comparacion | pruebas unitarias; ejecutado contra la replica desechable del E2E |
| `scripts/verify-notes-installer-e2e.mjs` | el flujo completo sobre una replica **sintetica** | 19 de 19 con las imagenes certificadas |

Limitaciones: ninguna herramienta se ha ejecutado contra un respaldo real; el aislamiento de
red no se puede comprobar en el equipo de desarrollo actual sin una maquina o red dedicada.
