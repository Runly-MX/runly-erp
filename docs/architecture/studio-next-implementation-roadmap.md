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

Pendientes que pasan a Fase 2:

- `sceneAt` (composición de efectos y keyframes) y su recorte al final de la diapositiva.
- `resizeDocument` con escala de contenido no escala `x`/`y` absolutos de keyframes.
- La exportación de una página activa deselecciona el objeto del editor
  (`discardActiveObject`) al presentar; preservar la selección.
- `atlas_unaccent` falta en el fixture de `studio-postgres.test.js` (3 subpruebas fallan
  desde `100b42305`, ajeno a Studio Next).
- `apps/api/src/mcp/__tests__/official-domains.js` (casos MCP) no se ejecutó.
- Prueba visual de deslizamiento y acercamiento; prueba en iPhone real y en Tauri/WebView2.

Criterios de cierre:

- Presentar un diseño de 3 o más páginas desde el editor, con teclado, clic,
  toque, reproducción automática, pausa, bucle y salida, en escritorio y teléfono.
- Duración y transición guardadas, sincronizadas a otra sesión y reabiertas.
- Un diseño sin ajustes de diapositiva sigue guardándose como v7.
- Cliente de protocolo 3 sobre un diseño v8: 426 y borrador conservado.
- Exportaciones PNG/JPG/PDF y `.runlystudio` sin regresión; el paquete de un
  diseño v8 se exporta como v1 con pérdidas declaradas.

## Fase 2 — Motor de animación

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

Spike previo: `pptxgenjs` en el navegador frente a escribir OOXML con JSZip;
transiciones inyectadas; apertura en PowerPoint, LibreOffice y Google Slides.

Entregables: `lib/studio-pptx-export.js` en un chunk lazy, mapeo D9, informe de
compatibilidad por objeto antes de descargar, transiciones y avance automático, y
prueba automática Collabora PPTX→PDF cuando Office esté configurado.

Criterios de cierre: texto editable con la fuente nombrada; formas nativas con su
geometría, orden y rotación; una advertencia por cada objeto rasterizado; la
matriz de apertura manual queda documentada. Resuelve R6.

## Fase 6 — Paquete portable v2 y Developer Hub

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
