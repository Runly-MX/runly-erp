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

## Procedimiento del primer staging (cuando se autorice)

Todo en una instancia independiente (VPS y Supabase propios, sin datos de producción, IP en el firewall), nunca en la instalación de producción.

1. Datos: copia anonimizada de una instalación previa, o sitios, formularios con respuestas y productos publicados sintéticos.
2. Respaldo `complete` y registro de digests vigentes (sección anterior).
3. Con autorización explícita: `git push origin main` y anotar el SHA (`git rev-parse HEAD`).
4. Previsualizar: `node infra/docker/release-selective.mjs --images=api,web`.
5. Construir: `node infra/docker/release-selective.mjs --images=api,web --build`.
6. Publicar etiquetas SHA: `node infra/docker/release-selective.mjs --images=api,web --push --confirm=<sha12>`.
7. En el servidor de staging, tras añadir y rellenar las variables `RUNLY_WEBSITE_*` y `RUNLY_APP_URL` en `.env.external`: apuntar `RUNLY_API_IMAGE` y `RUNLY_WEB_EXTERNAL_IMAGE` a las etiquetas SHA y ejecutar `RUNLY_INSTALLER_REF=<sha completo> ./update-external.sh`. Así staging no depende de `-latest` (probado en laboratorio con etiquetas SHA e IDs; falta probarlo contra un registro real).
8. Verificar: `/health`; sitios históricos con sus URLs; `catalog_mode` `legacy_all` en los previos; respuestas de formularios intactas; crear, publicar, activar y revertir un sitio; importar un ZIP y comprobar el origen aislado desde un navegador real; `/app` no responde en hostnames de sitio.
9. Repetir `update-external.sh` y comprobar que no cambia nada.
10. Solo con staging aprobado y autorización aparte: `--promote --confirm=<sha12>` para producción.

## Reversión

Las migraciones son hacia adelante y aditivas; Prisma no las revierte. El ensayo comprobó que la imagen API anterior arranca contra la base migrada y sirve el sitio histórico por `/website/site`; el multisitio no existe en esa imagen. Ante fallo: volver a las etiquetas SHA anteriores (o el digest registrado) y, si hay daño de datos, restaurar el respaldo en un destino aislado antes de tocar producción. Un refresco interrumpido no cambia nada y se repite; una migración fallida queda sin terminar y no se continúa sin revisar (`STUDIO_FAILURE_REQUIRES_REVIEW`, `INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`).

## Bloqueos antes de un despliegue seguro

1. **Registro global de subdominios**: el núcleo está implementado y probado en laboratorio (Developer Hub + integración Website, ver `website-subdomain-registry-proposal.md`) pero **no desplegado**. Corrección de un error de este documento: `POST /website/sites/:id/domains` sí existía, pero solo reservaba con unicidad local y nada hacía la transición `pending` a `assigned`; el registro y la sincronía lo resuelven. Sin registro desplegado y un namespace listo, los sitios nuevos no tienen subdominio automático.
2. **Dominio registrable independiente** con DNS comodín y certificado para ZIP y vista previa: decisión y compra externas.
3. `main` no está en GitHub ni hay imágenes publicadas: el actualizador instalaría el `main` previo.
4. El ensayo del instalador no usa DNS, TLS, edge ni caché reales ni datos reales; el hostname se asigna por SQL allí. El laboratorio del registro (`pnpm test:website:registry`) sí reserva y activa por la API real.
5. `release-selective.mjs --push/--promote` sin probar contra un registro (sí `--build` y `--dry-run`).
6. Pendientes sin automatizar: touch real, lector de pantalla, caché real en CDN.

## Laboratorio frente a staging real

Demostrado en laboratorio local desechable: lógica, permisos, aislamiento entre empresas, instalación y actualización con el instalador real e imágenes empaquetadas, persistencia de variables y secretos, migraciones sobre datos históricos, gateway Nginx real con hostnames `.test`. No demostrado: DNS, TLS, edge, caché de CDN, actualización con datos reales, rendimiento y operación. Este documento no declara apta ninguna instalación real.
