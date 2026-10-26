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
| Líneas | `editor/LineSelectionControls.jsx` | `patch({ strokeWidth, dash, startCap, endCap, fill })`; dos menús independientes con los siete extremos v5 dibujados con `lineCapPath` |
| Formas (v5) | `editor/ShapeSelectionControls.jsx` (`ShapeStyleFields`), sección «Foto, relleno y borde» de Propiedades | `setShapeStyle({ fillEnabled, strokeWidth, strokeColor, dash, radius })` (radio solo en rectángulos), `setPhotoFill`, `removePhotoFill`, `patch({ fill })` |
| Foto dentro de una forma | `useCanvasDrop.js`, `useImageTools.js` (`fillShape`), `lib/photo-target.js` | Soltar una foto sobre una forma compatible (`supportsPhotoFill`) llama a `setPhotoFill`; sobre una forma que ya tiene foto o un marco, `replaceImage`. «Poner una foto dentro» espera la próxima foto elegida en Imágenes. Encuadre, filtros, ajustes, voltear, reemplazar y «Editar imagen» usan las mismas operaciones que los marcos |
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
  foto recién insertada no está vinculada hasta guardar. `save()` devuelve si el
  servidor tiene la escena y una segunda llamada se une al guardado en curso; si
  no se pudo guardar (conflicto, permisos) se muestra el motivo y no se pide la
  imagen, en lugar del antiguo «Imagen no encontrada».
- Una forma con foto no ofrece Marcos, borde ni radio de marco: la máscara, el
  borde y las esquinas son los de la propia forma (`shape`). La opacidad está en
  la barra común. El encuadre dibuja el contorno real de la forma (`shapeOutline`).

## Pendiente en el motor (no se ofrecen controles)

1. **Quitar fondo.** El motor lo mantiene experimental (sin `editor.removeBackground`
   ni endpoint). La UI (`BackgroundRemovalDialog.jsx`) solo aparecerá cuando exista
   `removeBackground(id, { signal, onProgress })`; no se habilita desde la interfaz.
2. **Borde interior/exterior.** Solo `strokeAlign: 'center'`; no se ofrece selector.
3. **Fotos en iconos de trazo** y vectores de varios trazos: `supportsPhotoFill`
   los rechaza; Propiedades lo explica y la barra no ofrece «Poner una foto dentro».

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

Cierre v5 (2026-10-26), `.e2e/studio-v5-real.mjs` contra una pila Supabase local
desechable (`createStudioStack`: PostgreSQL, Auth, Storage, Realtime y la API de
HEAD en contenedores propios, migraciones aplicadas solo ahí) y el build web del
árbol de trabajo: 30 comprobaciones, 0 fallos, 0 errores de página. Incluye foto
arrastrada a rectángulo (mismo ID/orden, color base conservado), deshacer/rehacer
tras guardar, borde 6 discontinuo con color, radio, relleno desactivado, quitar y
recuperar foto, foto en elipse por selección pendiente, encuadre en un paso,
filtros, los siete extremos en ambos lados, «Editar imagen» con cambios sin guardar
(foto nueva y foto reemplazada en forma), recarga, aviso al salir con cambios y
barrido 1440/820/390 claro y oscuro sin desbordamiento, con popovers dentro de la
ventana y menús alcanzables por teclado.

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
- Editar contenido trabaja sobre una **copia de trabajo** (un diseño normal en Mis diseños). El aviso lo dice, explica que la plantilla solo cambia con «Guardar en la plantilla», y tras guardar confirma que la copia sigue en Mis diseños. Ese botón también guarda la copia de trabajo para que ambas coincidan, ignora clics repetidos y, ante un 409, conserva la edición: «Cargar revisión actual» y después «Sobrescribir con mi versión», o «Terminar» sin tocar la plantilla.
- La copia de trabajo de cada plantilla se recuerda en el navegador (`templates/template-work.js`, por empresa y usuario). Un segundo «Editar contenido» ofrece «Continuar con la copia» o «Crear copia nueva»; no se borra ningún diseño. Crear diseño o copia de trabajo ignora clics repetidos.
- Textos: publicar comparte solo dentro de la empresa; ningún archivo se vuelve público.

Verificación con backend real (2026-10-26, `.e2e/studio-v5-real.mjs`, pila desechable): guardar personal desde el editor (con foto en forma), compartir con la empresa, editar contenido y guardar (doble clic = un guardado; plantilla y copia de trabajo coinciden), 409 tras un cambio externo con sobrescritura, reutilizar la copia de trabajo, usar la plantilla, retirar. Usuario sin `studio.templates.publish`: no ve «Toda la empresa» ni acciones sobre plantillas de empresa, guarda plantillas personales, y el backend responde 403 a crear de empresa, publicar, editar y retirar una de empresa.

Verificación anterior: `.e2e/studio-templates-ui.mjs` (escritorio 1440 claro, tableta 820, teléfono 390 oscuro): 13 comprobaciones por tamaño. La base de desarrollo no tiene aplicada la migración `20261205000000_studio_templates` (toda `/studio/templates` responde 500), por lo que la prueba sustituye solo esas rutas con un servicio en memoria que sigue el contrato (`.e2e/lib-templates-fake.mjs`); los diseños creados desde plantilla usan la API real.

## Composición v6: rellenos, degradados, guías, cuadrícula y grupos (interfaz)

Controles sobre las operaciones reales v6 de `fabric-adapter.js` (contrato en
`studio-editor-ui-contract.md`). Nada de esto añade CSS ni preferencias al JSON.

| Superficie | Componente | Operaciones del motor |
| --- | --- | --- |
| Tipo de relleno (Ninguno / Color / Degradado / Foto) | `editor/paint/FillControls.jsx` (`FillPicker` en Propiedades, `FillPopover` en la barra) | `setShapeStyle({fillEnabled})`, `setSolidFill`, `setGradient`, `setPhotoFill` (vía selección de foto); cada cambio de tipo es un paso de deshacer |
| Editor de degradados | `editor/paint/GradientEditor.jsx` | `updateGradientStop`, `addGradientStop`, `removeGradientStop`, `reverseGradient`, `resetGradient`, `setGradient` (tipo, ángulo, centro, radio, presets) |
| Fondo de página | `editor/paint/PageBackground.jsx` en el panel Página | `setPageBackground`, `setPageGradient`; «Aplicar a la forma seleccionada» / «Usar como fondo de la página» reutilizan la pintura |
| Guías inteligentes | `editor/canvas/CanvasOverlays.jsx` (`GuidesOverlay`) | `onGuides`: línea de 1 px de pantalla con halo, discontinua para separación/cuadrícula y etiqueta de separación |
| Cuadrícula y reglas | `GridOverlay`, `Rulers` | `setGridOptions`, `setViewport` (zoom mostrado y desplazamiento de la página en el viewport), marcas de `onEditorPreferences` |
| Preferencias del lienzo | `editor/canvas/CanvasPreferencesMenu.jsx` en la píldora de zoom, `useCanvasPreferences.js` | `setSnappingOptions`; imán de un clic; menú con página/objetos/cuadrícula, guías visibles, cuadrícula, reglas y tamaño. Guardado por persona en `localStorage` |
| Grupo | Sección «Grupo» y «Transformar grupo» de Propiedades | `group`, `ungroup`, `duplicate`, `align`, `transformGroup(id, {scale|rotation, origin: centro})` seguido de `selectGroup` |

Reglas:

- Arrastrar un punto, los deslizadores de ángulo, opacidad, tamaño y centro usan
  `beginInteraction`/`endInteraction`: un gesto = un paso de deshacer. Las
  llamadas al motor se serializan y durante un arrastre solo se envía el último
  valor pendiente. El tirador conserva la captura del puntero aunque los puntos
  se reordenen; los desplazamientos se separan 0,001 para no duplicarse.
- Teclado en los puntos: flechas ±1 % (Mayús ±10 %), Supr/Retroceso quita el
  punto (sin propagarse al atajo «Eliminar selección»). Clic en la barra añade un
  punto con el color interpolado.
- Atajos: Ctrl+' cuadrícula, Mayús+R reglas, Alt al mover desactiva el ajuste
  (motor). Las preferencias no entran en el diseño, exportación ni colaboración.
- Los manejadores de escala/giro múltiple de Fabric siguen bloqueados por el
  motor; la escala y el giro de grupo son pasos de 10 %, 15°, 90°, 180° y ×2
  alrededor del centro visual. No hay grupos anidados (el motor no los soporta).

Verificación (2026-10-26, `.e2e/studio-v6-ui.mjs`, servidores locales y empresa
de pruebas): 14 comprobaciones, 0 fallos, 0 errores de página. Degradado lineal
por defecto; arrastre de un punto deshecho en un paso; añadir, opacidad y quitar
punto; radial con tamaño; ángulo 45° e invertir; fondo «Noche» y reutilización en
la elipse; guías visibles durante el arrastre y eliminadas al soltar; imán
desactivado sin guías ni ajuste; cuadrícula y reglas por menú y atajos (sin
entrar en el JSON); grupo ampliado 110 % y girado 15° con deshacer/rehacer;
recarga sin errores; PNG exportado con los colores de los extremos del degradado
y de las esquinas del fondo; 390/820/1440 px claro y oscuro sin desbordamiento.

Hallazgo para el motor: al ajustar al centro de página una elipse de 300 px con
degradado, la guía se dibuja en 540 pero el centro guardado queda en 541
(1 px de diferencia, probablemente por el rectángulo envolvente de Fabric).
