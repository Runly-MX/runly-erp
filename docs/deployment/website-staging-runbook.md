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

Añadir a `.env.external` (el actualizador no la toca; Compose la pasa al API con `env_file`). Ejemplos, no valores reales:

```
RUNLY_APP_URL=https://erp.staging.example.com
RUNLY_WEBSITE_NAMESPACE_ROOT=sites.staging.example.com
RUNLY_WEBSITE_CONTENT_ROOT=content.staging-sites.example.net
RUNLY_WEBSITE_PREVIEW_ROOT=preview.staging-sites.example.net
```

El instalador no genera estas variables ni tiene pruebas que garanticen que `setup-external.mjs` conserva claves desconocidas: comprobarlo en el ensayo. Sin ellas la publicación aislada responde 409 `isolation_required` (falla cerrado).

Reglas del código (`website-content-isolation.js`): las raíces de contenido y vista previa no pueden estar bajo `runly.mx`, ni compartir dominio registrable con el origen del ERP, y requieren HTTPS. El bucket privado `runly-website-releases` debe existir en Storage y el rol de servicio tener acceso.

## DNS y TLS recomendados

- Origen del ERP: dominio actual (`erp.<dominio>`).
- ZIP/JS no confiable: **otro dominio registrable** (ejemplo `staging-sites.example.net`) con comodín `*.content` y `*.preview`; certificado comodín (DNS-01) por separado. Sin cookies compartidas con el ERP.
- Sitios del builder: `*.sites.<dominio>` puede vivir bajo el dominio de marca solo si no ejecuta JS arbitrario; aun así la raíz de contenido del código la rechaza bajo `runly.mx`, por lo que `*.sites.runly.mx` hoy solo sirve como `NAMESPACE_ROOT`, no como `CONTENT_ROOT`.
- Nginx/Caddy termina TLS y envía `Host` intacto al contenedor web; el gateway resuelve por hostname. Dominios reservados en código: admin, api, app, auth, login, public, preview, support, status, www, mail, erp, mcp, runly, atlas, internal, system.
- Caché: las páginas públicas se sirven desde releases inmutables; la activación cambia el puntero. Verificar en staging encabezados de caché tras activar y tras rollback.

## Procedimiento del primer staging (cuando se autorice)

1. Provisionar una instancia independiente (VPS y Supabase propios, sin datos de producción). Documentar su IP en el firewall.
2. Restaurar una copia anonimizada de una instalación Runly previa (o crear datos sintéticos con sitios, formularios con respuestas y productos publicados).
3. Respaldo completo previo (`complete`, con B2/S3 configurado) y anotar las versiones de imagen actuales. Una restauración de prueba va a un destino aislado.
4. Con autorización: `git push` de `main`, `pnpm docker:release:check`, `pnpm docker:release`, y anotar el SHA.
5. En el servidor: añadir las variables, crear DNS comodín y certificados de staging, `RUNLY_INSTALLER_REF=<sha> ./update-external.sh`.
6. Sincronizar módulos si el flujo lo requiere (`POST /modules/sync`) y reiniciar si cambiaron manifiestos.
7. Verificar: `/health`; sitios históricos conservan sus URLs; `catalog_mode` de sitios previos es `legacy_all`; respuestas de formularios intactas; crear sitio, publicar, activar, rollback; importar ZIP y comprobar el origen aislado desde un navegador real; que `/app` no responda en hostnames de sitio.
8. Repetir la actualización para comprobar idempotencia.

## Reversión

Las migraciones son hacia adelante y aditivas; Prisma no las revierte. Por inspección del SQL, el esquema nuevo debería tolerar imágenes anteriores (tablas nuevas y columnas con valor por defecto); no se ha probado una API antigua contra la base migrada, hacerlo en el ensayo. Ante fallo: volver a las imágenes anteriores por tag, y si hay daño de datos restaurar el respaldo en un destino aislado antes de tocar producción. Una migración fallida queda sin terminar; no continuar sin revisar (`STUDIO_FAILURE_REQUIRES_REVIEW`, ver `INSTALLER_UPDATE_SCRIPTS_BEHAVIOR.md`). Importante: los tags `-latest` se sobrescriben, así que anotar antes el digest de las imágenes vigentes.

## Bloqueos antes de un despliegue seguro

1. `*.sites.runly.mx` exige un registro global de slugs entre instalaciones; ese servicio no existe. Sin él, solo hostnames propios por instalación.
2. Falta un dominio registrable independiente con DNS comodín y certificado para ZIP/vista previa; sin él la importación de ZIP falla cerrada.
3. El instalador no provisiona ni prueba las variables `RUNLY_WEBSITE_*`.
4. `main` aún no está en GitHub ni hay imágenes publicadas: el actualizador instalaría el `main` previo.
5. Nunca se ha ejecutado el actualizador contra una instalación con datos reales ni el instalador completo con Website.
6. Pendientes sin automatizar: touch real, lector de pantalla, caché real en CDN.

## Laboratorio frente a staging real

Demostrado en laboratorio: lógica, permisos, aislamiento entre empresas, migración reversible en esquema temporal, gateway Nginx real con hostnames `.localhost`. No demostrado: DNS, TLS, caché de CDN, instalador completo, actualización con datos reales, rendimiento y operación.
