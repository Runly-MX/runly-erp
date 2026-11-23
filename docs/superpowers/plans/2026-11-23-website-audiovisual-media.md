# Plan: audio y video en documentos Website (Fase B)

Spec: `docs/superpowers/specs/2026-11-23-website-audiovisual-media-design.md`.
Repos: ERP (`d:\RacoonDevs\runly`), Atlas (`d:\RacoonDevs\atlas-web-builder`), Hub
(`d:\RacoonDevs\runly-developer-hub`). Se trabaja sobre `main` de cada uno, con un commit por bloque
verificado. Las publicaciones de paquetes y los despliegues los hace el usuario.

## Hallazgos que fijan el plan

- La ruta pública `GET /public/website/releases/:releaseId/assets/:hash`
  (`apps/api/src/routes/website/public-release-routes.js:26`) devuelve el cuerpo completo, sin
  Range. Hay que agregarlo.
- Files (`apps/api/src/services/files-service.js:86`) solo admite `image/` y `text/`, con un tope
  de 10 MiB. Hay que abrir los seis MIME de audio/video, hasta 24 MiB, solo para `runly.website`.
- El servicio de releases (`website-release-service.js:194`) ya fija `file:` en campos
  `src|poster|url`. Se agrega `file` a su expresión regular (es el campo nuevo de `VideoBlock` y
  `AudioBlock`).
- Catálogos: el ERP lee `packages/contracts/website-builder-catalogs/` y el Hub los adopta con
  `scripts/adopt-website-catalog.mjs`, con el mismo procedimiento que se usó para Atlas 0.10.0
  (ERP `87b01501c`).

## Bloque 1 — Interchange (ERP, `packages/studio-interchange`)

1. `src/audiovisual.js`: mover `audiovisualContainer` y `AV_LIMITS` (copia exacta de
   `runly-developer-hub/packages/contracts/audiovisual.js`; el Hub pasa a importarlo desde el
   interchange en el bloque 4) y agregar `AV_MIME_BY_CONTAINER`.
2. `src/website-template.js`:
   - `WEBSITE_AV_POLICY = { name: 'packaged-media-v3', version: 3 }`, agregada a
     `WEBSITE_ASSET_POLICIES`, y las seis extensiones en `WEBSITE_ASSET_EXTENSIONS`.
   - Esquema de asset: unión entre el de imagen (actual) y el de audio/video
     (`kind`, `durationMs`, `width`/`height` solo en video, `poster`).
   - Límites v3: `avEntry` 24 MiB, `avAssets` 4, `avBytes` 48 MiB y `compressed` 64 MiB solo cuando
     `assetPolicy === packaged-media-v3`.
   - Regla de política: v3 si y solo si hay audio o video (igual que la regla SVG de la línea 232).
   - Validación de audio/video: firma con `audiovisualContainer`, `kind` y MIME coherentes, SHA, y
     póster con `validateImage` como WebP en `assets/<sha>.poster.webp`.
   - Props: `case 'video'` y `case 'audio'` con `ctx.asset(value, path, kind)`. `ctx.asset` comprueba
     el `kind`.
   - `EXCLUDED_BLOCKS`: se cambia por la regla «`VideoBlock` solo con `src` vacío y `file` de
     asset».
3. `src/website-write.js`: escribe audio, video y póster, y elige la política más alta que exija el
   contenido.
4. `src/inspect.js` (`validateImage` y la lista de extensiones): sin cambios para imágenes; solo se
   aceptan las entradas `.poster.webp` declaradas.
5. Pruebas en `src/__tests__/website-av.test.js`:
   - ida y vuelta v3 (MP4 y WAV sintéticos con cabeceras válidas);
   - SENDA y los fixtures v1/v2 conservan bytes idénticos;
   - un lector v2 rechaza v3;
   - YouTube en `VideoBlock` rechazado;
   - campo de video que apunta a un audio, rechazado;
   - límites (`avAssets`, `avBytes`, `entry`);
   - póster corrupto.

   Regresión: `node --test packages/studio-interchange/src/__tests__/`.
6. Commit en el ERP. El usuario republica `@runly-mx/studio-interchange`. Hasta entonces, el Hub
   prueba con `HUB_TEST_INTERCHANGE_DIR`.

## Bloque 2 — Atlas 0.11.0

1. `src/editor/fields/MediaField.jsx` (tipos `video` y `audio`): muestra el póster o un ícono,
   permite elegir de Medios y quitar, y guarda `asset.url` más `withAssetMeta` (`durationMs`,
   `posterUrl`). Se registra en `src/editor/fields/index.js`.
2. `src/blocks/VideoBlock.jsx`: campo `file` (tipo `video`) en el grupo "Video". En el render,
   `file` gana sobre `src`. `<video controls preload="metadata" playsinline>` usa como póster el
   campo `poster` o, si está vacío, `posterUrl`.
3. `src/blocks/AudioBlock.jsx` (nuevo, categoría media) con `file`, `title`, `caption` y `loop`.
   Renderiza `<audio controls preload="metadata">` con `aria-label`. Se registra en
   `src/blocks/index.js`.
4. `src/editor/assets/assetSource.js`: `mediaFieldKey(definition, kind)` y `assetProps` por
   `kind`. `MediaTab.jsx` filtra por `kind` y muestra el póster o un ícono de audio, y el drop llena
   el campo correcto.
5. Pruebas unitarias del render y de `assetProps`, más la matriz del editor (Chromium y Firefox
   reproducen; en WebKit de Windows solo se verifica la entrega).
6. Versión 0.11.0, changelog y catálogo publicado (digest nuevo). El usuario publica en npm.

## Bloque 3 — ERP (instalación, Files, entrega)

1. `files-service.js`: los seis MIME de audio/video, hasta 24 MiB, solo con
   `moduleKey === 'runly.website'`. Se agrega una prueba.
2. `website-template-preparation-service.js`: tope por MIME (8 MiB para imágenes, 24 MiB para
   audio/video) y enlace del póster como `FileAsset` propio. `mapWebsiteImages`
   (`website-document`) mapea `file` y `posterUrl`.
3. `website-release-service.js:194`: se agrega `file` a la expresión regular de campos fijables.
4. `public-release-routes.js`: Range de un solo intervalo (206, `Content-Range`,
   `Accept-Ranges: bytes`, 416 si es inválido), con la misma lógica que `media-response.js` del Hub.
   Se agrega una prueba.
5. Exporte estático: verificar que copia los archivos de audio/video, que `website-static-policy`
   ya admite.
6. Pin de Atlas 0.11.0 y catálogo en `packages/contracts/website-builder-catalogs/` (procedimiento
   de `87b01501c`).
7. Pruebas: los tests de Postgres de plantillas y releases ganan un caso v3 (instalar, publicar y
   GET con Range → 206).

## Bloque 4 — Hub

1. Pin del interchange republicado (`shared-packages.lock.json`, `prepare-shared-packages`) y
   adopción de Atlas 0.11.0 (`adopt-website-catalog.mjs`). `packages/contracts/audiovisual.js`
   reexporta desde el interchange, así que el código del Fase A no cambia.
2. `packages/contracts/media.js`:
   - `WEBSITE_DOCUMENT_MIMES(avPolicy)`;
   - `documentMedia(asset, scope, {av})` sustituye a `documentImage` en sus seis usos;
   - los assets de audio/video en proceso no son insertables.
3. `marketplace-validation/child.mjs` y su contrato: `audiovisual: { policy, mimes, limits } | null`
   según `WEBSITE_AV_POLICY` del lector instalado.
4. `media.js` y `media-tools.js`: el scope Website admite audio/video cuando el contrato y
   `HUB_MEDIA_AV` lo permiten, con confirmación asíncrona también en `runly_website_asset_confirm`
   (esquema con `state`, solo cuando está activo).
5. `website.js` (escritor): incluye original y póster desde Storage
   (`omitDocumentAssetBytes`) y aplica los límites v3.
6. Editor (`WebsiteEditor.jsx`, MessagePort):
   - `media-list` incluye audio/video con póster;
   - `media-resolve` de audio/video devuelve una URL de vista previa firmada y de corta duración
     (capacidad de descarga existente, 10 minutos), nunca base64;
   - `media-upload` acepta audio/video con sondeo.
7. Pruebas:
   - integración: guardar y reabrir un documento con video y audio, y exportar un ZIP v3
     inspeccionado;
   - E2E del editor: arrastrar un video a `VideoBlock` y reproducirlo en el iframe.
8. Plugins dev.26: skill y `media-assets.md` con `file`, `AudioBlock`, la regla de no terceros y
   los límites.

## Bloque 5 — Punta a punta

Plantilla de prueba con un MP4 (con póster) y un MP3:

1. Hub: guardar, reabrir y exportar.
2. ERP local: instalar en un sitio de prueba, publicar, reproducir con búsqueda dentro del archivo
   y verificar 206.
3. Actualizar la documentación (`docs/developers` si cambia el catálogo de bloques, y regenerar con
   `node scripts/generate-module-developer-docs.mjs`).

Después: despliegue del usuario y prueba real desde ChatGPT.

## Riesgos

- Publicaciones encadenadas: el Hub y el ERP necesitan el interchange y Atlas publicados antes de
  cerrar los bloques 3 y 4. Mientras tanto se usan los enlaces locales de prueba existentes.
- Los paquetes de hasta 64 MiB aumentan el tiempo de validación en el sandbox del Hub; hay que
  medirlo en el bloque 4 y ajustar `timeoutMs` del escritor si hace falta.
