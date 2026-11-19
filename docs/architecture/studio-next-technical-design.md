# Studio Next: diseño técnico

Estado: Fase 0, auditoría estática y arquitectura objetivo. Base: `main` en
`96c53baac` (2026-11-16), árbol limpio. Developer Hub en `b635205` y runly-web en
`f9c4b3d`, ambos limpios. No se ejecutaron suites, builds ni instalaciones vivas:
cada hecho de este documento procede de la lectura del código citado.

Documentos relacionados, que este diseño no reemplaza:

- [Plan maestro Studio Next](studio-next-master-plan.md) y
  [hoja de ruta](studio-next-implementation-roadmap.md).
- [Arquitectura vigente de Studio](runly-studio-architecture.md),
  [ADR del renderer](adr-runly-studio-renderer.md) y
  [contrato de UI del editor](studio-editor-ui-contract.md).
- Specs vigentes: [multipágina v7](../superpowers/specs/2026-10-26-studio-multipage-design.md),
  [colaboración por operaciones](../superpowers/specs/2026-10-26-studio-realtime-collaboration-design.md),
  [paquete portable](../superpowers/specs/2026-10-26-studio-template-interchange-design.md).
- Paquete portable para desarrolladores: [studio-template-package](../developers/studio-template-package.md).

## 1. Estado real del código

### 1.1 Contrato del documento

| Hecho | Evidencia |
| --- | --- |
| `STUDIO_SCHEMA_VERSION = 7`; la fuente única es el paquete compartido | `packages/studio-interchange/src/studio/document.js`; `apps/shared/studio/document.js` y `pages.js` son reexportaciones de 2 líneas |
| Seis tipos: `text`, `rectangle`, `ellipse`, `image`, `vector`, `line` | `TYPES` en `document.js` |
| Límites: lado 4096 px, 500 objetos/página, 2000/documento, 24 páginas, 100 FileAsset, 4 MB | `STUDIO_LIMITS` |
| Página = cabeza `page/objects` + cola `additionalPages`; `documentPages()` abstrae la colección | `studio/pages.js` |
| El validador es una lista blanca en los tres niveles: objeto (claves por tipo), página (`id`, `name`, `width`, `height`, `background`, `backgroundPaint`, `ppi`) y documento (`schemaVersion`, `unit`, `page`, `objects`, `additionalPages`). Cualquier otra propiedad se **descarta en silencio** | `validateScene` / `validateDocument` |
| La salida siempre se etiqueta con la versión actual: v1–v6 se normalizan a 7 sin UPDATE masivo | retorno de `validateScene` |
| Las propiedades nuevas se condicionan a la versión de entrada (`schemaVersion < 6` para `backgroundPaint`, etc.) | `validateScene` |

### 1.2 Operaciones y concurrencia

`apps/shared/studio/operations.js` define operaciones puras y deterministas:
`upsert`, `remove`, `order`, `page`, `patch`, `patchPage`, `addPage`,
`duplicatePage`, `removePage`, `pageOrder` y `transferObjects`. `diffOps` genera
`patch`/`patchPage` como diferencia **por clave de primer nivel** (`set`/`unset`).
`checkOps` admite solo las claves de `OBJECT_KEYS` y `PAGE_KEYS`, que son una
segunda lista blanca. No existe operación de nivel documento.

Consecuencias verificadas:

1. Un campo nuevo requiere tocar tres listas blancas: validador, `OBJECT_KEYS` y
   `PAGE_KEYS`. Sin las tres, el campo desaparece al guardar o sincronizar.
2. La convergencia es *last-writer-wins* por clave de primer nivel de cada objeto
   o página. Un objeto `motion` anidado haría que dos personas editando entrada y
   salida del mismo objeto se pisaran; claves separadas convergen solas.
3. El historial del cliente (`lib/document-history.js`) llama a `validateDocument`
   en cada commit y `draft-storage.js` también valida. Un cliente con un validador
   antiguo **elimina** los campos que no conoce y, al emitir `upsert` de un
   objeto, sobrescribe en el servidor la versión completa del objeto sin esos
   campos. Es una ruta real de pérdida de datos, no teórica.

### 1.3 Protocolo y guardas

- `apps/shared/studio/protocol.js`: `STUDIO_PROTOCOL_VERSION = 3`, cabecera
  `X-Runly-Studio-Protocol`. El middleware de `routes/studio/index.js` exige
  igualdad exacta en `PUT /studio/designs/:id` y `POST .../changes`.
- `GET /studio/protocol` devuelve `schemaVersion: 7` como literal
  (`index.js:88`) y `studio-application.js:24` fija `protocolVersion: 3`.
- El SDK envía la cabecera como literal `'3'` en `packages/sdk/src/domains/studio.js`.
- La API declara su propio protocolo en la transacción con
  `set_config('runly.studio.protocol','3',true)`: tres sitios en
  `studio-service.js` y dos en `studio-templates-service.js`.
- El trigger SQL `runly_studio.require_document_protocol()` (migración
  `20261208000000_studio_multipage_protocol`) exige protocolo `'3'` para v7,
  `'2'|'3'` para v6 y deniega cualquier bajada de versión, en `studio_design` y
  `studio_template`. Protege contra instancias antiguas de la API; la cabecera HTTP
  protege contra clientes antiguos.

Este patrón (versión de esquema + protocolo + trigger) ya se usó para v6 y v7 y es
la base de la evolución propuesta.

### 1.4 Editor, renderer y exportaciones

- `apps/desktop/package.json` fija `fabric` en `6.9.1` exacto. Solo Studio lo usa
  (ADR del renderer).
- `lib/fabric-adapter.js` tiene **905 líneas**: no admite lógica nueva sin
  superar el límite de 1000. Expone `createStudioEditor` con `selectPage`,
  `addPage`, `updatePage(id, set)` (emite `patchPage`), `activePageId`, `flush`,
  `exportImage`, `exportPage(id, format, quality, scene, {scale, signal})`,
  `exportVariant` y miniaturas. `renderPage` usa un **renderer auxiliar** en cola
  (una escena auxiliar a la vez, presupuesto de dos escenas decodificadas).
- `lib/thumbnail-renderer.js` construye objetos Fabric aislados a partir de items
  canónicos (`StudioPhoto`, `StudioLine`, `createStudioPhoto`) sin el editor: es
  la prueba de que se puede renderizar una escena fuera del editor interactivo.
- `lib/studio-export.js`: PNG/JPG en navegador; PDF por *print job* autorizado
  (`createPrintJob`/`appendPrintPage`/`finishPrintJob`, Sharp + pdf-lib en la
  API); ZPL; creación masiva; `.runlystudio` generado por la API.
- `StudioWorkspace.jsx` (425 líneas) tiene un modo de vista inmersivo
  (`useViewMode` de `@runly/ui`: normal/limpio/pantalla completa) que solo oculta
  el chrome del editor. **No existe reproductor de presentación** ni API
  Fullscreen en Studio.

### 1.5 Colaboración

Operaciones por lotes sobre `POST /studio/designs/:id/changes`, secuencia global,
recibos de operación, canal privado `studio:design:<id>@<authorizationRevision>`,
presencia por página (`studio_presence.page_id`) e historial selectivo
(`{forward, inverse}`). No hay CRDT. Detalle en la spec de colaboración.

### 1.6 Paquete portable y Developer Hub

- `.runlystudio`: `format: 'runly.studio'`, `formatVersion: 1`,
  `minReaderVersion: 1`, `documentSchemaVersion: 7` (`limits.js`). `inspect.js`
  valida con `z.literal(7)` y `portable.schemaVersion !== 7`, mantiene un lector
  por `formatVersion` y reporta paquetes más nuevos sin parsearlos.
  `write.js` ya acepta `compatibility.losses`.
- Developer Hub consume `@runly/studio-interchange` como paquete npm fijado al
  commit fuente `afc28075` (no hubo cambios en el paquete desde entonces): **ya
  comparte validadores**, no los replica. Pero
  `apps/api/src/services/marketplace-resources/studio.js` exige
  `schemaVersion === 7` (`STUDIO_V7_REQUIRED`, línea 45) y crea documentos v7
  (línea 119): un documento v8 sería rechazado.
- Atención al nombre: `runly-developer-hub/apps/web/src/studio` y
  `packages/studio` son el **Module Studio** (constructor de módulos), otro
  producto. No guardan relación con este diseño.

### 1.7 Infraestructura reutilizable fuera de Studio

| Pieza | Estado real | Reutilizable para |
| --- | --- | --- |
| `packages/ui/src/lib/loadFfmpeg.js` | ffmpeg.wasm 0.12, núcleo autoalojado en `public/ffmpeg` (postinstall), ~30 MB bajo demanda; usado por LMS (`hlsPackage.js`, `uploadLessonVideo.js`) | GIF (palettegen/paletteuse) y respaldo de MP4/WebM. No es un motor de escenas |
| `MediaRecorder` | Solo en Chat (grabación) | No sirve para render determinista: graba en tiempo real |
| WebCodecs / muxers / encoders GIF | No presentes | Decisión de Fase 4 |
| `services/document-templates/pptx-template.js` | docxtemplater + PizZip: **rellena** plantillas PPTX existentes | No genera diapositivas. PizZip/JSZip sí sirven para inyectar XML de transiciones |
| `services/document-templates/pdf-convert.js` | Conversión vía Collabora, opcional (`readOfficeConfig`) | Prueba automática de apertura PPTX→PDF cuando Office está configurado |
| `pptxgenjs` | No instalado | Decisión de Fase 5 |
| `apps/api/src/services/website-block-effects.js` | Valida `_animation {preset, duration, delay, easing}` con `EFFECT_PRESETS` de Atlas 0.8.2 (15 presets, ms 0–5000, 5 easings) | Vocabulario compartido de entradas Studio→Website |
| Atlas 0.8.2 | Bloques con posición absoluta (`TextElementBlock`, `ImageElementBlock`, `LogoElementBlock`, geometría con `anchorX/anchorY`) además de `BoxBlock`, `SectionBlock`, etc. | Conversión editable Studio→Website. El contrato exacto de geometría debe verificarse en un spike |
| `packages/studio-interchange/src/website-*.js` | `sectionsToAtlasPage`, `atlasPageToSections`, `mapWebsiteImages`, `websiteThemeToAtlasTokens` | Puente de datos Studio→Website |
| Ayuda del módulo | `apps/api/src/manifests/official/help/runly.studio` | Artículos de Presentar/Animar |

### 1.8 Lo que no existe

Modelo temporal, duración por página, transiciones, animaciones de objetos,
keyframes, reproductor, exportación GIF/WebM/MP4/PPTX, conversión a Website,
paquete portable con animación y enlace público de presentación. Ningún documento
previo cubre estas capacidades (búsqueda en `docs/architecture` y en el plan
maestro histórico).

## 2. Decisiones de arquitectura

### D1. Studio es el origen; los formatos son destinos

Un único documento editable. Presentación, video, GIF, PPTX y Website son
proyecciones de ese documento. No se crea un segundo editor ni se guardan
fotogramas.

### D2. Studio v8 aditivo con versión mínima suficiente

Se rechazan dos alternativas:

- **Campos opcionales dentro de v7.** Los clientes y APIs v7 los eliminarían
  (sección 1.2, punto 3): pérdida silenciosa.
- **Tabla aparte para animaciones.** Rompe la verdad única del documento,
  plantillas, paquete portable, historial selectivo y colaboración por operaciones.

Decisión: `STUDIO_SCHEMA_VERSION = 8` con protocolo 4, pero el validador emite la
**versión mínima suficiente y monótona**:

```
salida = (entrada.schemaVersion >= 8 || usaCamposV8(documento)) ? 8 : 7
```

- Un diseño estático sigue siendo v7: clientes de escritorio/APK antiguos, el Hub
  actual y el paquete portable v1 siguen funcionando con él.
- Al añadir la primera duración, transición o animación, el documento pasa a v8
  y no vuelve a bajar (el trigger ya deniega bajadas).
- Los campos v8 no se condicionan a la versión de entrada (un cliente nuevo los
  añade sobre un documento v7). Los gates por versión existentes (v1–v6) no cambian.

Escrituras por protocolo:

| Documento almacenado o resultante | Cliente (cabecera) | API (`set_config`) |
| --- | --- | --- |
| v1–v7 | 3 o 4 | 3 |
| v8 (almacenado o resultante) | solo 4; con 3 responde 426 `STUDIO_UPGRADE_REQUIRED` | 4 |

La API declara `'4'` solo cuando interviene un documento v8 (`writerProtocol`): una
instalación sin la migración v8 sigue guardando diseños v1–v7 (su trigger exige `'3'`
exacto para v7) y rechaza las escrituras v8 en lugar de perder datos. Implementado en
Fase 1 (2026-11-16).

El chequeo del cliente pasa del middleware a la transacción del servicio, que ya
bloquea la fila y conoce ambas versiones. Nueva migración forward que redefine
`require_document_protocol()`: v8 exige `'4'`; v7 admite `'3'|'4'`; v6 admite
`'2'|'3'|'4'`; bajadas denegadas. Ninguna migración histórica se modifica.

Limitación conocida: un cliente v7 que tiene abierto un diseño cuando otro lo
convierte en v8 no podrá validar el documento recibido. Su borrador local se
conserva y la respuesta 426 le pide actualizar. Es el mismo comportamiento que tuvo
el paso a v7.

### D3. Modelo temporal declarativo

Todo tiempo es un entero en milisegundos relativo al inicio de la diapositiva. Sin
fotogramas, sin código y sin JSON de Fabric. Claves de primer nivel para heredar
la convergencia por clave (sección 1.2, punto 2).

Página:

```js
page.slide = {
  duration: 5000,                 // 500–600000 ms; ausente = 5000
  transition: {                   // entrada a esta diapositiva
    type: 'fade',                 // none | fade | fade-black | slide-* (empujar) | cover-* | uncover-* | wipe-* | split-horizontal | split-vertical | zoom | zoom-out  (* = left | right | up | down)
    duration: 600,                // 0–3000 ms
    easing: 'ease-out'            // linear | ease | ease-in | ease-out | ease-in-out (los mismos de Atlas)
  }
}
```

Objeto (todas opcionales e independientes):

```js
enter:    { preset: 'slide-up', duration: 600, delay: 0, easing: 'ease-out' }
exit:     { preset: 'fade',     duration: 400, delay: 4200, easing: 'ease-in' }
emphasis: { preset: 'pulse',    duration: 800, delay: 1500, easing: 'ease-in-out', repeat: 2 }
keyframes: [ { at: 0, x: 80, opacity: 0 }, { at: 1200, x: 400, opacity: 1, easing: 'ease-out' } ]
```

- Presets de entrada/salida: `fade`, `slide-up`, `slide-down`, `slide-left`,
  `slide-right`, `slide-fade-up`, `slide-fade-down`, `slide-fade-left`,
  `slide-fade-right`, `zoom-in`, `zoom-out`, `rotate`, `pop` y, desde 2026-11-18,
  `wipe-*`, `reveal`, `float-*`, `fly-*`, `grow`, `elastic`, `spiral`
  (`*` = `left|right|up|down`, la dirección es la del movimiento). Website traduce
  `float-*` → `slide-fade-*`, `fly-*` → `slide-*`, `grow` → `zoom-in`; `pop`, barridos,
  `reveal`, `elastic` y `spiral` se omiten con aviso. Barridos y `reveal` recortan la
  caja visual: `sceneAt` añade al objeto evaluado `clip: {left, top, right, bottom}`
  (fracciones), clave solo de reproducción que nunca entra en el documento. Se excluyen
  `blur-in` y `flip-up`: requieren filtros o 3D que Fabric 2D no representa de
  forma uniforme en los seis tipos.
- Énfasis: `pulse`, `spin`, `shake`, `bounce`, `swing`, `wobble`, `soft-pulse`,
  `tremble`, `tilt`, `jelly`, `enlarge`; `repeat` 1–20. Todos están en reposo al inicio y
  al final de cada repetición.
- Transiciones: las capas de `transitionAt` llevan además `clip` opcional y `front`
  (capa que va delante). Retroceder reproduce la transición de la diapositiva que se
  deja exactamente al revés (progreso 1 − p con las capas intercambiadas).
- `duration` 0–10000; `delay` 0–600000. Un efecto que termina después de la
  diapositiva **no invalida el documento**: la evaluación lo recorta al final de la
  diapositiva. Así, acortar una diapositiva nunca rechaza el cambio (decisión de
  Fase 1, 2026-11-16).
- `keyframes`: 2–32 entradas, `at` estrictamente creciente en 0–600000.
  Propiedades animables: `x`, `y`, `rotation`, `opacity`, `scale` (multiplicador
  0.02–8 alrededor del centro). Cada propiedad forma su propia pista con los
  keyframes que la contienen; antes del primero se mantiene el primero y después
  del último, el último. Si una propiedad no aparece en ninguna entrada, se usa
  el valor base.
- Límites de documento: 2000 efectos (`enter`+`exit`+`emphasis`) y 8000 keyframes
  en total; duración total ≤ 60 min. Mantienen el JSON bajo el límite de 4 MB y
  acotan el trabajo de evaluación.
- `groupId`: la animación es por objeto; la UI aplica el mismo efecto a todos los
  miembros. No se introduce un nodo de grupo.

**El contrato v8 completo (página y objeto) entra en Fase 1**, aunque la UI de
Fase 1 solo edite `slide`. Así, un cliente de Fase 1 no elimina las animaciones
creadas en Fase 2 y no hace falta una v9. Si Fase 2 tiene que cambiar la forma de
estos campos, será v9 con el mismo mecanismo de D2.

### D4. Motor de animación puro y compartido

Nuevo módulo `packages/studio-interchange/src/studio/motion.js` (reexportado en
`apps/shared/studio/motion.js`), sin navegador ni Fabric:

| Función | Resultado |
| --- | --- |
| `validateSlide(page)`, `validateMotion(object, slideDuration)` | Usadas por `validateDocument` |
| `easing(name, x)` | Curvas cúbicas fijas en JS: no dependen de CSS ni del navegador |
| `slideTimeline(scene)` | Duración efectiva y eventos ordenados |
| `sceneAt(document, pageId, t)` | **Escena estática válida** (sin campos de animación) con las propiedades resueltas en `t`; omite los objetos no visibles en ese instante |
| `transitionAt(transition, progress)` | `{outgoing, incoming}` con `{opacity, dx, dy, scale}` normalizados |
| `presentationSequence(document)` | Lista de páginas con duración y transición efectivas |

Orden de composición en `sceneAt`: valor base → pistas de keyframes → `enter`
(desde el estado inicial del preset hasta el base) → `emphasis` (relativo) → `exit`.
Antes de que empiece su `enter`, el objeto está oculto; después de terminar su
`exit`, también. La escala se aplica alrededor del centro respetando el origen de
rotación del contrato; la fórmula exacta se fija con pruebas de fotogramas en
Fase 2 (riesgo R4).

Todos los renderers consumen `sceneAt`: el editor en modo previsualización, el
reproductor, la exportación de video/GIF y, como estado final, PPTX y Website. La
animación nunca vive en componentes React ni en `fabric-adapter.js`.

### D5. Determinismo

- Nivel escena: `sceneAt(doc, page, t)` es función pura; las pruebas comparan
  JSON exacto contra vectores dorados.
- Nivel píxel: solo dentro del mismo navegador/plataforma con fuentes cargadas
  (`ensureStudioFont`) e imágenes decodificadas antes del primer fotograma. Los
  hashes de píxeles se guardan por entorno, no como verdad universal.
- Reloj: la reproducción usa `t = ahora − inicio` (sin acumular deltas). La
  exportación usa reloj virtual `t_i = i × 1000 / fps`; nunca tiempo real.

### D6. Renderizado en dos etapas

1. **Fase 1 (diapositivas sin animación de objetos):** el reproductor rasteriza
   cada página con `editor.exportPage(id, 'png', 1, snapshot, {scale})` a la
   resolución de la pantalla, mediante la cola auxiliar existente. Conserva el
   presupuesto de dos escenas decodificadas, la reautorización de imágenes y la
   cancelación. Se precargan anterior, actual y siguiente (LRU de 3 blobs, object
   URLs liberadas). Las transiciones se componen con `transitionAt` sobre dos capas.
2. **Fase 2 en adelante:** `lib/motion-renderer.js`, un `StaticCanvas` de solo
   lectura que construye los objetos una vez con los mismos constructores que
   `thumbnail-renderer.js` y por fotograma solo actualiza propiedades a partir de
   `sceneAt`. Lo usan la previsualización, el reproductor y la exportación de
   fotogramas. Vive fuera de `fabric-adapter.js`.

La interfaz del reproductor no cambia entre etapas: `frameSource(pageId, t)`
devuelve una imagen o canvas que dibujar.

### D7. Presentación

Superposición a pantalla completa lanzada desde el editor (también para
colaboradores de solo lectura). Usa la API Fullscreen sobre su propio elemento,
con respaldo a `fixed inset-0` cuando no está disponible (iPhone, WebView sin
permiso). Teclado, clic, toque y deslizamiento. Reproducción automática con la
duración de cada diapositiva, pausa y bucle como opciones del reproductor, no del
documento. `prefers-reduced-motion`: transiciones como corte y animaciones de
objeto en su estado final, con una opción explícita para reproducirlas. Detalle
en la [spec de Fase 1](../superpowers/specs/2026-11-16-studio-next-phase1-presentations-design.md).

Fuera del alcance inicial: enlace público de presentación. Cuando se haga, seguirá
la regla de rutas públicas `/app/p/<feature>/<token>` y `publicResources`, con
capacidad de imagen firmada por diseño.

### D8. Exportación animada (GIF, WebM, MP4)

Pipeline en navegador: `sceneAt` → `motion-renderer` → `VideoFrame` → encoder.

- **WebM/MP4:** WebCodecs `VideoEncoder` (VP9/VP8 y H.264 cuando el navegador lo
  ofrece; Chromium, WebView2 y Android WebView) + un muxer ligero. Respaldo:
  secuencia PNG → ffmpeg.wasm existente (lento, para piezas cortas).
- **GIF:** ffmpeg.wasm existente con `palettegen`/`paletteuse`. No se añade otra
  dependencia.
- Presupuestos iniciales: vídeo ≤ 1920×1080, ≤ 30 fps, ≤ 120 s (3600
  fotogramas); GIF ≤ 800 px de lado, ≤ 15 fps, ≤ 15 s. Cancelable, con progreso,
  sin conservar fotogramas en memoria (codificación en streaming).
- Sin audio hasta el paquete portable v2.
- Render en servidor: fuera del alcance mientras los presupuestos de navegador
  basten. Requeriría Chromium headless en la cola de trabajos, fuentes instaladas
  y límites de CPU/memoria (ADR del renderer, pendientes).

Se descarta Remotion: reimplementa la escena en React y su licencia comercial
exige evaluación. Duplicaría el renderer en lugar de reutilizar Fabric.

### D9. PPTX editable

- Generación en navegador, en un chunk lazy: reutiliza el renderer auxiliar para
  rasterizar lo incompatible y las imágenes autorizadas que el editor ya resuelve.
- Generador candidato: `pptxgenjs` (MIT), a confirmar con un spike. Mapeo:
  texto → cuadro de texto editable con nombre de fuente (no se incrustan fuentes:
  advertencia); rectángulo/elipse/línea → formas nativas; imagen → imagen con
  recorte; vector, degradados, rellenos de foto, sombras y códigos → PNG
  rasterizado, con advertencia por objeto.
- Transiciones y avance automático (`<p:transition>`, `advTm`) se inyectan después
  con JSZip, ya presente. Las animaciones de objeto no se convierten en la primera
  entrega; se declaran como pérdida.
- Verificación: apertura real en PowerPoint, LibreOffice y Google Slides
  (manual) y conversión Collabora PPTX→PDF automática cuando Office está
  configurado.

### D10. Studio → Website (Atlas)

Acción «Enviar a Website» que crea un **borrador** de página, nunca publica.
Conversión en la API (necesita copiar imágenes a los recursos del sitio con
autorización de Files del actor, igual que la regla del portapapeles entre
diseños: el permiso sobre un diseño ajeno no transfiere sus imágenes).

- Texto → `TextElementBlock`; imagen → `ImageElementBlock`; rectángulo/elipse →
  `BoxBlock` con fondo y radio; vectores y efectos complejos → imagen PNG (nunca
  SVG sin sanear).
- Posición: geometría absoluta de los element blocks dentro de una sección del
  tamaño de la página. Revisión responsiva en Website.
- `enter` → `_animation` con la tabla de presets de D3; `emphasis`, `exit` y
  `keyframes` se reportan como pérdidas.
- Reutiliza `website-document.js` y el validador `website-block-effects.js`. El
  contrato exacto de geometría de Atlas 0.8.2 se verifica en un spike antes de la
  spec (riesgo R7).

### D11. Paquete portable v2 y Developer Hub

- `formatVersion: 2`, `documentSchemaVersion: 8`, lector v1 conservado. Los
  diseños sin campos v8 se siguen escribiendo como paquete v1 (proyección exacta),
  de modo que el Hub actual los acepta sin cambios.
- Hasta Fase 6, exportar un diseño v8 elimina `slide`/`enter`/`exit`/`emphasis`/
  `keyframes` y lo declara en `compatibility.losses` (mecanismo existente).
- Fase 6: publicar una nueva versión fijada de `@runly/studio-interchange`,
  actualizar el Hub (`marketplace-resources/studio.js`: aceptar 7 y 8) y la
  herramienta MCP de contrato. Audio y video embebido quedan para un
  `formatVersion` posterior.

## 3. Seguridad y permisos

- Sin endpoints nuevos en Fase 1. Presentar requiere `studio.view` y acceso al
  diseño (dueño, colaborador VIEWER/EDITOR), igual que abrir el editor.
- Toda rasterización pasa por `resolveImage`, que reautoriza originales; las
  imágenes nunca se cachean más allá de la vida del reproductor.
- Los límites de D3 protegen contra paquetes o lotes MCP que intenten agotar CPU
  con miles de efectos. `checkOps` sigue limitando a 500 operaciones por lote.
- Las exportaciones animadas no suben nada por defecto; guardar en Files exige
  `files.create` y el flujo existente.
- PPTX y GIF/MP4 se generan con los originales autorizados en ese momento; una
  revocación durante la exportación la invalida (mismo criterio que el PDF).
- Website: conversión server-side con autorización Files por imagen y validación
  de efectos de Atlas; nunca HTML ni SVG crudo.

## 4. Estrategia de pruebas

Runner `node:test`. Suites dirigidas, no globales.

| Nivel | Qué | Dónde |
| --- | --- | --- |
| Contrato | v8 válido/ inválido, límites, versión mínima y monótona, v1–v7 intactos, `checkOps` con claves nuevas | `packages/studio-interchange` y `apps/shared/studio/*.test.js` |
| Motor | Vectores dorados de `sceneAt`, `transitionAt`, `easing`, bordes (t=0, t=fin, solapes) | `apps/shared/studio/motion.test.js` |
| Operaciones | `diffOps`/`applyOps`/`compactOps` con `slide` y efectos; convergencia de efectos distintos del mismo objeto | `operations.test.js` |
| API | Matriz protocolo × versión (D2), 426 para cliente 3 sobre v8 | `routes/studio/studio-routes.test.js` |
| SQL | Trigger nuevo en PostgreSQL desechable | `studio-postgres.test.js` (patrón existente) |
| Paquete | v7 sin cambios; v8 → v1 con pérdidas declaradas | `interchange.test.js` |
| Navegador | Presentar, navegar, autoplay, reduced motion, dos sesiones | scripts `.e2e` con Playwright y la empresa de pruebas local |
| Exportación | Recuento de fotogramas, duración del archivo, cancelación, presupuesto | Fase 4 |
| Regresión | PNG/JPG/PDF/ZPL, plantillas, MCP, colaboración | Suites Studio existentes |

## 5. Riesgos

| Id | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Pérdida de campos v8 por clientes o APIs antiguos | D2: protocolo 4, chequeo en transacción y trigger |
| R2 | Instalaciones de escritorio/APK antiguas sin poder editar diseños v8 | Versión mínima: los diseños estáticos siguen en v7; mensaje 426 existente |
| R3 | Rendimiento de reproducción con 500 objetos y fotos grandes | Fase 1 rasteriza por diapositiva; Fase 2 actualiza propiedades sin reconstruir; medir FPS antes de cerrar la fase |
| R4 | Fórmula de escala/rotación alrededor del centro frente al origen del contrato | Vectores dorados y comparación visual en Fase 2 |
| R5 | Disponibilidad de H.264 en WebCodecs según navegador | WebM como salida por defecto; respaldo ffmpeg.wasm |
| R6 | Fidelidad PPTX (fuentes, vectores) | Rasterizado con advertencias; matriz de apertura real |
| R7 | Contrato de geometría Atlas no documentado en Runly | Spike antes de la spec de Fase 7 |
| R8 | Hub rechaza v8 (`STUDIO_V7_REQUIRED`) | Paquete v1 por proyección y pérdidas hasta Fase 6 |
| R9 | `fabric-adapter.js` y `StudioWorkspace.jsx` cerca del límite de líneas | Componentes y módulos nuevos; integración mínima en ambos |
| R10 | Fullscreen en Tauri/WebView2 y iOS | Respaldo `fixed inset-0`; verificar permiso de ventana de Tauri |
