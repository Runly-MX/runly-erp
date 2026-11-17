# Studio Next 1.0: despliegue controlado a producción

Estado: **preparado, no ejecutado.** Sustituye a [STUDIO_NEXT_STAGING.md](STUDIO_NEXT_STAGING.md): no hay
staging independiente; la certificación se hizo en stacks desechables y en el Hub de laboratorio. Nada de este
documento se ha ejecutado en un VPS. Reutiliza [runly-studio-test-upgrade.md](runly-studio-test-upgrade.md)
(digests, override, rollback) y [backup-recovery.md](backup-recovery.md).

## Candidato certificado

| Pieza | Revisión |
| --- | --- |
| runly-erp `main` | `5010b69ae9d5f21c2de08cef3c95294dcdfcedbf` |
| runly-developer-hub `main` | `e20944be833bda56dfb42dc36f02cbed9a623533` (lock `ca778628`, 8 paquetes, `github-packages`) |
| runly-web `main` | `25223391b4c9ac26abcae095ed5e7941578dc2ea` |
| Paquetes compartidos | `0.1.0-source.ca778628b583480acfea3714083bc451c482f582` (run 44001841552). Desde entonces solo cambió `packages/sdk` (+`sendToWebsite`), que el Hub no usa: no se republica. |

Si cualquier `main` cambia antes de ejecutar, este candidato deja de valer: repetir la certificación afectada.

## Certificación integral (2026-11-16, stacks desechables)

ERP en `5010b69ae9d5f21c2de08cef3c95294dcdfcedbf`, imagen de API construida desde ese commit
(`runly-studio-verify:api-5010b69ae9d5`); Hub en `e20944be833b…` (clon limpio, dependencias instaladas desde
GitHub Packages, validador de laboratorio desde los tarballs publicados `ca778628`).

| Etapa | Script | Resultado |
| --- | --- | --- |
| Crear, Presentar, protocolo 3/4, paquete v2 en la API | `verify-studio-presentations.mjs` | 25/25 |
| Animar (efectos, vista previa, rendimiento) | `verify-studio-motion.mjs` | 14/14 (página de 100 objetos: 144 rAF/s, 0 fotogramas > 34 ms) |
| Línea de tiempo y keyframes | `verify-studio-timeline.mjs` | 22/22 |
| GIF / MP4 / WebM | `verify-studio-exports.mjs` | 10/10 (MP4 225 fotogramas 7,5 s; WebM VP9; GIF 90 fotogramas) |
| PPTX + Collabora | `verify-studio-pptx.mjs` | 9/9 |
| Paquete v2 → importar → editar → presentar; v1/v7; paquetes hostiles; permisos; empresas; instalación de la plantilla validada por el Hub | `verify-studio-package.mjs --hub-feed` | 9/9 (GIF y PNG idénticos tras importar e instalar) |
| Enviar a Website → Atlas → editar → guardar → reabrir | `verify-studio-website.mjs` | 6/6 |
| Hub unitarias | `node --test tests/*.test.js` | 708/0 (4 omitidas) |
| Hub plantilla v2 (MCP, validador publicado, revisión, firma lab, consumidor ERP) | `studio-package-v2.test.js` | 5/5 |
| Hub canal oficial, vistas previas, recursos | `studio-official`, `marketplace-previews`, `marketplace-resources` | 2/2, 12/12, 12/12 |
| Hub validación H3 y MCP | `marketplace-validation`, `marketplace-mcp` | 13/15 y 7/9: fallos preexistentes (#9 espera `COMMUNITY_MODERATOR_REQUIRED`, la API da `PLATFORM_AUTHORITY_REQUIRED`; #1 espera exactamente 6 herramientas «resource») |

Batería Website `pnpm test:website:e2e`: las partes sin navegador pasan (12 casos de dependencias, aislamiento
entre empresas, sin credenciales en la salida pública). Las cuatro de navegador (`functional-browser`,
`sections-browser`, `dependencies-browser`, `final`) fallan **igual en la revisión anterior a Studio → Website**
(`9f08c21c0`): buscan «Crear sitio en blanco» y la navegación «Secciones del sitio», que desaparecieron con el
rediseño del asistente de sitios (`8f21f8fd9`, 2026-11-03). En el candidato `functional-browser` además agota los
10 s del primer login en frío; el mismo login pasa en `sections-browser` y entre ambas revisiones no cambió código
de autenticación. Cobertura que falta hasta actualizar esas pruebas: creación de sitios con el asistente actual,
páginas, formularios, blog y navegación de secciones en navegador. El editor de páginas del sitio queda cubierto
por `verify-studio-website.mjs`.

## Estado de producción observado

Fuentes: endpoints públicos (2026-11-16) y la salida del preflight de solo lectura que ejecutó el operador en
el VPS `srv1997287`, que aloja el ERP (`/opt/runly-installer`, proyecto Compose `runlyerp`, 19 servicios) y el
Hub (`runly-devhub-prod`).

- **ERP**: `/api/health` ok. Bundle web con Studio hasta la Fase 5 (PPTX), todavía sin paquete v2 ni «Enviar a
  Website». `deployment-preflight` (PostgreSQL 17.6, solo lectura): 279 migraciones locales y 279 aplicadas,
  `pending: []`, `failed: []`, `unknownApplied: []`, `checksumMismatches: []`, `ready: true`; Studio, Documents
  y Automatizaciones instalados; permisos `studio.*` activos. **La migración v8 ya está aplicada.** El candidato
  `5010b69ae` tiene exactamente esas 279 migraciones (ninguna nueva desde `e598c3c27`): **el despliegue no aplica
  migraciones**. `BACKUP_MODE=enabled`.
- **Hub**: release actual `100be3165b8b…` (anterior `343e2f6a…`; conservadas también `b48a6af`, `ccea64a`),
  sin mantenimiento ni trabajos activos, 58/58 migraciones, todos los servicios sanos. Toolchain pública
  `afc28075`. Respaldo: Backblaze B2 configurado, alcanzable, prueba de escritura ok, ciclo diario 03:30
  (último éxito 2026-11-16 09:36 UTC; retención 14 diarios y 8 semanales).
- **Publicador de recursos**: tras reiniciarlo, `worker-status` → 4 publicados, 0 pendientes, 0 bloqueados,
  0 fallidos, sin atasco; antes del reinicio registraba `RESOURCE_PREFLIGHT_FAILED` (puerta cerrada). Tras
  `prod:update` a `e20944b` el lock pasa a `ca778628`; `669183d` reapunta su raíz de validador y reactiva la
  publicación. Verificar `worker-status` después del update.

Pendiente de observar: digests actuales de `runly-api-local`, `runly-web-local` y `runly-worker-local` (para el
rollback), el último snapshot del respaldo del ERP y su restauración, y `HUB_MARKETPLACE_VALIDATOR` /
`/srv/runly-devhub/validators/`.

## 1. Preflight de solo lectura (operador, en cada VPS)

ERP (carpeta real de la instalación; el modo `local` está documentado para `app.runly.mx`):

```bash
cd /opt/runly-installer
docker compose ls
for s in runly-api-local runly-web-local runly-worker-local; do
  docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}} {{index .Config.Labels "org.opencontainers.image.revision"}} {{.State.Health.Status}}' "$s"
done
docker image inspect --format '{{json .RepoDigests}}' "$(docker inspect --format '{{.Config.Image}}' runly-api-local)"
grep -E '^BACKUP_MODE=' .env.local
docker exec -w /app runly-api-local node prisma/deployment-preflight.mjs   # si la imagen actual no trae el script: paso 4
```

El preflight abre `BEGIN READ ONLY`, no imprime la conexión y lista `pending`, `failed`, `unknownApplied` y
`checksumMismatches`. Esperado: `20270107000000_studio_v8_protocol` ya aplicada (producción ejecuta las Fases 1–5)
o pendiente; ninguna fallida. Los desajustes de checksum de `20260902000000_chat_message_search` y
`20260911120000_notes_realtime_authorization` son conocidos (también en la base de desarrollo) y no bloquean.

Hub:

```bash
cd /opt/runly-developer-hub
git rev-parse HEAD && git status --short
sudo pnpm prod:status
sudo pnpm prod:backup-check
grep -E '^HUB_MARKETPLACE_VALIDATOR=' /etc/runly-devhub/production.env   # on = validador activado
ls /srv/runly-devhub/validators/                                     # raíces preparadas por revisión
```

Registrar: revisión desplegada, validador activado o no, raíz actual, estado del publicador de recursos y antigüedad
del último respaldo verificado.

**Criterio de parada**: si un respaldo de PostgreSQL **y** de Storage no se ha restaurado con éxito en otro lado,
o si hay migraciones fallidas, no se continúa.

## 2. Respaldos inmediatamente antes

- ERP: respaldo de PostgreSQL y de todos los buckets de Storage según [backup-recovery.md](backup-recovery.md)
  (con `BACKUP_MODE=enabled`, el contenedor `runly-backup-local`); anotar el snapshot y su hash.
- Hub: `sudo pnpm prod:backup` y `sudo pnpm prod:backup-check`.
- Guardar por servicio `Config.Image`, `Image ID` y `RepoDigest` actuales (rollback de código).

## 3. Imágenes del ERP con tag dedicado y digest

Desde un checkout limpio en `5010b69ae9d5f21c2de08cef3c95294dcdfcedbf` (no `latest`, no `docker:release:all`):

```bash
test "$(git rev-parse HEAD)" = 5010b69ae9d5f21c2de08cef3c95294dcdfcedbf && test -z "$(git status --porcelain)" || exit 1
RELEASE_SHA=5010b69ae9d5f21c2de08cef3c95294dcdfcedbf; REGISTRY=raulbellosom/runlyerp
for IMAGE in api worker web; do
  docker buildx build --builder runly-multiplatform --platform linux/amd64 --file "infra/docker/$IMAGE.Dockerfile" \
    --label "org.opencontainers.image.revision=$RELEASE_SHA" --tag "$REGISTRY:$IMAGE-studio-next-$RELEASE_SHA" --push . || exit 1
  docker buildx imagetools inspect "$REGISTRY:$IMAGE-studio-next-$RELEASE_SHA" --format '{{json .Manifest.Digest}}'
done
```

Anotar los tres digests (`API_DIGEST`, `WORKER_DIGEST`, `WEB_DIGEST`).

## 4. Preflight del candidato contra la base de producción (lectura)

```bash
docker run --rm --env-file .env.local --network <red-de-la-instalación> --entrypoint node \
  raulbellosom/runlyerp@$API_DIGEST prisma/deployment-preflight.mjs
```

`pending` debe contener solo migraciones aditivas de este candidato. Si aparece algo inesperado, parar.

## 5. Orden del despliegue (ventana de mantenimiento)

1. **ERP** (primero: acepta paquetes v1 y v2 y plantillas formato 2 antes de que el Hub las publique):
   ```bash
   cd /opt/runly-installer
   RUNLY_INSTALLER_REF=5010b69ae9d5f21c2de08cef3c95294dcdfcedbf \
   RUNLY_API_LOCAL_IMAGE=raulbellosom/runlyerp@$API_DIGEST \
   RUNLY_WORKER_LOCAL_IMAGE=raulbellosom/runlyerp@$WORKER_DIGEST \
   RUNLY_WEB_LOCAL_IMAGE=raulbellosom/runlyerp@$WEB_DIGEST \
   ./update-local.sh
   ```
   El actualizador descarga el instalador de esa SHA, hace pull, `prisma migrate deploy` (en orden de nombre),
   seed y recrea API, Web y Worker. Comprobar después que los contenedores usan los digests anotados.
2. **Comprobaciones del ERP**: `curl -fsS https://app.runly.mx/api/health`; `GET /studio/interchange/schema` con
   sesión → `formatVersion: 2`, `documentSchemaVersion: 8`, `readableFormatVersions: [1, 2]`; el bundle servido
   contiene «Enviar a Website» y ya no «no conserva las duraciones»; `deployment-preflight` con `pending: []`.
3. **Hub**:
   ```bash
   cd /opt/runly-developer-hub
   git fetch origin && git checkout --detach e20944be833bda56dfb42dc36f02cbed9a623533
   sudo pnpm prod:update
   sudo pnpm prod:status
   ```
   `prod:update` prepara la raíz del validador desde los paquetes publicados del lock `ca778628`; si el validador
   está activado define `MARKETPLACE_VALIDATOR_ROOT` con esa raíz y (desde `669183d`) reapunta el publicador de
   recursos y reactiva la publicación si ya estaba habilitada. Si el validador está desactivado, sigue así.
4. **Comprobaciones del Hub**: `GET /api/v1/health` → toolchain `ca778628b583…`; `runly_studio_contract` →
   `formatVersion: 2`, `documentSchemaVersion: 8`; el feed `marketplace/catalog/resources/index.json` sigue
   firmado (misma clave), con secuencia igual o mayor; en el ERP, Marketplace → plantillas de Studio carga con el
   catálogo «fresh».

## 6. Verificación funcional en producción (empresa de prueba, sin publicar)

Crear diseño de 3 páginas con foto → animar (entrada, keyframe) → línea de tiempo → Presentar → descargar GIF y
PPTX → Proyecto Studio (v2) → importarlo → Enviar a Website (sitio de prueba, borrador) → editar el texto en
Website → guardar y reabrir. Abrir un diseño antiguo (v7) y uno v8 existentes. Borrar después los datos de prueba
(el sitio de prueba nunca se publica). Cualquier criterio de rechazo de la sección 7 → rollback de código.

## 7. Fallos, rollback y cuándo detenerse

- **Antes de que corra la migración** (pull o preflight fallan): no hay cambios de esquema; reiniciar con los
  digests anteriores.
- **Migraciones**: todas aditivas. La v8 sustituye la función del trigger de protocolo (un escritor que no declare
  protocolo 4 no puede modificar documentos v8). No hay migraciones down.
- **Rollback de código permitido** mientras el esquema aplicado sea compatible con la imagen anterior (cambios
  aditivos): exportar las variables de imagen a los digests guardados y recrear solo los servicios
  (`docker compose … up -d --no-deps runly-api-local runly-web-local runly-worker-local`), **sin** seed ni migrate
  de la imagen antigua. Producción ya ejecuta las Fases 1–5, así que la API anterior ya lee documentos v8; lo que
  pierde es leer paquetes v2 (responde «versión más nueva») y «Enviar a Website». Los borradores Website ya
  creados se conservan; el editor anterior mostraría sus fotos privadas como imagen vacía sin perderlas.
- **Documentos v8 y paquetes v2 creados después del despliegue**: no se degradan ni se convierten; quedan intactos
  para la versión corregida. Nunca editar `_prisma_migrations` ni migraciones aplicadas; corregir hacia adelante.
- **Hub**: `sudo pnpm prod:rollback` vuelve a la release anterior conservada y se niega si la base tiene migraciones
  que esa release no conoce (forward-only). Los paquetes publicados son inmutables y no se borran.
- **Detenerse en lugar de restaurar la base**: en cuanto haya escrituras de usuarios posteriores al despliegue
  (diseños, archivos, borradores, publicaciones), restaurar el respaldo las perdería. Solo se restaura la base si la
  migración falla a medias **antes** de reabrir el tráfico; en cualquier otro caso: rollback de código y
  corrección forward.

## 8. Aceptación manual pendiente (no se aprueba por emulación)

**Microsoft PowerPoint** (Windows o Mac; anotar versión): abrir el PPTX exportado del proyecto de aceptación con
y sin video → comprobar 3 diapositivas en orden y la página cuadrada con franjas → editar un texto, mover y
recolorear una forma → guardar, cerrar y reabrir (cambios conservados, la foto sigue siendo una imagen aparte) →
Presentar: avance automático y fundido en la diapositiva 2 → diapositiva 4: el video MP4 se reproduce.
Resultado: pendiente.

**Teléfono físico** (anotar modelo y navegador): abrir Studio → editar un texto y mover una forma con el dedo →
añadir una entrada y un keyframe → abrir la línea de tiempo y mover un keyframe → Presentar y deslizar entre
páginas → descargar un PNG o GIF → comprobar que pellizcar, arrastrar y los menús responden sin bloquear el
desplazamiento de la página. Resultado: pendiente.
