# Studio Next: hoja de ruta de implementación

Complementa el [plan maestro](studio-next-master-plan.md) y el
[diseño técnico](studio-next-technical-design.md). Las referencias D* y R* son las
decisiones y riesgos de ese diseño. Las rutas son relativas a la raíz de
runly-erp salvo que se indique otro repositorio.

## Fase 0 — Auditoría y arquitectura

- [x] Estado de Git de los tres repositorios, instrucciones del proyecto y
  documentación Studio previa revisados.
  Verified: 2026-11-16 (runly-erp main 96c53baac, Hub b635205 y runly-web f9c4b3d, árboles limpios)
- [x] Contrato, operaciones, protocolo, trigger SQL, editor, exportaciones, paquete
  portable, Hub, FFmpeg, Office/PPTX y efectos Website auditados en el código.
  Verified: 2026-11-16 (lectura estática; sin suites ni builds, ver diseño técnico §1)
- [x] Plan maestro, diseño técnico, hoja de ruta y spec de Fase 1.
  Verified: 2026-11-16 (solo documentación, sin cambios funcionales)

Cierre: commit local de documentación. No hay push ni migraciones.

## Fase 1 — Presentaciones

Spec: [2026-11-16-studio-next-phase1-presentations-design.md](../superpowers/specs/2026-11-16-studio-next-phase1-presentations-design.md).
Antes de implementar hace falta el plan en `docs/superpowers/plans/`.

Entregables: contrato v8 completo (D2, D3), protocolo 4 con chequeo por
documento, migración del trigger, `motion.js` con `slideTimeline`,
`transitionAt`, `easing` y `presentationSequence`, ajustes de diapositiva en el
panel de página y un reproductor a pantalla completa.

Estado: implementada el 2026-11-16, pendiente de revisión del usuario. Evidencia y
desviaciones en la spec (§6). Migración `20270107000000_studio_v8_protocol` creada y
probada solo en PostgreSQL desechable; **no aplicada** en bases compartidas.

- [x] Contrato v8, protocolo 4, migración, reproductor y ajustes de diapositiva.
  Verified: 2026-11-16 (node --test 159/159; guard SQL en PostgreSQL 18 desechable; E2E 22/22 en stack Supabase desechable)

Cierre técnico (2026-11-16):

- [x] Prueba reproducible versionada: `node scripts/verify-studio-presentations.mjs --build-api-image`
  (o `--api-image=<etiqueta>`; `--only=<texto>` ejecuta un paso). Stack Supabase desechable,
  API construida desde `git archive HEAD`, capturas en `.artifacts/studio/presentations/`.
  Verified: 2026-11-16 (25/25)
- [x] Deshacer colaborativo: selectivo entre dos usuarios, conflicto en la misma propiedad
  (gana el último y el deshacer ajeno no la pisa), deshacer en páginas inactivas y cola sin
  conexión con deshacer entregada al reconectar. Verified: 2026-11-16 (mismo script)
- [x] Fixture de PostgreSQL: `atlas_unaccent` y `studio_collection_item` en
  `scripts/fixtures/studio/minimal-access.mjs`; `studio-postgres.test.js` 11/11.
  Verified: 2026-11-16 (PostgreSQL 18 desechable)
- [x] Selección restaurada al salir de Presentar (no se restauran objetos eliminados, ocultos
  o bloqueados mientras tanto). Verified: 2026-11-16 (mismo script)
- [x] Transiciones deslizar y acercar comprobadas en pantalla (posición, escala y opacidad
  durante la transición, con capturas). Verified: 2026-11-16 (mismo script)
- [x] Protocolo 3/4: 426 para clientes 3 sobre v8 y para protocolo 2; un PUT v8→v7 con
  protocolo 4 se rechaza (409); las rutas del paquete aceptan 3 y 4. Verified: 2026-11-16 (mismo script)

Pendientes que pasan a Fase 2 o quedan sin verificar:

- `sceneAt` (composición de efectos y keyframes) y su recorte al final de la diapositiva.
- `resizeDocument` con escala de contenido no escala `x`/`y` absolutos de keyframes.
- `apps/api/src/mcp/__tests__/official-domains.js` (casos MCP) no se ejecutó.
- iPhone real y Tauri/WebView2 sin probar.

Criterios de cierre:

- Presentar un diseño de 3 o más páginas desde el editor, con teclado, clic,
  toque, reproducción automática, pausa, bucle y salida, en escritorio y teléfono.
- Duración y transición guardadas, sincronizadas a otra sesión y reabiertas.
- Un diseño sin ajustes de diapositiva sigue guardándose como v7.
- Cliente de protocolo 3 sobre un diseño v8: 426 y borrador conservado.
- Exportaciones PNG/JPG/PDF y `.runlystudio` sin regresión; el paquete de un
  diseño v8 se exporta como v1 con pérdidas declaradas.

## Fase 2 — Motor de animación

Estado: implementada el 2026-11-16, pendiente de revisión. Plan, desviaciones, evidencia y
rendimiento medido: [plan de Fase 2](../superpowers/plans/2026-11-16-studio-next-phase2-motion-engine.md).
Pendiente: medir en dispositivos físicos y Tauri; `resizeDocument` con escala no escala
keyframes (Fase 3, junto con su edición).

Entregables:

- `sceneAt` completo en `motion.js` (keyframes evaluados aunque aún no editables).
- `apps/desktop/src/modules/runly.studio/lib/motion-renderer.js`: StaticCanvas de
  solo lectura y actualización por propiedades (D6).
- El reproductor cambia `frameSource` a `motion-renderer` cuando una página tiene
  efectos de objeto.
- Panel «Animar» (componente nuevo) para `enter`, `exit` y `emphasis` del objeto
  seleccionado o grupo, con «Previsualizar» de la página activa.
- `prefers-reduced-motion` aplicado a la previsualización y al reproductor.

Criterios de cierre: vectores dorados de `sceneAt` para todos los presets; dos
efectos distintos del mismo objeto editados a la vez por dos sesiones convergen
sin pisarse; undo revierte solo el efecto propio; 30 fps sostenidos en una página
de 100 objetos con 20 efectos en el equipo de referencia (medido y anotado);
cero diferencias en exportaciones estáticas. Resuelve R3 y R4.

## Fase 3 — Línea de tiempo y keyframes

Estado: implementada el 2026-11-16, pendiente de revisión. Plan, hallazgos, evidencia y
rendimiento: [plan de Fase 3](../superpowers/plans/2026-11-16-studio-next-phase3-timeline.md).
Incluye el escalado de keyframes al redimensionar con «escalar contenido» (pendiente de Fase 2).

Entregables: línea de tiempo bajo el lienzo en modo Animar (pistas por objeto,
arrastre de inicio y duración, cursor de tiempo, Play/Pause, zoom temporal),
edición de keyframes de `x`, `y`, `rotation`, `opacity` y `scale` desde el lienzo
con el cursor de tiempo, y accesibilidad de teclado en la línea de tiempo.

Criterios de cierre: los arrastres en la línea de tiempo generan un único paso de
historial; la colaboración muestra cambios de otra sesión en la línea de tiempo;
editar en el tiempo `t` nunca modifica el valor base sin intención explícita; la
línea de tiempo funciona en tableta, y en teléfono queda en solo lectura con lista
de efectos.

## Fase 4 — Exportación animada

Estado: implementada y verificada el 2026-11-16, pendiente de revisión.

- Un solo recorrido de fotogramas para los tres formatos (`lib/motion-export-plan.js` +
  `lib/studio-motion-export.js`): `sceneAt` dibujado por el mismo renderer de página que
  Presentar (`createPlayer`), compuesto con `transitionAt`, en `k × 1000 / fps` ms.
- MP4/WebM: WebCodecs `VideoEncoder` (H.264 `avc1.640028` o VP9 `vp09.00.10.08`, con
  alternativas `avc1` main/baseline y `vp8`) fotograma a fotograma; solo se guardan los
  paquetes comprimidos y ffmpeg.wasm (ya incluido para LMS) los remultiplexa con `-c copy`.
  Respaldo sin WebCodecs: JPEG → libx264/libvpx en ffmpeg.wasm (más lento). GIF: PNG →
  `palettegen/paletteuse`. Sin dependencias nuevas.
- Diálogo Descargar: Video MP4, Video WebM y GIF animado con páginas, resolución, fps,
  calidad, repetición, resumen (duración, fotogramas, tamaño estimado) y tipo de codificación;
  progreso y cancelación en el aviso de descarga.
- [x] `node scripts/verify-studio-exports.mjs --api-image=<etiqueta>` 10/10 sobre el proyecto de
  aceptación (3 páginas 16:9 y cuadrada de 3 s, 2 s y 2,5 s; foto privada, textos, formas,
  entradas/salidas, keyframes de posición/escala/opacidad/rotación, fundido y deslizamiento).
  Archivos y tiras de fotogramas en `.artifacts/studio/exports/`. Verified: 2026-11-16 (Chrome
  estable headless, Windows)
  - MP4 1280×720, 225 fotogramas, 7,5 s, avc1, 0,42 MB, 2,3–4,7 s de exportación.
  - WebM 1280×720, 225 fotogramas, 7,5 s, VP9, 0,75 MB, 2,9–3,5 s.
  - GIF 640×360, 90 fotogramas, 7,51 s, bucle infinito, 0,12 MB, 2,3–2,9 s.
  - Contenedores leídos con analizadores propios (cajas MP4, EBML, bloques GIF); los tres
    reproducidos por los decodificadores de Chrome hasta el final; 13–15 puntos comparados con el
    renderer del editor por formato (diferencia máxima 5 en video, 0 en GIF; los bordes de letra
    no se comparan en el GIF de 640 px). Incluye el fundido a mitad y las franjas negras.
  - Respaldo sin `VideoEncoder`: MP4 válido de 225 fotogramas en 13–17 s.
  - Cancelar al ≥10 % no genera archivo y la siguiente exportación funciona; el diseño queda
    idéntico (revisión y documento); un colaborador de solo lectura exporta con la foto privada
    autorizada por el diseño.
  - Heap máximo durante una exportación: +40 a +79 MiB sobre el inicio.
- Diferencias inevitables: compresión con pérdida en MP4/WebM, 256 colores en GIF (bandas en
  fotos y degradados), fotogramas cada 1/fps (un efecto más corto que un fotograma puede no
  verse), sin audio. Sin verificar: Safari, Firefox, Tauri/WebView2, Android y equipos de gama
  baja; la compatibilidad de H.264/VP9 depende del navegador (por eso existe el respaldo).

Spike previo (sin código de producto): disponibilidad de `VideoEncoder` H.264,
VP9 y VP8 en Chrome, Edge/WebView2, Android WebView, Safari y Firefox; elección
y licencia del muxer; rendimiento de ffmpeg.wasm como respaldo.

Entregables: `lib/studio-motion-export.js` (reloj virtual, streaming de
fotogramas, cancelación, progreso), opciones WebM, MP4 y GIF en `ExportDialog`
con presupuestos (D8) y límites en `export-limits.js`.

Criterios de cierre: el número de fotogramas y la duración del archivo coinciden
con la secuencia; dos exportaciones del mismo diseño en el mismo navegador
producen fotogramas idénticos; la cancelación libera encoder, canvas y núcleo
ffmpeg; superar un presupuesto se rechaza antes de empezar. Resuelve R5.

## Fase 5 — PPTX

Estado: implementada y verificada el 2026-11-16, pendiente de revisión y de la comprobación
manual en Microsoft PowerPoint.

- `pptxgenjs` 4.0.1 (MIT) y `jszip` 3.10.1 en `apps/desktop`, cargados solo al exportar.
  `lib/pptx-mapping.js` (geometría, clasificación por objeto, texto, formas, líneas, fotos,
  transiciones), `lib/pptx-build.js` (ensamblado + informe), `lib/studio-pptx-export.js`
  (navegador: bytes autorizados por `editor.imageBlob`, imagen por objeto, video opcional) y
  `components/editor/PptxExportOptions.jsx` (resumen de compatibilidad en Descargar).
- Mapeo: texto → cuadro de texto nativo (fuente nombrada, tamaño, peso, cursiva, alineación,
  interlineado, espaciado, subrayado, tachado); rectángulo/elipse → forma nativa con relleno,
  borde, guiones, esquinas y opacidad; línea → `custGeom` con flechas; foto simple → imagen
  propia con recorte `cover`/`contain`; foto en elipse → imagen recortada en círculo. Rotación
  convertida del pivote de esquina de Studio al centro de PowerPoint. Orden de capas = orden de
  dibujo.
- Se exportan como imagen de ese objeto (nunca la diapositiva entera), cada uno declarado en el
  resumen y en el informe: fotos con máscara, encuadre, borde, sombra o ajustes; degradados;
  iconos/vectores; QR y códigos de barras. Fondos degradados → imagen de fondo.
- Proporciones: el tamaño de diapositiva sale de la primera página (lado largo 13,333 in); las
  páginas con otra proporción se centran sin deformar, con franjas negras y la página como
  rectángulo editable.
- Transiciones: solo `fade` (`<p:fade/>` con velocidad aproximada). Cada diapositiva lleva su
  duración como avance automático. Deslizar y acercar no se exportan (`<p:cut/>`) y se declaran:
  en la prueba de ida y vuelta con LibreOffice, `<p:push>` volvió con la dirección horizontal
  invertida y `<p:zoom/>` se perdió. LibreOffice además redondea el avance a segundos enteros,
  descarta la velocidad y descarta `<p:cut/>` con su tiempo de avance.
- Video opcional: diapositiva final con el MP4 de la Fase 4 (1280 px, 30 fps) y su portada;
  las diapositivas editables no cambian.
- Seguridad: las fotos privadas se piden con la resolución autorizada del lienzo y se
  incrustan como binarios; el archivo no contiene URLs firmadas ni tokens (comprobado). Imágenes
  por objeto a escala 2 con tope de 2048 px de lado de página.
- Pérdidas declaradas: animaciones de elementos, grupos (quedan sueltos), transiciones de
  deslizar y acercar, extremos de línea cuadrados/barra, fuentes no incrustadas.
- [x] `node scripts/verify-studio-pptx.mjs --api-image=<etiqueta> --office-url=<collabora>`
  9/9 sobre el proyecto de aceptación compartido con la Fase 4
  (`scripts/fixtures/studio/acceptance-project.mjs`). Archivos en `.artifacts/studio/pptx/`.
  Verified: 2026-11-16 (Chrome headless, Collabora CODE en contenedor aislado, Windows)
  - PPTX de 21 kB en 0,5 s: 3 diapositivas 16:9 en orden, 7 elementos editables (2 textos,
    3 formas, 2 fotos) + rectángulo de página cuadrada; ninguna diapositiva es una sola imagen.
  - Collabora lo convierte a PDF; 10 puntos coinciden con la exportación PNG de Studio
    (diferencia máxima 1); la página cuadrada conserva su proporción con franjas;
    `comparacion-studio-vs-office.png` guardada.
  - Edición: texto cambiado, forma recoloreada y movida 1 in; Collabora vuelve a guardar y el
    texto sigue siendo texto, la forma se movió sola y la foto sigue siendo su propia imagen.
  - Con video: 0,46 MB, 4.ª diapositiva con el MP4 incrustado (0,42 MB); Collabora la abre y
    conserva el video al volver a guardar.
  - Diseño v7 vertical → diapositiva 4:5 editable; el diseño sigue en v7.
  - Colaborador de solo lectura exporta con la foto privada incrustada; rango inválido
    deshabilita Descargar; cancelar con video no genera archivo; el diseño no cambia.
  - Unitarias: `lib/pptx-build.test.js` 2/2; suite `lib/` de Studio 97/97.
- Pendiente de comprobación manual: abrir, editar y presentar en Microsoft PowerPoint (Windows y
  Mac) y Google Slides; reproducir el video dentro de PowerPoint (Collabora solo confirma que
  está incrustado y se conserva); velocidad del fundido en PowerPoint.

Spike previo: `pptxgenjs` en el navegador frente a escribir OOXML con JSZip;
transiciones inyectadas; apertura en PowerPoint, LibreOffice y Google Slides.

Entregables: `lib/studio-pptx-export.js` en un chunk lazy, mapeo D9, informe de
compatibilidad por objeto antes de descargar, transiciones y avance automático, y
prueba automática Collabora PPTX→PDF cuando Office esté configurado.

Criterios de cierre: texto editable con la fuente nombrada; formas nativas con su
geometría, orden y rotación; una advertencia por cada objeto rasterizado; la
matriz de apertura manual queda documentada. Resuelve R6.

## Fase 6 — Paquete portable v2 y Developer Hub

Estado: implementada y verificada en local y en laboratorio el 2026-11-16, pendiente de
revisión. La integración remota NO está lista: depende de publicar los paquetes compartidos
de commits que aún no se han subido (secuencia en `runly-developer-hub`
`docs/RUNLY_SHARED_PACKAGES.md`, sección «Studio .runlystudio v2»).

- Tres versiones separadas: formato de paquete (`formatVersion`/`minReaderVersion`),
  documento (`documentSchemaVersion`) y protocolo de escritura (cabecera HTTP, nunca en el
  paquete). Documento 7 → paquete v1 byte a byte igual que antes (lectores antiguos lo
  abren); documento 8 → paquete v2 (`minReaderVersion: 2`) sin proyección ni pérdidas. Un
  manifest v1 con documento 8, o un documento con campos v8 declarado como 7, se rechaza.
  Lector con v1 y v2; versiones futuras → «versión más nueva». Recursos con las reglas de
  v1 (bytes originales, id `asset-<sha256>`, deduplicación, MIME/tamaño/píxeles, sin
  enlaces). Sin cambios en `sceneAt` ni en el contrato v8.
- ERP: se quita la aceptación de pérdida de movimiento del diálogo (la API la sigue
  aceptando e ignora); `GET /studio/interchange/schema` informa formato 2/documento 8; el
  catálogo de recursos admite `studio_template` formato 2.
- Hub: `studio.js` admite documentos 7 u 8; el validador aislado rechaza un v8 con
  `document_schema_unsupported` si el paquete fijado solo escribe v1; textos MCP.
- [x] `node scripts/verify-studio-package.mjs --build-api-image` 8/8 (proyecto de aceptación
  + grupo, énfasis y segunda foto). Verified: 2026-11-16 (stack desechable, Chrome headless)
  - Exportar desde Descargar: 27 kB en 0,6–1,1 s; v2/documento 8; 2 PNG 800×600 con el
    SHA-256 de los bytes subidos (3 referencias → 2 archivos); document.json = diseño
    guardado; sin URLs, tokens, ids de archivo ni de empresa.
  - Importar desde el diálogo en 3,2–4,2 s y abrir: v8 con páginas, orden, geometría,
    efectos, keyframes, transiciones y grupos idénticos; 2 archivos privados nuevos de la
    empresa, referencias resueltas.
  - Comparación: 3 páginas PNG con diferencia 0; GIF del recorrido `sceneAt` (90
    fotogramas) idéntico byte a byte al del original.
  - Editar (Formato, mover 50 px) conserva el énfasis y no toca nada más; Presentar 1 → 3.
  - v7 → paquete v1 → reimportado v7; corpus v1 versionado se importa; formato futuro pide
    actualizar; bomba ZIP, path traversal, symlink, v8 declarado v7, pareja de versiones
    incorrecta y documento alterado se bloquean antes de guardar; recurso faltante nombrado
    sin guardar nada; cancelar deja 0 diseños/archivos; VIEWER sin permiso (UI y 403); otra
    empresa no puede exportar.
  - `--hub-feed`: plantilla v2 del Hub (laboratorio, firma de prueba) verificada,
    descargada e instalada por los servicios reales de importación del Marketplace en
    16,7 s; igual al documento del Hub; 90 fotogramas con diferencia 0 frente a una copia
    directa; editada y presentada. La instalación corre en proceso porque la imagen de API
    fija la clave productiva del feed; la UI es la del stack.
- [x] Hub `tests/integration/studio-package-v2.test.js` 5/5 con raíz de validador de la
  revisión local `bbc7d8a9…` (`pnpm release:shared` sin publicar +
  `prepare-marketplace-validator.mjs`): MCP con foto en cuarentena, edición en el Hub que
  conserva el movimiento, evidencia de formato 2, vista previa, revisión, aprobación
  institucional, publicación firmada `local-test`, consumidor real del ERP con la plantilla
  elegible; el pin actual rechaza v8 en vez de perder animaciones. Verified: 2026-11-16
- Regresiones: interchange 25/25 (incluye corpus 33 casos), API interchange/SDK/import
  15/15, catálogo 67/67, Presentaciones 25/25, Hub unitarias 708/708, Hub plantillas
  oficiales 2/2. Con la raíz nueva y el corpus nuevo copiado temporalmente: validación
  unitaria del Hub 16/16; en integración solo fallan las aserciones que comparan la
  revisión con el lock fijado (desaparecen al adoptar) y dos pruebas que ya fallaban con el
  pin actual (revisión humana #9 y lista de herramientas MCP #1).
- No ejecutado: `scripts/verify-studio-interchange.mjs` está desfasado desde antes de esta fase
  (supone que la inicialización no crea `studio_interchange_job` y su API MCP no arranca:
  `LOCAL_MCP_API_NOT_READY`); su cobertura de paquete la reemplaza `verify-studio-package.mjs`.
- Pendiente: la ficha del Hub no tiene vista previa animada (las vistas previas siguen
  siendo capturas subidas); publicar y adoptar los paquetes; sincronizar runly-web y los
  docs MCP del Hub (copias generadas de `docs/developers`).

Entregables en runly-erp: `formatVersion: 2` con `documentSchemaVersion: 8`,
lector v1 conservado, proyección exacta a v1 para diseños estáticos, límites de
efectos en `limits.js` y actualización de
`docs/developers/studio-template-package.md` con su cadena de generación.

Entregables en runly-developer-hub: subir la versión fijada de
`@runly/studio-interchange`, aceptar 7 y 8 en
`apps/api/src/services/marketplace-resources/studio.js`, previsualización animada
en la ficha y herramientas MCP de contrato y validación.

Criterios de cierre: un paquete v1 existente se importa sin cambios en ambos
repositorios; un paquete v2 animado viaja ERP → Hub → ERP sin pérdida; un ERP
antiguo reporta «versión más nueva» sin parsear. Resuelve R8.

## Fase 7 — Studio → Website

Estado: implementada y verificada en un stack desechable el 2026-11-16, pendiente de revisión.

- `POST /studio/designs/:id/website` (`apps/api/src/services/studio-website/`) crea páginas en
  **borrador** de un sitio de la misma empresa con `applyBundle` (conflictos de ruta, recibos
  idempotentes, auditoría); nunca publica ni modifica el diseño. Conversión pura compartida en
  `apps/shared/studio/website-conversion.js` (el diálogo la usa para su informe; la API construye
  la página autoritativa y la pasa por el catálogo Website, la lista blanca de efectos y la
  normalización estricta de borradores).
- Mapeo: texto → `TextElementBlock` (tamaño, peso, interlineado, alineación, color); foto simple
  (también dentro de un rectángulo o círculo) → `ImageElementBlock`; rectángulo y círculo →
  `BoxBlock` (fondo, radio, borde, opacidad); grupo → `BoxBlock` libre; sin equivalente (línea,
  vector/QR, degradado, foto con máscara o ajustes, elipse no circular, círculo de más de 400 px)
  → PNG de ese objeto generado en el navegador y validado en la API. Nunca la página completa.
- Responsivo: escritorio con composición absoluta en un lienzo de 960 px (orden de Studio como
  `layer`, rotación al centro); tableta y teléfono apilan en orden de lectura (fotos a todo el
  ancho en teléfono, al menos la mitad en tableta).
- Efectos: `enter` → `_animation` (fade → fade-in, rotate → rotate-in, resto igual; pop sin
  equivalente; duración y retardo ≤ 5 s); opacidad → `_opacity`. Pérdidas declaradas: salida,
  énfasis, keyframes, duración/transición de diapositiva, fuente (usa la del sitio), cursiva,
  subrayado, tachado, espaciado, contorno y sombra del texto, bordes discontinuos, fondo degradado
  de página (primer color), más de 100 capas, grupos intercalados en capas.
- Recursos: las fotos se copian desde los originales autorizados del diseño como archivos privados
  del sitio (`file:<id>`), con deduplicación por SHA-256; sin URLs firmadas ni ids de Studio. La
  subida pasa por `website_template_job`: un fallo antes de la transacción final no deja páginas y
  la compensación existente borra las subidas.
- Website: el editor de páginas del sitio no resolvía imágenes privadas `file:<id>` (afectaba
  también a plantillas del Marketplace); ahora usa `usePrivateWebsiteAssets` al cargar, guardar y
  respaldar.
- [x] `node scripts/verify-studio-website.mjs --build-api-image` 6/6. Verified: 2026-11-16
  (stack desechable, Chrome headless, Atlas 0.8.2)
  - Diálogo: «2 textos, 2 fotos, 2 formas, 1 grupos» editables; círculo de 444 px y línea como
    imagen; pérdidas de movimiento. 3 borradores en ~1 s y Atlas abierto en la primera; sitio sin
    publicar; diseño sin cambios.
  - Páginas guardadas: título como `TextElementBlock` con `_animation` fade-in, foto privada del
    sitio, caja roja en su capa, grupo como contenedor libre, línea como imagen, zoom-in conservado.
  - Atlas: escritorio con texto DOM e imagen privada visible; tableta y teléfono apilados sin
    desbordamiento horizontal (`.artifacts/studio/website/`); el título se edita en el inspector,
    cambia el `TextElementBlock`, se guarda y se reabre con el cambio y las fotos privadas.
  - Ruta existente: 409 y la página existente intacta; misma clave → mismo resultado; página
    rechazada tras subir la foto → sin páginas ni archivos (compensado); visor sin permisos Website
    y otra empresa rechazados.
- Regresiones: tests unitarios de conversión 3/3, suite `lib/` de Studio 97/97, PPTX 9/9 (tras el
  refactor compartido).

Spike previo: contrato de geometría y anclas de `TextElementBlock`,
`ImageElementBlock` y `BoxBlock` en Atlas 0.8.2 y su validación en Runly.

Entregables: endpoint de conversión en la API (borrador, nunca publicación),
copia autorizada de imágenes al sitio, mapeo D10, informe de pérdidas y diálogo
«Enviar a Website» con selección de sitio y página.

Criterios de cierre: el borrador se abre y edita en el editor Website; las
entradas `enter` se ven en la vista previa pública; una imagen sin permiso Files
del actor bloquea la conversión con un mensaje claro; nada se publica. Resuelve
R7.

## Fase 8 — Cierre y release candidate

Rendimiento en el equipo de referencia y en un teléfono, auditoría de
accesibilidad con `docs/ai-context/ui-screen-audit-checklist.md`, artículos de
ayuda en `apps/api/src/manifests/official/help/runly.studio`, capacidades
MirAI/MCP de Studio para animaciones, validación en un stack de instalador
desechable y notas de release.

## Dependencias

```
0 ─> 1 ─> 2 ─┬─> 3 ─> 4 (keyframes)
             ├─> 4
             ├─> 6
             └─> 7
     1 ─> 5 (fallbacks rasterizados de 2 cuando existan)
1..7 ─> 8
```
