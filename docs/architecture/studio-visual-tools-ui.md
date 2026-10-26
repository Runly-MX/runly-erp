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
| Cuadrícula y reglas | `GridOverlay`; reglas en `editor/canvas/Rulers.jsx` | Cuadrícula: `setGridOptions`. Reglas sin ida y vuelta al motor: pasos «redondos» 1-2-5 × 10ⁿ según el zoom (etiquetas ≥ 64 px, 4–5 subdivisiones), marcas que solo cambian con el zoom y un único `transform` por fotograma al desplazar (sin temblor), líneas nítidas, tramo de la página resaltado y extensión de la selección en fucsia |
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

## Arrastrar y soltar desde los paneles

Todos los mosaicos de Elementos (formas, figuras, líneas, bloques), Texto e
Imágenes usan `draggable()` de `lib/studio-drag.js`:

- **Ratón/lápiz:** arrastre HTML5 con imagen de arrastre propia (el mosaico como
  tarjeta elevada). **Táctil:** mantener ~220 ms levanta el mosaico; una copia
  flotante sigue al dedo por encima de él, la hoja del panel se aparta en el
  teléfono y al soltar sobre el lienzo se inserta allí. Mover antes de ese tiempo
  desplaza el panel (no arrastra); soltar fuera del lienzo no inserta nada.
- **Lienzo:** `useCanvasDrop` dibuja el contorno de aterrizaje con el tamaño real
  del elemento (`DropLandingHint`), o «Suelta para rellenar» sobre un marco o una
  forma compatible con foto. La misma lógica atiende ratón y dedo.
- Las fotos se pueden arrastrar aunque su miniatura no haya cargado.

Verificación (2026-10-26, `.e2e/studio-dnd-probe.mjs`, empresa de pruebas):
ratón — rectángulo y texto insertados con contorno visible y foto convertida en
relleno del rectángulo al soltarla encima; táctil 390 px — círculo y subtítulo
insertados por pulsar-y-arrastrar, y un deslizamiento rápido en el panel no
inserta nada. Sin errores de página.

## Descargar: formatos, dimensiones reales y estados

`editor/ExportDialog.jsx` (botón «Descargar» de la barra; «Descargar…» en el
menú del teléfono). Las opciones se recuerdan por navegador y los créditos se
revisan después, como antes. El diálogo no calcula límites por su cuenta: usa
`apps/shared/studio/export-limits.js` (los mismos que aplica el motor) a través
de `lib/studio-export-plan.js`, una función pura con prueba.

| Formato | Para qué | Opciones | Dónde se genera |
| --- | --- | --- | --- |
| PNG | Gráficos y logotipos; sin pérdida | ×1/×2/×3, fondo transparente | Navegador |
| JPG | Fotografías; archivo ligero, sin transparencia | ×1/×2/×3, calidad 50–100 % | Navegador |
| PDF para imprimir | Imprenta | Medidas en mm desde la resolución del diseño (72/96/150/300 ppp), perfil CMYK o RGB, sangrado de 3 mm, marcas de corte | Render PNG a 300 ppp en el navegador; el PDF lo arma `POST /studio/designs/:id/export/print-pdf` |

Bloque fijo «Se generará…» (siempre visible, también en el teléfono, fuera del
área que se desplaza; `role="status"`):

- PNG/JPG: «Tamaño final» en píxeles y megapíxeles.
- PDF: «Medida de corte» en mm, «Hoja del PDF» (corte + sangrado + marcas) e
  «Imagen incrustada» en píxeles a 300 ppp.
- Si el límite se supera, el bloque lo explica con las cifras y **Descargar queda
  desactivado**: no se reduce la resolución en silencio (el motor tampoco lo hace;
  ver `STUDIO_RC2_READINESS.md`). Límites: PNG/JPG 80 MP y 16 384 px por lado;
  PDF a 300 ppp 32 MP; medida de corte 10–2 000 mm.

Textos que el diálogo asegura: el PDF es una imagen incrustada (no vectorial, no
PDF/X); CMYK usa una conversión genérica y no el perfil ICC de la imprenta, con la
recomendación de descargar RGB si la imprenta exige un perfil concreto; JPG no
admite transparencia y el peso final depende de la imagen (sin estimaciones).

### Estados de la descarga

`DesignEditor.exportImage` + `editor/DownloadNotice.jsx` (una línea sobre el
lienzo, `role="status"`; `role="alert"` en error):

| Estado | Cuándo | Acciones |
| --- | --- | --- |
| Preparando | Confirmar cambios, comprobar revisión y renderizar en el navegador (se pinta el aviso antes del render síncrono) | Cancelar |
| Procesando | Solo PDF: el servidor arma el archivo (se detecta al terminar el render del navegador) | Cancelar |
| Descargando | Entrega del archivo al navegador | — |
| Listo | «Se descargó nombre.ext» (se oculta solo a los 6 s) | Cerrar |
| Cancelado | «Descarga cancelada. No se guardó ningún archivo.» El render no se puede interrumpir: su resultado se descarta y se puede iniciar otra descarga de inmediato | Cerrar |
| Error | Mensaje saneado | Cerrar |

- Una referencia (`job`) impide descargas duplicadas aunque se pulse varias veces
  («Descargar» de la barra también se desactiva mientras hay un trabajo).
- `lib/studio-download.js` (`sanitizeExportError`): los estados HTTP conocidos (401,
  403, 404, 408, 413, 429, 5xx) y los fallos de red se traducen a frases propias;
  un mensaje solo se muestra tal cual si es corto y no contiene URL, credencial,
  ruta, traza ni direcciones locales. No se muestran estimaciones de tiempo.

## Colaboración visible (interfaz)

Sin cambiar el modelo de operaciones. Toda la información sale de
`useStudioRealtime` (`participants`: `userId`, `sessionId`, `name`, `avatarUrl`,
cursor `x`/`y`, `selectedId`) y de `useStudioSync` (estado y reintento).

| Superficie | Componente | Datos reales |
| --- | --- | --- |
| Avatares de colaboradores (hasta 3, nombre al pasar el cursor o enfocar con teclado) y lista de personas con su actividad | `editor/collaboration/PresenceStack.jsx` | Presencia (`/studio/designs/:id/live`) |
| Cursores remotos y selección remota (borde, tinte y etiqueta con nombre y tipo de elemento, tamaño constante en pantalla) | `editor/collaboration/RemotePresence.jsx` | Presencia: `x`, `y`, `selectedId` |
| Marca de «Seleccionado por» en Capas (iniciales con el color de la persona) | `LayersPanel.jsx` (`remoteSelections`) | Presencia |
| Estado Sincronizado / Sincronizando / Sin conexión / Error, «Reintentar» (limitado a un intento por clic) y «Sincronizado · reconectando colaboración» si el canal en vivo se cae | `editor/collaboration/SyncStatus.jsx` | `useStudioSync.status`, `sync.resync()`, estado del canal |
| Cambio a solo lectura en vivo («Ahora solo puedes ver este diseño», con «Entendido») | `DesignEditor` (`lostEdit`) | `canEdit` del sondeo de `/live` |
| Acceso revocado o diseño eliminado | `editor/collaboration/AccessLost.jsx` | 401/403/404 del canal en vivo |

Reglas:

- Fucsia es solo la selección local. Cada persona tiene un color estable de una
  paleta de 10 (hash de su `userId`, `lib/studio-presence.js`); si dos personas
  presentes chocan (incluida la persona local, que nunca se dibuja), la de id
  posterior pasa al siguiente color libre, igual en todos los clientes.
- Varias pestañas de la misma persona son una sola en avatares y cuenta; las otras
  pestañas de quien mira se dibujan en el lienzo como «Tú (otra pestaña)».
- Las selecciones remotas son solo un indicador: no se muestran candados ni se
  impide editar. No hay bloqueos ficticios.
- Las etiquetas y bordes usan `1/zoom`; con `prefers-reduced-motion` el cursor no
  se anima (`motion-reduce:transition-none`, giros `motion-reduce:animate-none`).
- Tras revocar el acceso se retira la protección de salida (el aviso «Salir antes de
  sincronizar» no se puede mostrar en esa pantalla) y se conserva el borrador.

## Qué está conectado a backend real y qué depende todavía de Codex

Conectado (verificado con `.e2e/studio-collab-export-ui.mjs`, pila Supabase
desechable, dos identidades Auth reales y la API/Realtime reales):

- Avatares, nombres, colores, cursores, selección remota y marca en Capas:
  presencia real. Revocación y cambio de rol (`PUT /studio/designs/:id/collaborators`)
  reflejados en la otra sesión.
- Estado de sincronización y «Reintentar»: `createStudioSync` real (sin conexión
  con `context.setOffline`, error con una respuesta 400 simulada del cliente).
- Exportación PNG, JPG y PDF con datos sintéticos: el archivo descargado coincide
  con lo anunciado (píxeles, formato, hoja en mm); límites y errores de servidor.

Depende de Codex (motor/API; la interfaz no lo simula):

- **Movimiento transitorio de objetos** de otras personas: no existe en el
  protocolo de presencia; cuando exista se mostrará como un contorno ligero que no
  interfiere con la selección local. Hoy solo se ve el resultado al confirmarse.
- **Recuperación tras un cambio rechazado**: después de un 4xx del servidor la
  sesión queda en «Error al sincronizar» y «Reintentar» no la recupera hasta
  recargar (`deny` en `studio-sync.js`). La interfaz lo muestra y conserva el
  borrador; el motor decide si se podrá reintentar sin recargar.
- **Cancelar una descarga** no aborta el render ni la petición del PDF
  (`exportDesign` no recibe una señal): se descarta el resultado.
- **Resolución de salida del PDF** distinta de 300 ppp: el motor la exige; si
  hiciera falta bajarla por el límite de 32 MP sería una opción nueva de
  `exportDesign`.
- **Tiradores de transformación** en modo solo lectura: el motor muestra los de la
  selección que había antes de perder el permiso.
- Los fixtures `scripts/fixtures/studio/*` aún buscan `Guardar`, un `img` «persona(s)
  editando» (ahora es un `group` con los avatares como `img`) y botones «×1» (son
  `radio`); su adaptación es del motor/pruebas.

Verificación (2026-10-26, `.e2e/studio-collab-export-ui.mjs`): ver el resumen de la
sesión; recorrido en 1440, 820 y 390 px, claro y oscuro, sin desbordamiento
horizontal, lienzo visible y diálogo de descarga dentro de la ventana.
