# Studio — herramientas visuales de foto, marcos, elementos y grupos

Capa de interfaz sobre las capacidades del motor descritas en
`studio-editor-ui-contract.md`. No cambia el documento, la API ni la
persistencia: cada control llama a una operación real de `fabric-adapter.js`.

## Superficies

| Superficie | Componente | Operaciones del motor |
| --- | --- | --- |
| Barra contextual de imagen | `editor/image/ImageSelectionControls.jsx` | `editImage`, `patchImage` (`flipX`, `flipY`, `fit`, máscara), `patch({ opacity })`, `resetImageFraming`, `resetImageAdjustments` |
| Marcos (popover, Elementos) | `editor/image/FramesGrid.jsx`, `lib/frame-shapes.js` | `patchImage({ mask, radius, border, shadow })`; nunca toca el encuadre |
| Editar encuadre | `editor/image/FramingOverlay.jsx`, `FramingBar.jsx` | `beginInteraction` → `patchImage({ offsetX, offsetY, zoom, fit })` → `endInteraction(commit)` |
| Panel Imagen (Filtros, Ajustes, Efectos) | `editor/image/ImagePanel.jsx` | `updateImageAdjustments`, `patchImage({ adjustments, border, shadow, radius })`, `patch({ opacity })` |
| Reemplazar foto / marco sin foto | `editor/image/useImageTools.js`, `PendingPhotoBanner.jsx` | `beginInteraction`, `add`, `remove`, `replaceImage`, `patchImage`, `endInteraction` (un solo paso de deshacer) |
| Biblioteca de Elementos | `editor/elements/ElementsLibrary.jsx`, `lib/element-library.js` | `add('rectangle' \| 'ellipse' \| 'line' \| 'vector')`; figuras = iconos Tabler reales vía `catalogImport` |
| Bloques combinados | `StudioWorkspace` `addBlock` | `add` × n + `selectMany` + `group`, dentro de una interacción |
| Grupos | `SelectionBar`, `LayersPanel` | `group`, `ungroup`, `selectGroup`; Ctrl+G / Ctrl+Shift+G |
| Líneas | `editor/LineSelectionControls.jsx` | `patch({ strokeWidth, dash, startArrow, endArrow, fill })` |
| Texto | `editor/TextSelectionControls.jsx` | `patch({ fontFamily, fontVariant, textAlign, lineHeight, charSpacing, underline, linethrough })`; solo variantes con archivo real (`studioFontStyle`) |
| SVG | `ElementsLibrary` → `importSvg` | importación saneada con advertencias |

Reglas de interacción:

- Los gestos continuos (sliders, arrastre de encuadre) no usan el estado `busy` del
  workspace, para que el control no se deshabilite a mitad de gesto. Cada gesto
  es un paso de deshacer (`SliderRow` `onStart`/`onCommit` → `begin`/`end`).
- `begin`/`end` se encadenan en orden estricto: `endInteraction` espera ajustes
  pendientes y una nueva interacción no debe adelantarse.
- En "Rellenar" el encuadre limita el desplazamiento para que la foto cubra
  siempre el marco; fuera de la máscara se ve la foto en fantasma (40 %).
- "Editar imagen" guarda el diseño antes de abrir el editor fotográfico si hay
  cambios: el editor lee la imagen por los activos del diseño (`assetUrl`), y una
  foto recién insertada no está vinculada hasta guardar.

## Pendiente en el motor (no se ofrecen controles)

1. **Quitar fondo.** La UI (`BackgroundRemovalDialog.jsx`) solo aparece si el
   motor expone `removeBackground(id, { signal, onProgress })` que resuelva
   `{ beforeUrl, afterUrl, apply(), discard() }`. `apply()` guarda una copia; el
   original no cambia. Estados ya diseñados: inicial, progreso, comparación
   antes/después, error, cancelación y confirmación.
2. **Cabezas de línea.** Hoy solo hay flecha triangular (`startArrow`/`endArrow`).
   Propuesta: `startCap`/`endCap` con `none | arrow | open-arrow | circle | square | bar | diamond`.
3. **Esquinas en formas.** `rectangle` no admite radio; las píldoras y tarjetas
   redondeadas de la biblioteca solo existen como marcos de foto.

## Verificación

Playwright contra los servidores locales y la empresa de pruebas
(`.e2e/studio-photo-tools-ui.mjs`, `.e2e/studio-elements-ui.mjs`), con una foto
generada de 1600 × 1067 (`.e2e/fixtures/studio-photo.jpg`):

- Foto en círculo, explorador de marcos, modo encuadre con arrastre limitado y
  fantasma, slider de brillo por teclado (+25, sin errores de interacción),
  filtro aplicado y deshecho en un paso, editor fotográfico abierto con
  «Guardar copia en Studio»; 1440 px claro y 390 px oscuro.
- Figura del catálogo, línea ondulada con doble flecha, bloque agrupado con
  «Grupo 1 · 3 elementos» en Capas, texto centrado desde el popover de párrafo,
  sin selector de variantes para la fuente del sistema; 1440 px claro/oscuro y 390 px.
- ESLint y `pnpm --filter @runly/desktop build:web` aprobados.

## Plantillas personales y de empresa (interfaz)

Operaciones conectadas (SDK `runly.studio`, contrato en `docs/integrations/RUNLY_STUDIO_TEMPLATES_API.md`):

| Acción | UI | SDK |
| --- | --- | --- |
| Listar por origen | Filtro Todas / De Runly / Mis plantillas / De mi empresa en Plantillas | `templates(token, { scope, q, category, page })` |
| Guardar como plantilla | Editor: botón de plantilla (escritorio) o menú «Más opciones» (teléfono) | `saveTemplate({ name, category, description, scope, document })` |
| Editar nombre y categoría | Menú de la tarjeta y del visor | `updateTemplate(id, { revision, name, category, description })` |
| Editar contenido | Menú → crea un diseño desde la plantilla (`?template=`) y «Guardar en la plantilla» | `createFromTemplate`, `templateDetail`, `updateTemplate(id, { revision, document })` |
| Compartir con la empresa | Menú (solo personales con `canPublish`) | `publishTemplate(id, revision)` |
| Retirar | Menú con confirmación (retiro lógico) | `retireTemplate(id, revision)` |
| Usar | Visor «Usar esta plantilla» | `createFromTemplate(key)` |

Reglas:

- Las acciones por plantilla dependen solo de `canEdit`, `canDelete` y `canPublish`. Las de Runly y las de empresa ajenas sin permisos no muestran menú.
- Al crear (sin fila todavía) el alcance «Toda la empresa» aparece con `studio.templates.publish`; guardar requiere `studio.templates.manage` o publish (permisos efectivos del perfil, o administrador).
- Guardar como plantilla espera `editor.flush()` y envía el documento completo del editor (incluye cambios sin guardar). Nunca se envía `preview`.
- 409 `STUDIO_REVISION_CONFLICT`: el diálogo conserva lo escrito y ofrece «Cargar versión actual»; publicar y retirar recargan la revisión y piden repetir.
- Textos: publicar comparte solo dentro de la empresa; ningún archivo se vuelve público.

Verificación: `.e2e/studio-templates-ui.mjs` (escritorio 1440 claro, tableta 820, teléfono 390 oscuro): 13 comprobaciones por tamaño. La base de desarrollo no tiene aplicada la migración `20261205000000_studio_templates` (toda `/studio/templates` responde 500), por lo que la prueba sustituye solo esas rutas con un servicio en memoria que sigue el contrato (`.e2e/lib-templates-fake.mjs`); los diseños creados desde plantilla usan la API real.
