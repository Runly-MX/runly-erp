# Audio y video en documentos Website (Fase B)

Estado: propuesta, 2026-11-23. Sin implementar.
Antecedente: Fase A en Runly Developer Hub (`docs/specs/MEDIA_AUDIOVISUAL_LIBRARY.md` de ese repo,
commit `3529bde`): la biblioteca privada ya procesa MP4, WebM, M4A, MP3, Ogg y WAV con FFmpeg aislado,
póster WebP y metadata (`properties.av`). Patrón a seguir: SVG nativo
(`2026-11-23-native-svg-media-design.md`, política `packaged-media-v2`).

Repositorios: Runly ERP (`@runly/studio-interchange`, instalación y publicación Website),
Atlas Web Builder (bloques y editor) y Runly Developer Hub (herramientas Website, editor y plugins).

## 1. Objetivo

Que una plantilla Website pueda llevar video y audio propios (no embebidos de terceros), editarse
en Atlas desde la biblioteca del Hub, viajar dentro del paquete `.zip` y funcionar instalada y
publicada en un sitio del ERP.

## 2. Estado verificado (2026-11-23)

- `website-template.js`: `EXCLUDED_BLOCKS = {'VideoBlock'}`; `WEBSITE_ASSET_EXTENSIONS` solo imágenes
  (+SVG); el manifiesto exige `width`/`height` positivos por asset; `entry` 10 MiB, `compressed` 25 MiB,
  `assetBytes` 64 MiB; `validateImage` revisa cada asset. Los campos `image` validan `asset:<sha256>`.
- `website-template-preparation-service.js` (ERP): enlaza assets a `FileAsset` del sitio con tope
  de 8 MiB y MIME exacto, y los mapea `asset:<sha>` → `file:<id>`.
- `website-static-policy.js` (ERP) ya admite `video/mp4|webm` y `audio/mpeg|ogg|wav` en exportes
  estáticos.
- Atlas 0.10.0: `VideoBlock` tiene `src` tipo `link` (YouTube, Vimeo o URL .mp4) y `poster` tipo
  `image`; no existe `AudioBlock`; los campos de asset del editor solo conocen imágenes.
- Hub: `WEBSITE_IMAGE_MIMES` (imágenes + SVG) cierra las herramientas `runly_website_asset_*` y la
  pestaña Medios del editor a audio/video.

## 3. Alcance

Incluido:

- Política de paquete `packaged-media-v3` = v2 + audio/video.
- Atlas: campo `file` (video) en `VideoBlock`, nuevo `AudioBlock`, tipos de campo `video` y `audio`,
  y pestaña Medios con audio/video.
- Interchange: lector y escritor v3; `VideoBlock` admitido en plantillas solo con archivo del paquete.
- Hub: herramientas y editor Website con audio/video cuando el contrato fijado anuncia v3.
- ERP: instalación (enlace a Files), borrador, publicación y entrega con Range en el sitio público.

Fuera de alcance:

- Studio (lienzo y diapositivas): Fase C, spec aparte.
- Embebidos de terceros (YouTube, Vimeo) en plantillas: siguen excluidos.
- Transcodificación, streaming adaptativo (HLS/DASH), subtítulos y pistas múltiples.
- Reprocesar con FFmpeg en el ERP (ver 6.3).

## 4. Política `packaged-media-v3`

- `WEBSITE_AV_POLICY = { name: 'packaged-media-v3', version: 3 }`; `WEBSITE_ASSET_POLICIES` la incluye.
- Igual que v2: solo la declara un paquete que contenga al menos un asset de audio o video. Sin
  audio/video, el escritor sigue emitiendo v1 o v2 y los bytes históricos no cambian. Un lector que
  solo conoce v2 rechaza v3 con `format_unsupported`.
- `WEBSITE_ASSET_EXTENSIONS` agrega `video/mp4: mp4`, `video/webm: webm`, `audio/mp4: m4a`,
  `audio/mpeg: mp3`, `audio/ogg: ogg`, `audio/wav: wav`.
- Registro de asset de audio/video en el manifiesto (además de `id`, `path`, `mime`, `bytes`,
  `sha256`, `license`):
  - `kind: 'video' | 'audio'`, `durationMs` (1–120 000).
  - Video: `width`, `height` y `poster: { path, bytes, sha256, width, height }`, que apunta a un
    WebP derivado en `assets/<sha>.poster.webp`.
  - Audio: sin `width`, `height` ni `poster`.
- Límites v3 (los de v1/v2 no cambian):
  - `entry` 24 MiB para audio/video;
  - `avAssets` 4 por paquete y `avBytes` 48 MiB;
  - `compressed` 64 MiB solo para paquetes v3;
  - `assetBytes` 64 MiB, que ya cubre el total.
- Validación del lector para audio/video: firma del contenedor (`audiovisualContainer`, que se mueve
  desde el contrato del Hub al interchange compartido), coincidencia de extensión, MIME y `kind`,
  SHA y longitud exactos, y póster validado con `validateImage` como WebP. El lector no decodifica:
  la decodificación aislada ocurrió en el Hub al confirmar el asset (6.3).

## 5. Atlas Web Builder (0.11.0)

- Tipos de campo `video` y `audio`. Guardan una referencia de asset igual que `image`:
  `asset:<sha256>` en paquete y URL resuelta en el editor. `withAssetMeta` guarda `durationMs` y el póster.
- `VideoBlock`: nuevo campo `file` (tipo `video`) en el grupo "Video", antes de `src`. Al renderizar,
  `file` gana sobre `src`. `<video>` usa `controls`, `preload="metadata"` y `playsinline`, y
  `poster` = campo `poster` o, si está vacío, el póster del asset. Autoplay solo silenciado
  (ya existe).
- `AudioBlock` (categoría media): `file` (tipo `audio`), `title`, `caption`, `controls` (siempre
  visibles cuando no hay autoplay), `loop`. Renderiza `<audio controls preload="metadata">` con
  título accesible.
- Editor: la pestaña Medios lista audio/video si el `AssetSource` los entrega (filtro por `kind`) y
  muestra el póster o un ícono de audio. Arrastrar un video sobre `VideoBlock` llena `file`, y un audio
  sobre `AudioBlock` llena el suyo. `imageFieldKey` no cambia para imágenes; se agrega
  `mediaFieldKey(definition, kind)`.
- Catálogo publicado: `VideoBlock` gana `file`; `AudioBlock` es nuevo. El digest del catálogo cambia,
  así que hay que registrar la identidad en `builderCatalogs` del ERP y del Hub.

## 6. Interchange y ERP

### 6.1 Validación de documentos

- `EXCLUDED_BLOCKS` deja de excluir `VideoBlock` incondicionalmente. Regla nueva: en una plantilla,
  `VideoBlock.src` debe estar vacío (sin terceros) y `file` debe ser `asset:<sha>` de un asset de video.
  Cualquier otro caso da `prop_invalid` con el mensaje "Los videos de plantilla deben ser archivos
  del paquete".
- `case 'video'` y `case 'audio'` en el validador de props: `ctx.asset` comprueba además que el
  `kind` del asset coincida (`prop_invalid` si un campo de video referencia audio o imagen).
- `website-write.js`: registra audio y video con su póster y elige la política más alta que exija el
  contenido (v3 si hay audio o video, v2 si solo hay SVG, v1 en otro caso).

### 6.2 Instalación y borrador

- `website-template-preparation-service.js`: tope por MIME (8 MiB para imágenes y 24 MiB para
  audio/video) y enlace del póster como segundo `FileAsset`. El mapeo es `asset:<sha>` → `file:<id>` y,
  para el póster, `file:<posterId>` guardado en la metadata del bloque.
- Files (`runly.files`) acepta los seis MIME para `moduleKey: 'runly.website'`. Se verifica que su
  lista blanca y su tope por archivo lo permitan; si no, se amplían solo para ese módulo.

### 6.3 Seguridad sin FFmpeg en el ERP

El ERP no tiene procesador aislado. Se acepta el audio/video del paquete porque:

1. lo decodificó FFmpeg aislado en el Hub al confirmarse;
2. su SHA quedó fijado en el paquete revisado;
3. el lector verifica firma, MIME y SHA;
4. el sitio lo entrega con `Content-Type` del manifiesto, `nosniff` y sin ejecutarlo: la
   decodificación ocurre en el navegador del visitante, igual que cualquier video subido a un sitio.

Si el ERP gana un procesador más adelante, el preparador lo invocará antes de enlazar.

### 6.4 Publicación y entrega

- El servicio de releases fija `file:<id>` de audio/video y póster igual que las imágenes.
- La ruta pública de archivos del sitio responde a Range (un intervalo, 206, `Accept-Ranges`, ETag
  por SHA). Si hoy no lo hace, se implementa; sin Range, Safari no reproduce MP4.
- El exporte estático copia los archivos (la política estática ya admite esos MIME).

## 7. Hub

- Contrato: `WEBSITE_DOCUMENT_MIMES` = imágenes + SVG + audio/video, pero solo si el
  `@runly/studio-interchange` fijado exporta `WEBSITE_AV_POLICY` y `HUB_MEDIA_AV=on`. Se anuncia como
  hoy el SVG: `runly_website_contract.audiovisual = { policy, mimes, limits } | null`.
- `documentImage` se renombra a `documentMedia(asset, scope)` (los usos de imagen siguen igual). Los
  assets de audio/video que todavía están en proceso no son insertables.
- Herramientas `runly_website_asset_*`: el enum MIME incluye audio/video bajo esa condición, con
  confirmación asíncrona (`state: processing`) igual que en `runly_media_asset_confirm`.
- Editor Website (iframe, MessagePort): `media-list` incluye audio/video con póster.
  `media-resolve` de audio/video **no** envía base64: devuelve una URL de vista previa firmada y de
  corta duración para el `<video>`/`<audio>` del iframe. El guardado sigue referenciando
  `asset:<sha>` y el escritor del Hub lee los bytes de Storage (`omitDocumentAssetBytes`), así que el
  cuerpo de guardado no crece.
- Exporte del paquete: el escritor incluye original y póster; aplica `avAssets`/`avBytes` y da
  `zip_limit_exceeded` con mensaje claro si se superan.
- Plugins (dev.26): describen `file` en `VideoBlock`, `AudioBlock`, la regla de no terceros y los
  límites. Requiere un Scan Tools nuevo.

## 8. Errores nuevos

- `av_asset_invalid`: firma, MIME o `kind` incorrectos.
- `av_poster_invalid`: falta el póster o no es un WebP válido.
- `av_limit`: se superan `avAssets`/`avBytes`/`entry` en v3.
- `prop_invalid`: video de terceros en una plantilla, o campo apuntando a un asset del `kind` equivocado.
- `format_unsupported`: un lector v2 que recibe un paquete v3.

## 9. Pruebas

- Interchange (ERP):
  - ida y vuelta v3 con un MP4 y un WAV sintéticos;
  - un paquete sin audio/video sigue en v1/v2 con bytes idénticos;
  - un lector v2 rechaza v3;
  - `VideoBlock` con YouTube rechazado;
  - campo de video que apunta a un audio, rechazado;
  - límites de tamaño y cantidad (`avAssets`, `avBytes`, `entry`);
  - póster corrupto.
- Atlas:
  - render de `VideoBlock` con `file`, y `file` gana sobre `src`;
  - `AudioBlock` accesible;
  - arrastrar desde Medios llena el campo correcto;
  - matriz de navegadores en el editor (Chromium y Firefox reproducen; en WebKit de Windows solo se
    verifica la entrega, igual que en la Fase A).
- Hub:
  - contrato condicionado a la política fijada y a la bandera;
  - `runly_website_asset_prepare` con MP4;
  - guardar y reabrir un documento con video y audio;
  - exportar un ZIP v3 e inspeccionarlo;
  - límites al exportar.
- ERP:
  - instalar la plantilla v3 en un sitio de prueba;
  - publicar y reproducir en el sitio público con Range (206);
  - exporte estático.
- Real: crear desde ChatGPT una plantilla con un video y un audio, instalarla en el ERP y reproducirla.

## 10. Criterios de aceptación

- Una plantilla con un MP4 de 20 MiB (con póster) y un MP3 se guarda en el Hub, se reabre, se exporta
  como v3 válido, se instala en un sitio del ERP y se reproduce publicada, con búsqueda dentro del
  archivo.
- Las plantillas sin audio/video producen exactamente los mismos bytes que antes.
- Ningún `VideoBlock` de plantilla carga contenido de terceros.
- Con la bandera apagada o una política fijada anterior, nada anuncia audio/video en Website y todo
  lo demás sigue igual.

## 11. Orden de entrega

1. Interchange en el ERP (política v3, lector y escritor) y republicación del paquete compartido.
2. Atlas 0.11.0 (bloques, campos y editor) y su publicación.
3. Hub: actualización de los pins del interchange y de Atlas, contrato, herramientas, editor y
   escritor; plugins dev.26.
4. ERP: pin de Atlas, preparador, Files, Range en el sitio público y releases.
5. Prueba real de punta a punta y despliegue.

Rollback: las versiones fijadas anteriores (interchange y Atlas) siguen leyendo v1/v2; apagar
`HUB_MEDIA_AV` deja de anunciar audio/video en Website. Los paquetes v3 ya exportados solo los lee un
host con el lector v3.
