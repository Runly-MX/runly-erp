# Website: candidato de staging

Estado: APTO en laboratorio local desechable para los recorridos de `pnpm test:website:e2e`. **No hay despliegue autorizado ni hosting validado en infraestructura real.** Este documento separa lo que ya se demostró de lo que solo se podrá demostrar en staging.

## Batería E2E

`pnpm test:website:e2e` construye un laboratorio nuevo (PostgreSQL, Auth, Storage, API y Vite reales, usuarios de dos empresas), ejecuta cinco scripts en orden y elimina contenedores y volúmenes propios al terminar, también si falla. Dependencias deliberadas: `functional-browser` crea el sitio base; `sections-browser` añade un segundo sitio; `dependencies` concede permisos y escribe `dependencies-fixture.json`; `dependencies-browser` lo consume; `final` comprueba aislamiento entre empresas, salida pública sin credenciales y accesibilidad. Prerrequisitos: Docker, imágenes base ya descargadas (los scripts usan `--pull=never`), `pnpm install`. Windows (usa `taskkill`).

Prueba adicional de empaquetado: `node scripts/test-website-origin-installer.mjs` valida con Nginx real `infra/nginx/spa.conf` y `infra/installer/nginx/spa.conf` (gateway por hostname, sitio público sin acceso al shell del ERP).

## Qué publica cada comando (verificado leyendo el código, sin ejecutarlos)

| Comando | Hace | Efectos |
|---|---|---|
| `pnpm docker:release:check` | dry-run | Solo lista imágenes con cambios desde el último release de esta máquina (`infra/docker/.release-state.json`). Hoy: API, Worker, Web y DWG (sin release previo). |
| `pnpm docker:release` | `buildx` y `push` a `raulbellosom/runlyerp:<imagen>-latest` | Publica en Docker Hub; solo amd64 salvo `--arm64` (un push amd64 reemplaza el manifiesto multiarquitectura). Valida primero `installer-release.json`. **No** publica los scripts del instalador. |
| `infra/installer/update-external.sh` / `update-local.sh` | Resuelven el SHA de `main` en GitHub (o `RUNLY_INSTALLER_REF`, 40 hex), descargan bootstrap y cargador con hash fijado, verifican todos los archivos del manifiesto, sustituyen con diario reversible, y ejecutan `setup-*.mjs` | Migraciones (`prisma migrate deploy`), seed, recreación de contenedores, `/health`. Instalan el `main` **publicado en GitHub**, no el local. Rechazan ejecutarse sin `.env.external`. |

Consecuencia: para que una instalación reciba Website hay que (1) publicar `main` en GitHub, (2) publicar las imágenes, (3) ejecutar el actualizador con `RUNLY_INSTALLER_REF` fijado al SHA aprobado. Las migraciones no se revierten solas.

## Contenido del paquete

- API: migraciones (`prisma/`), rutas y servicios Website, blueprints de plantillas, runtime público compilado (`build-website-public-runtime.mjs` en `api.Dockerfile`), `atlas-web-builder` 0.2.4 y SDK.
- Web: SPA y `nginx` con gateway por hostname y `admin-origin-check`.
- Instalador: `installer-release.json` verificado por `docker:release`.
- Migraciones de Website, todas aditivas: `20260528120000` a `20260911190000` (tablas históricas), `20261102093000_website_identity_drafts`, `20261102110000_website_releases`, `20261102140000_website_import_preview`, `20261102180000_website_form_scope`, `20261218120000_website_catalog_selection`. La última marca los sitios existentes como `legacy_all` (visibilidad histórica sin cambios) y los nuevos como `explicit`.

## Capacidades del primer despliegue

Habilitadas (probadas en laboratorio): varios sitios por empresa; configuración, tema, menús y Blog por sitio; páginas con builder 0.2.4, borradores, conflictos 409, vista previa, publicación, historial y rollback; retirada explícita de entradas; plantillas aplicadas al sitio elegido con confirmación; selección de Catálogo por sitio con `usedBy`; formularios con FormScope y respuestas; importación de ZIP estático; permisos y aislamiento entre empresas.

Deshabilitadas o fuera de alcance: Calendar (sin contrato público de reservas), checkout y cobros (las claves de Stripe se guardan, sin flujo de cobro certificado), dominios propios, detección de cambios locales sin guardar del builder, y subdominios automáticos `*.sites.runly.mx` hasta resolver el bloqueo de abajo.

## Configuración de staging

El instalador ahora añade las tres claves `RUNLY_WEBSITE_*` en blanco a `.env.external` (plantilla `.env.external.example`, solo si faltan) y nunca modifica un valor existente. El administrador las rellena una vez y las actualizaciones posteriores las conservan; esto se comprobó en el ensayo del instalador. Compose las pasa al API con `env_file`. Ejemplos, no valores reales:

```
RUNLY_APP_URL=https://erp.staging.example.com
RUNLY_WEBSITE_NAMESPACE_ROOT=sites.staging.example.com
RUNLY_WEBSITE_CONTENT_ROOT=content.staging-sites.example.net
RUNLY_WEBSITE_PREVIEW_ROOT=preview.staging-sites.example.net
```

Sin valores, la publicación aislada responde 409 `isolation_required` (falla cerrado). `RUNLY_APP_URL` debe ser un nombre de dominio HTTPS (no una IP) para que el aislamiento pueda comparar dominios registrables.

Reglas del código (`website-content-isolation.js`): las raíces de contenido y vista previa no pueden estar bajo `runly.mx`, ni compartir dominio registrable con el origen del ERP, y requieren HTTPS. El API crea el bucket privado `runly-website-releases` al arrancar (antes nada lo creaba, ver Hallazgos).

## Hallazgos corregidos por el ensayo del instalador

El ensayo con imágenes empaquetadas encontró dos defectos que el laboratorio de desarrollo ocultaba porque preparaba el entorno a mano:

1. Nada creaba el bucket privado `runly-website-releases`: publicar habría respondido 503 en una instalación nueva. Ahora lo crea `ensureBuckets()`.
2. El runtime público se buscaba relativo al directorio de trabajo; en el contenedor el API arranca en `/app/apps/api`, así que la ruta no existía y preparar un release fallaba. Ahora se resuelve respecto al código (`RUNLY_WEBSITE_RUNTIME_DIR` sigue siendo válida).

## Ensayo del instalador

`node scripts/verify-website-installer-e2e.mjs --api-image=... --worker-image=... --web-image=...` (imágenes de `node scripts/build-local-api-image.mjs --kinds=api,worker,web`, construidas desde `git archive` del commit). Usa una pila Supabase desechable, un origen de distribución controlado (sin GitHub ni registro; pulls y prunes son no-ops) y el `update-external.sh` real partiendo de la versión previa del instalador y de la imagen API anterior (`runly-realtime2:full-api-fa6f6d2a2877`). Comprueba: actualización del instalador, claves Website añadidas una vez y en blanco, valores previos intactos, migraciones aplicadas, sitio/página/formulario/respuesta históricos sin cambios, `catalog_mode=legacy_all`, bucket privado, acceso administrativo, valores del administrador que sobreviven a otra actualización, publicación de un sitio y resolución por el Nginx empaquetado (el host del sitio no sirve `/app`; el origen administrativo sí; un host sin asignar no resuelve), repetición sin cambios, fallo controlado de refresco (corrupción) sin efectos y con el sitio sirviendo, recuperación, y que la imagen API anterior arranca contra la base migrada. Ninguna salida contiene credenciales (se verifica). Hay además dos escenarios con `--only=`: `website-external-fresh-install` (instalación external sobre base vacía con el instalador actual, mismas verificaciones de variables, secretos, publicación y repetición) y `website-image-references` (etiquetas `<imagen>-<sha12>` y IDs de imagen como referencias: el contenedor corre exactamente esa imagen, `.runly-installer/images.json` registra referencia e ID, la selección sobrevive a otra actualización, no aparece `latest`, y un cambio de la referencia a la imagen de `cc350912a174` devuelve el contenedor a esa imagen sin tocar el esquema, y vuelta adelante). El instalador ya fija las imágenes por ID tras resolverlas y exige la etiqueta `io.runly.installer.contract`, que las tres Dockerfiles incluyen. Limitaciones: sin DNS ni TLS reales; las referencias `repo@sha256:` de un registro no se probaron (requieren registro); el hostname del sitio se asigna por SQL porque no existe ruta REST para reservarlo.

## DNS y TLS recomendados

- Origen del ERP: dominio actual (`erp.<dominio>`).
- ZIP/JS no confiable: **otro dominio registrable** (ejemplo `staging-sites.example.net`) con comodín `*.content` y `*.preview`; certificado comodín (DNS-01) por separado. Sin cookies compartidas con el ERP.
- Sitios del builder: `*.sites.<dominio>` puede vivir bajo el dominio de marca solo si no ejecuta JS arbitrario; aun así la raíz de contenido del código la rechaza bajo `runly.mx`, por lo que `*.sites.runly.mx` hoy solo sirve como `NAMESPACE_ROOT`, no como `CONTENT_ROOT`.
- Nginx/Caddy termina TLS y envía `Host` intacto al contenedor web; el gateway resuelve por hostname. Dominios reservados en código: admin, api, app, auth, login, public, preview, support, status, www, mail, erp, mcp, runly, atlas, internal, system.
- Caché: las páginas públicas se sirven desde releases inmutables; la activación cambia el puntero. Verificar en staging encabezados de caché tras activar y tras rollback.

## Servicios y variables nuevos para un staging con registro

| Elemento | Detalle |
|---|---|
| Developer Hub | Aplicar `20261103000000_subdomain_registry.sql` y desplegar `/registry/v1`. Variables opcionales del servicio: `REGISTRY_MAX_NAMES` (500), `REGISTRY_CLAIMS_PER_HOUR` (60), `REGISTRY_QUARANTINE_DAYS` (90). Expone un host accesible por las instalaciones. |
| Operador | Con una cuenta de administrador de plataforma: enrolar cada instalación (`POST /api/v1/admin/registry/installations`), registrar el namespace (`.../namespaces`, `ready:false` hasta que DNS, TLS y edge existan) y activarlo (`ready:true`) solo entonces. |
| Instalación | `node scripts/registry-installation-key.mjs --env-file .env.external` genera la llave (la privada queda en el archivo, la pública se entrega al operador); rellenar `RUNLY_REGISTRY_URL` y `RUNLY_INSTALLATION_ID`. El instalador añade las tres claves en blanco y no las sobrescribe. Opcional: `RUNLY_REGISTRY_SYNC_MS`. |
| Migración ERP | `20261219120000_website_registry_projection` (aditiva; las filas históricas de `website_domain` siguen siendo de solo anexión). |
| Edge y DNS | Wildcard `*.sites.<dominio>` hacia el edge, certificado wildcard (DNS-01), y dominio independiente con wildcard para ZIP y vista previa. Nada de esto existe aún. |

## Registro, Edge y claves en un staging con varias instalaciones

Piezas (todas probadas solo en laboratorio): Developer Hub con las migraciones `20261103000000` y `20261103010000`; Runly Edge (`pnpm edge` en el Hub); cada ERP con las tres variables del registro. Ninguna está desplegada.

| Pieza | Variables y operación |
|---|---|
| Hub (registro) | `REGISTRY_TRUSTED_PROXIES` (CIDR de los proxies que pueden fijar `X-Forwarded-For`), `REGISTRY_IP_LIMIT_PER_MIN`, `REGISTRY_READ_LIMIT_PER_MIN`, `REGISTRY_WRITE_LIMIT_PER_MIN`, `REGISTRY_MAX_NAMES`, `REGISTRY_CLAIMS_PER_HOUR`, `REGISTRY_QUARANTINE_DAYS`. La ruta firmada incluye `/registry/v1`: el proxy no debe reescribirla. |
| Edge | `EDGE_REGISTRY_URL`, `EDGE_ID`, `EDGE_PRIVATE_KEY` o `EDGE_PRIVATE_KEY_FILE`, `EDGE_NAMESPACES`, `EDGE_TLS_CERT_FILE`/`EDGE_TLS_KEY_FILE`, `EDGE_TRUSTED_PROXIES`, `EDGE_CACHE_TTL_MS` (30 s), `EDGE_NEGATIVE_TTL_MS` (5 s), `EDGE_MAX_STALE_MS` (15 min), `EDGE_ADMIN_PORT`/`EDGE_ADMIN_TOKEN`. `EDGE_ALLOW_HTTP_ORIGINS` y `EDGE_ALLOW_PRIVATE_ORIGINS` son solo de laboratorio y el proceso se niega a arrancar con ellas si `NODE_ENV=production`. |
| ERP | `RUNLY_REGISTRY_URL`, `RUNLY_INSTALLATION_ID`, `RUNLY_INSTALLATION_PRIVATE_KEY` (o `RUNLY_INSTALLATION_PRIVATE_KEY_FILE`), `RUNLY_WEBSITE_NAMESPACE_ROOT`, y opcionales `RUNLY_REGISTRY_SYNC_MS` (60 s) y `RUNLY_REGISTRY_MAX_STALE_MS` (24 h). |

Alta de una instalación: (1) `node scripts/registry-installation-key.mjs --env-file .env.external` genera la llave (no se imprime) y muestra la pública; (2) un administrador de plataforma llama a `POST /api/v1/admin/registry/installations` con `{label, publicKey, originUrl}` (el origen es la URL pública estable del gateway de esa instalación) y recibe el id; (3) se rellenan `RUNLY_REGISTRY_URL` y `RUNLY_INSTALLATION_ID` y se reinicia la API. El Edge se enrola igual con `kind:"edge"`. El namespace se registra con `ready:false` y solo se pasa a `true` cuando DNS, certificado y Edge existen.

Rotación: `--rotate` (la anterior sigue válida 24 h), reiniciar la API, `--revoke-previous`. Compromiso: `POST /api/v1/admin/registry/keys/revoke` con la huella (inmediato) y `.../keys/enroll` tras verificar al titular. Los instaladores conservan los valores existentes y no los imprimen (verificado en el ensayo del instalador, incluida la rotación editando el archivo).

## Release de imágenes selectivo e inmutable

`node infra/docker/release-selective.mjs` (alias `pnpm docker:release:selective`) sustituye a `pnpm docker:release` para Website: solo api, web y worker (DWG y el resto quedan en `build-push.mjs`), etiqueta `<imagen>-<sha12>` del commit exacto, nunca toca `-latest` por sí mismo, y registra en `.artifacts/releases/<sha12>.json` el digest de cada imagen y el digest previo de `-latest` para revertir.

| Modo | Efecto |
|---|---|
| (por defecto) plan | Imprime commit y etiquetas; no construye ni publica. |
| `--build` | Construye localmente desde `git archive` del SHA. |
| `--push --confirm=<sha12>` | Publica solo etiquetas SHA; rechaza cualquier etiqueta que ya exista en el registro. |
| `--promote --confirm=<sha12>` | Apunta `-latest` a un digest ya publicado y escribe el comando exacto de reversión. |

Probado: 6 pruebas unitarias (argumentos, imágenes no permitidas, confirmación obligatoria, plan, y `--dry-run` de push y promote que imprime los comandos sin ejecutarlos). `--build` se ejecutó de verdad para api, web y worker del commit `0134b780a8c6` y para api de `cc350912a174`: producen `raulbellosom/runlyerp:<imagen>-<sha12>` y un registro con el ID de imagen; las etiquetas `-latest` locales existentes y la imagen DWG no cambiaron (mismos IDs antes y después; el script no puede seleccionar DWG). `RUNLY_RELEASE_REGISTRY` redirige todas las etiquetas a otro registro. **No probado**: `--push` y `--promote` reales: esta máquina no tiene una imagen de registro local y descargarla exigiría acceso a Docker Hub, así que no se ejecutaron; el mecanismo sí admite un registro local desechable (`RUNLY_RELEASE_REGISTRY=localhost:<puerto>/runlyerp`) cuando se disponga de uno. `build-push.mjs` y `docker:release` siguen existiendo y siguen sobrescribiendo `-latest`; no usarlos para Website.

## Respaldo y recuperación

Antes de cualquier actualización: respaldo `complete` (base, buckets, módulos y configuración; requiere `BACKUP_STORAGE_S3_*` en modo external, ver `docs/deployment/backup-recovery.md`) y copia fuera del servidor del material de recuperación. Guardar `docker image inspect --format '{{index .RepoDigests 0}}'` de las imágenes en ejecución. La restauración de prueba va a un destino aislado con API y worker detenidos hasta recuperar base y archivos. El bucket `runly-website-releases` forma parte del respaldo: sin él los releases publicados no se pueden servir ni revertir.

## Procedimiento operativo: staging completamente independiente (Hub, Edge y dos ERP)

Nada de esto se ha ejecutado. Requiere tu autorización explícita para publicar imágenes y para tocar servidores. Convención: `<stg>` es la zona DNS de staging (no `runly.mx`), `HUB_SHA=b16de4a0065c71cdc4a4fb742997734db79b8359` (main local del Hub), `ERP_SHA=dc704354110379c192137ee657a54152d1e1cf2e` (etiqueta `dc7043541103`). Todos los hosts son de staging, sin datos ni credenciales de producción.

### 0. Hosts y DNS (solo zona de staging)

| Host | Función | Registros |
|---|---|---|
| H (Hub) | Hub + Supabase propio, Nginx del Hub | `devs.<stg>`, `api.devs.<stg>`, `mcp.devs.<stg>`, `supabase.devs.<stg>` (A hacia H) |
| H (Edge) | Edge en el mismo host, en `127.0.0.1:14060`, detrás del Nginx de H que termina TLS (ver 2.7) | `*.sites.<stg>` (A/AAAA hacia H) |
| E1, E2 | ERP en modo external, cada uno con su Supabase | `erp1.<stg>`, `erp2.<stg>` y el origen público del gateway de cada uno (su Nginx web) |

Certificados: los del Hub los emite `prod:tls` (HTTP-01). El comodín `*.sites.<stg>` debe emitirse fuera de banda (DNS-01) con una CA de staging o interna y copiarse a H en `/etc/runly-devhub/tls/sites.crt.pem` y `sites.key.pem` (root, 0600; solo Nginx los lee). Las variables del Edge no admiten rutas fuera de `/etc/runly-devhub/` ni claves en línea. Alternativa que `prod:setup` no cubre: Edge en un host propio con `EDGE_TLS_CERT_FILE`/`EDGE_TLS_KEY_FILE` sirviendo TLS directo en 443 (unidad y entorno instalados a mano); no es posible en el mismo host que el Nginx del Hub (conflicto del puerto 443).

### 1. Imágenes del ERP (con tu autorización de publicación)

Desde la raíz del ERP, en el commit `ERP_SHA`:

    node infra/docker/release-selective.mjs --images=api,web,worker --ref=dc704354110379c192137ee657a54152d1e1cf2e --build
    node infra/docker/release-selective.mjs --images=api,web,worker --ref=dc704354110379c192137ee657a54152d1e1cf2e --push --confirm=dc7043541103

Anota los digests de `raulbellosom/runlyerp:*-latest` vigentes antes de promover. Para el staging NO se ejecuta `--promote`: E1 y E2 usan las etiquetas por SHA (paso 5). DWG no interviene. No usar `pnpm docker:release`.

### 2. Hub en H (primera instalación)

1. `git clone <repositorio del Hub> /opt/runly-developer-hub && cd /opt/runly-developer-hub && git checkout b16de4a0065c71cdc4a4fb742997734db79b8359`
2. Pre-genera la identidad del Edge (el id se elige ahora para poder configurarlo antes de enrolarlo):

        EDGE_ID=$(node -e "console.log(crypto.randomUUID())")
        sudo useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin runly-devhub-edge
        sudo node -e "const c=require('node:crypto'),f=require('node:fs');const k=c.generateKeyPairSync('ed25519');f.writeFileSync('/etc/runly-devhub/edge.key',k.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64url')+'\n',{mode:0o640});console.log('EDGE_PUBLIC_KEY='+k.publicKey.export({format:'jwk'}).x)"
        sudo chown root:runly-devhub-edge /etc/runly-devhub/edge.key

   Guarda el `EDGE_PUBLIC_KEY` impreso (la privada no se imprime).
3. `sudo cp .env.production.example /etc/runly-devhub/production.env && sudo chmod 600 /etc/runly-devhub/production.env` y rellénalo con los valores de staging (según el runbook Beta del Hub). Añade: `EDGE_ENABLED=true`, `EDGE_REGISTRY_URL=https://api.devs.<stg>`, `EDGE_ID=<EDGE_ID>`, `EDGE_PRIVATE_KEY_FILE=/etc/runly-devhub/edge.key`, `EDGE_NAMESPACES=sites.<stg>`, `EDGE_HOST=127.0.0.1`, `EDGE_PORT=14060`, `EDGE_TRUSTED_PROXIES=127.0.0.1`.
4. `sudo pnpm prod:preflight --env-file /etc/runly-devhub/production.env`
5. `sudo pnpm prod:setup --env-file /etc/runly-devhub/production.env --smoke-email <tu correo>`
   Instala y arranca la unidad `runly-devhub-edge.service`. Hasta que se enrole el Edge, sus peticiones al registro devuelven 401 y el Edge responde 503 (esperado).
6. Verifica: `sudo pnpm prod:status`, `curl -s -o /dev/null -w '%{http_code}' https://api.devs.<stg>/registry/v1/names` debe devolver 401, y `systemctl is-active runly-devhub-edge`.

7. Nginx para el comodín (una vez, a mano; `prod:setup` no lo gestiona): `sudo cp infra/production/nginx/edge-sites.conf.example /etc/nginx/conf.d/runly-edge-sites.conf`, sustituye `<stg>`, `sudo nginx -t && sudo systemctl reload nginx`.

### 3. Operador del registro (en H)

Crea o designa un administrador de plataforma (`pnpm platform:grant-admin`, ver su ayuda) y usa su id de usuario:

    OP="sudo -u runly-devhub node scripts/registry-operator.mjs --operator <ID del administrador>"
    $OP namespace --root sites.<stg> --ready false
    $OP enroll --id <EDGE_ID> --kind edge --label "edge staging" --public-key <EDGE_PUBLIC_KEY>

La unidad del Edge ya está corriendo: en cuanto se enrola deja de responder 503.

### 4. ERP en E1 y E2 (modo external, instalación independiente)

En cada ERP, con su `.env.external` ya completado según `infra/installer/README.md` y sin tocar producción:

1. `node scripts/registry-installation-key.mjs --env-file .env.external` (muestra la clave pública; la privada queda en el archivo). Si usas un archivo de secreto, mueve la clave a `RUNLY_INSTALLATION_PRIVATE_KEY_FILE` con modo 0600.
2. En H, enrola cada instalación con el origen público de su gateway:

        $OP enroll --label "erp1 staging" --public-key <clave pública de E1> --origin https://erp1.<stg>

   Anota el `id` devuelto.
3. En `.env.external` de cada ERP: `RUNLY_REGISTRY_URL=https://api.devs.<stg>`, `RUNLY_INSTALLATION_ID=<id>`, `RUNLY_WEBSITE_NAMESPACE_ROOT=sites.<stg>`, `RUNLY_APP_URL=https://erp1.<stg>` (HTTPS y nombre de dominio), y `RUNLY_WEBSITE_CONTENT_ROOT`/`RUNLY_WEBSITE_PREVIEW_ROOT` solo si hay dominio independiente para ZIP.

### 5. Actualizar los ERP a las imágenes por SHA

En E1 y E2, antes de actualizar, fija en `.env.external`:

    RUNLY_API_IMAGE=raulbellosom/runlyerp:api-dc7043541103
    RUNLY_WORKER_IMAGE=raulbellosom/runlyerp:worker-dc7043541103
    RUNLY_WEB_EXTERNAL_IMAGE=raulbellosom/runlyerp:web-dc7043541103

y ejecuta `RUNLY_INSTALLER_REF=<SHA de 40 caracteres ya publicado en GitHub> ./update-external.sh`. El instalador conserva esas referencias entre actualizaciones, las fija por ID de imagen y no usa `latest`; para volver atrás cambia las tres variables por las etiquetas anteriores y repite el comando (probado en laboratorio: ida, vuelta y repetición no tocan el esquema). El `RUNLY_INSTALLER_REF` requiere que el commit esté publicado, lo que necesita tu autorización de push.

### 6. Activación y verificación

1. Con DNS, certificado y Edge funcionando: `$OP namespace --root sites.<stg> --ready true`.
2. En cada ERP (administrador de empresa): Website, Dominios, Comprobar disponibilidad, Reservar y Activar el mismo nombre en E1 y E2 (solo uno lo obtiene); publicar un sitio.
3. `curl --resolve <nombre>.sites.<stg>:443:<IP de H> https://<nombre>.sites.<stg>/` debe devolver la página del sitio con `data-release` igual al release activo; un nombre sin reservar, 404.
4. Repite con tiempos reales: suspensión (`$OP name-state --hostname ... --state suspended --reason ...`, efecto en menos de 30 s en el Edge y 60 s en el ERP), apagar E1 (502 solo para sus nombres), detener el API del Hub unos minutos (el Edge sirve rutas confirmadas hasta 15 min y luego 503), y rotación de clave (`--rotate`, reinicio, `--revoke-previous`).
5. Hub y Edge se actualizan después con `git pull && sudo pnpm prod:update` en H: el Edge no se detiene durante la actualización del Hub. Cambiar la configuración del Edge (por ejemplo `EDGE_NAMESPACES`) exige una nueva revisión del Hub, como cualquier cambio de configuración del instalador del Hub.

### Reversión

Hub: `sudo pnpm prod:rollback`. Edge: `sudo systemctl stop runly-devhub-edge` (los sitios dejan de resolverse públicamente; las instalaciones siguen sirviendo a quien las contacte directamente). ERP: variables de imagen a las etiquetas anteriores y `./update-external.sh`. Registro: sin borrados; un nombre problemático se suspende con `name-state`.

## Reversión

Las migraciones son hacia adelante y aditivas; Prisma no las revierte. El ensayo comprobó que la imagen API anterior arranca contra la base migrada y sirve el sitio histórico por `/website/site`; el multisitio no existe en esa imagen. Ante fallo: volver a las etiquetas SHA anteriores (o el digest registrado) y, si hay daño de datos, restaurar el respaldo en un destino aislado antes de tocar producción. Un refresco interrumpido no cambia nada y se repite; una migración fallida queda sin terminar y no se continúa sin revisar (`STUDIO_FAILURE_REQUIRES_REVIEW`, `INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`).

## Bloqueos antes de un despliegue seguro

1. **Registro global de subdominios**: el núcleo está implementado y probado en laboratorio (Developer Hub + integración Website, ver `website-subdomain-registry-proposal.md`) pero **no desplegado**. Corrección de un error de este documento: `POST /website/sites/:id/domains` sí existía, pero solo reservaba con unicidad local y nada hacía la transición `pending` a `assigned`; el registro y la sincronía lo resuelven. Sin registro desplegado y un namespace listo, los sitios nuevos no tienen subdominio automático.
2. **Dominio registrable independiente** con DNS comodín y certificado para ZIP y vista previa: decisión y compra externas.
3. `main` del ERP no está en GitHub ni hay imágenes publicadas: `RUNLY_INSTALLER_REF` exige un commit publicado. El Hub tampoco está desplegado.
4. El ensayo del instalador no usa DNS, TLS, edge ni caché reales ni datos reales; el hostname se asigna por SQL allí. El laboratorio del registro (`pnpm test:website:registry`) sí reserva y activa por la API real.
5. `release-selective.mjs --push/--promote` sin probar contra un registro (sí `--build` y `--dry-run`).
6. La unidad systemd del Edge y su integración en el instalador del Hub están cubiertas por pruebas (configuración, arranque, reinicio, apagado, ausencia de secretos), pero no se ejecutaron bajo systemd real (no hay systemd en el entorno de pruebas) ni el Nginx de ejemplo del Edge se ha probado contra un Nginx real.
7. Pendientes sin automatizar: touch real, lector de pantalla, caché real en CDN.

## Laboratorio frente a staging real

Demostrado en laboratorio local desechable: lógica, permisos, aislamiento entre empresas, instalación y actualización con el instalador real e imágenes empaquetadas, persistencia de variables y secretos, migraciones sobre datos históricos, gateway Nginx real con hostnames `.test`. No demostrado: DNS, TLS, edge, caché de CDN, actualización con datos reales, rendimiento y operación. Este documento no declara apta ninguna instalación real.

## Instalación autónoma (sin Developer Hub)

Una instalación puede administrar sus propios subdominios sin registro global. Configuración mínima en el env de la instalación:

```
RUNLY_APP_URL=https://erp.ejemplo.com
RUNLY_WEBSITE_NAMESPACE_ROOT=sitios.ejemplo.com
RUNLY_WEBSITE_CONTENT_ROOT=<dominio registrable distinto del ERP, solo para ZIP>
RUNLY_WEBSITE_PREVIEW_ROOT=<ídem, para vistas previas>
```

- DNS: `*.sitios.ejemplo.com` apunta al servidor de la instalación (con TLS comodín). Ese namespace es exclusivo de esta instalación: dos instalaciones no pueden usar el mismo sin coordinación (para eso existe el registro).
- No se necesitan `RUNLY_REGISTRY_URL`, `RUNLY_INSTALLATION_ID` ni `RUNLY_INSTALLATION_PRIVATE_KEY`. Si se define `RUNLY_REGISTRY_URL`, el registro decide los nombres; un registro mal configurado nunca cae a decisiones locales.
- Los nombres se reservan desde Website > Dominios (validación de formato, nombres reservados y colisiones en la base de la instalación). Un nombre liberado o de un sitio eliminado queda retirado y atado a su sitio: no se borra ni se reasigna.
- La raíz del hostname administrativo (`RUNLY_APP_URL`) redirige a `/app`; los sitios solo se sirven desde hostnames asignados y listos. `localhost` y `127.0.0.1` son siempre el ERP.
- Archivar un sitio lo deja de servir (sus nombres siguen reservados); restaurarlo lo devuelve como borrador sin republicar. Eliminar solo es posible desde Archivados, exige escribir el nombre del sitio y deja un registro retenido: nombres retirados, claves de pago y antispam borradas, auditoría conservada; páginas, versiones y respuestas permanecen sin referencias huérfanas.
