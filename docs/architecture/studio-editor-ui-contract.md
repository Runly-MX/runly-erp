# Studio — contrato entre editor y UI

## Contrato vigente: motor multimedia v4

Esta sección reemplaza las limitaciones v3 registradas más abajo. Las capacidades
descritas tienen implementación en el adaptador real, validadores compartidos y
pruebas. Los controles visuales se integran por separado; este cambio no rediseña
el editor ni añade migraciones SQL.

### Edición fotográfica como copia

En `DesignEditor`, `editorRef.current.editImage(objectId?)` abre el
`ImageEditorDialog` compartido mediante `useStudioImageEditing`. El ID omitido
es la selección actual. Requiere imagen visible, desbloqueada y diseño editable.
La imagen debe estar guardada en el diseño antes de abrir el diálogo: el original
se obtiene por la capacidad del diseño, no mediante URLs arbitrarias.

Se usa `originalResolution={true}` y solamente `onSave`; nunca se proporciona
`onReplace`. El SDK implementa
`studio.saveImageCopy(designId, fileId, file, token, signal)` mediante multipart a
`POST /studio/designs/:id/assets/:fileId/edited-copy`. El resultado es
`{id,name,width,height,mimeType}` de un FileAsset nuevo, privado y RESTRICTED,
propiedad del usuario que edita. El original conserva ID, bytes y propietario.
La atribución de catálogo se conserva también en la copia.

El servidor revalida empresa, membresía, `studio.edit`, `files.assets.read`,
`files.assets.create`, acceso de editor al diseño y pertenencia del original al
diseño. Repite la autorización antes y después de Storage. Los originales
privados del propietario solo se delegan dentro del diseño autorizado; no se
concede acceso genérico en Files. Una revocación durante la subida puede dejar
una copia privada del editor en Files, pero no devuelve una capacidad de Studio
ni modifica el documento o el original. Un fallo de Storage conserva el diseño.

`captureImage(id?)` devuelve `{object,fingerprint}`. Después del guardado,
`replaceImage(objectId,fileAssetId,fingerprint?)` cambia una sola referencia,
conserva el marco y crea un paso de historial. Reautoriza el nuevo archivo y su
lectura. Una huella antigua o un cambio de instancia/empresa/selección impide
sobrescribir una edición más reciente. El diálogo mantiene los cambios ante un
error y permite reintentar; cerrar cancela la petición pendiente. Las URLs de
60 segundos solo permanecen en memoria, nunca en el JSON ni el borrador.

### Marcos y ajustes

Las imágenes existentes sin `image` mantienen su renderizado histórico. Una
imagen con `image` usa un marco no destructivo en coordenadas locales. El motor
recorta mediante una ruta Canvas, independiente de grupos de usuario y sin
rasterizar la máscara. `fileAssetId` sigue apuntando al original.

| Método sobre la selección | Función |
| --- | --- |
| `setImageMask(mask, properties?)` | rectangle, rounded, circle, ellipse, arch, star, triangle |
| `patchImage(properties)` | Cambia encuadre, forma, borde o sombra; conserva propiedades omitidas |
| `cropImage({x,y,width,height})` | Recorte normalizado del original, dentro de 0…1 |
| `updateImageAdjustments(partial)` | Brillo, contraste, saturación, blur, grayscale, sepia |
| `resetImageAdjustments()` | Restaura únicamente los ajustes |
| `resetImageFraming()` | Centra y restaura zoom, giro interno y recorte |
| `patch({opacity, rotation, …})` | Opacidad y transformación exterior del objeto |

`image` admite `fit: 'cover' | 'contain'`, `offsetX/Y` en fracciones del marco
(-4…4), `zoom` (0.1…8), `rotation` interno en grados, `flipX/Y`, `radius`,
`crop`, `border: {width,color}`, `shadow: {blur,offsetX,offsetY,color}` y
`adjustments`. Brillo/contraste/saturación son -1…1; blur es 0…1; gris y sepia
son booleanos. Ver `image-properties.js` para los límites completos. Cambiar
`rotation` exterior no gira el contenido independientemente: el giro interno
pertenece a `image.rotation`.

El backend de filtros Canvas 2D es privado por imagen: no altera la configuración
global de Fabric ni depende del tamaño máximo de texturas WebGL. Los filtros se
reconstruyen desde los valores canónicos, sin acumular instancias. Los sliders no
suben archivos: solo el diálogo confirmado crea una copia en Files.

Para un gesto, **esperar** `beginInteraction()`, enviar actualizaciones y terminar
con `await endInteraction(true)`; `false` cancela y recupera el documento previo.
Los ajustes rápidos fusionan valores dentro del mismo frame. `endInteraction`
y `flush()` esperan los ajustes pendientes. Así un arrastre produce un paso de
historial. La UI debe mantener habilitado el control mientras dura el gesto y
mostrar el error de la promesa si se revoca el acceso o cambia la selección.

### Tipografía, líneas, grupos y SVG

- `setTextStyle(patch)` acepta `fontFamily`, `fontVariant`, `fontSize`, `textAlign`
  (left/center/right/justify), `lineHeight` (0.5…4), `charSpacing` (-200…1000,
  milésimas de em), `underline`, `linethrough` y `fill`.
- `studioFontStyle(family, variant)` devuelve el archivo, peso y estilo real o
  `null`. Oswald ofrece light/regular/medium/semibold/bold; Playfair Display
  regular/medium/semibold/bold; Lato regular/bold/italic. Las demás familias
  ofrecen regular. Las fuentes OFL se descargan del propio Runly bajo demanda;
  los orígenes y hashes están en `studio-fonts/sources.json`. No hay cursivas o
  pesos sintéticos. La UI debe deshabilitar combinaciones no disponibles.
- `add('line', properties)` crea una línea/polilínea real. `points` contiene 2…256
  pares normalizados 0…1 dentro de width/height. `setLineStyle(patch)` cambia
  `strokeWidth` (0.5…128), `dash` (solid/dashed/dotted), `startArrow`, `endArrow`
  y color `fill`. Los extremos, escalas y geometría persisten; no son rectángulos.
- `group()` agrupa la selección y devuelve `{id,objectIds}`; `ungroup()` elimina
  la agrupación seleccionada. `groups()` enumera grupos y `selectGroup(id)` los
  selecciona. Persisten como `groupId` de objetos, sin usar JSON de Fabric.
  Clic normal selecciona el conjunto; `select(id,{individual:true})` permite
  seleccionar un miembro. Duplicar genera una identidad de grupo distinta.
  **Límite:** grupos planos, con movimiento conjunto; anidación y escalado/giro
  conjunto quedan bloqueados hasta verificar sus transformaciones afines.
- `await importSvg(svgText, fileName)` devuelve `{warnings,provenance}` e inserta
  geometría validada. Admite SVG monocromo de hasta 32 KiB y viewBox 0 0 w h,
  hasta 1024 por lado. Rechaza XML/entidades, scripts, imágenes, referencias,
  estilos, transformaciones y elementos incompatibles; no los ejecuta ni los
  elimina silenciosamente. La previsualización debe usar la geometría segura.
  No guarda SVG crudo ni atribuye estos trazos a Iconify. La licencia local queda
  sin verificar y aparece en los créditos. Rasterización alternativa no ofrecida.

### Límites y compatibilidad

El JSON es v4; `validateDocument` migra lógicamente v1/v2/v3 sin escribir en la
base ni perder las referencias originales. Los marcos, filtros y metadatos de
grupo se guardan dentro del documento existente. Las pantallas antiguas no deben
guardar v4: un cliente antiguo no entiende estas propiedades.

Subidas/copia: 10 MiB, PNG/JPEG/WebP, 25 MP y 8192 px por lado; validación MIME
real y decodificación completa en servidor. El editor limita a 25 MP la suma de
imágenes decodificadas del documento, contando instancias, además de 500 objetos
y 1 MB de JSON. Al restaurar puede coexistir temporalmente el documento viejo
con el nuevo. CPU, Canvas y decodificación pueden usar varios cientos de MiB;
los límites no representan una garantía exacta de RAM del navegador.

La previsualización del diálogo compartido sigue limitada a 1800 px. Solo Studio
opta por volver a procesar el original para guardar: no amplía el preview. Si un
giro supera 25 MP o 8192 px de salida, se rechaza explícitamente en vez de reducir
resolución. Exportación completa limitada a 16 capas, 500 anotaciones y 100000
puntos; las imágenes añadidas como capas suman como máximo 50 MP. Files y Notes
conservan el modo anterior por defecto.

### Quitar fondo

**No existe `editor.removeBackground` ni endpoint productivo.** El prototipo
`scripts/run-studio-background-prototype.mjs` es independiente, local y explícito;
no se importa al iniciar Runly, no descarga modelos y no contacta Files.
`runBackgroundPrototype({input,model,runtime,signal,onProgress,timeoutMs})` devuelve
PNG, máscara alfa y métricas; publica loading/processing/encoding, admite
cancelación y errores. Ver evaluación y bloqueo real en
`studio-background-removal-evaluation.md` antes de conectar una UI.

## Registro histórico de la entrega v3 (no describe el soporte actual)

Este documento distingue capacidades verificadas de requisitos pendientes. No
cambia el JSON, el API ni la persistencia. Referencia inicial: `89da4199`.

## Capacidades actuales

El adaptador `createStudioEditor` de `fabric-adapter.js` ofrece:

| Operación | Contrato actual |
| --- | --- |
| Selección | `onSelection(objectOrNull, ids)`; `select(id)`, `selectMany(ids)`, `selectAll()`, `pick(event)` |
| Texto | `patch({ text, fontFamily, fontSize, fill, width, scaleX, scaleY })` |
| Fuentes | Lista cerrada `STUDIO_FONTS`, archivos locales, exclusivamente Regular 400 |
| Transformaciones | `patch({ x, y, width, height, rotation, locked, hidden })` |
| Alineación de objetos | `align(direction, 'page' \| 'selection')`; no es alineación de párrafos |
| Historial | `undo()`, `redo()`, `onHistory(state)`, `flush()`; historial propiedad del motor |
| Elementos | `add('text' \| 'rectangle' \| 'ellipse' \| 'image' \| 'vector', properties)` |
| Vectores | Geometría validada con `iconId` de catálogo; no acepta SVG arbitrario |
| Exportación | `exportImage('png' \| 'jpg', quality, reviewedScene)` |

Undo/redo conserva los IDs seleccionados que sobreviven y siguen visibles. Si
solo sobrevive uno, recupera selección simple. Si ninguno sobrevive, publica
selección vacía. Los objetos reconstruidos nunca reutilizan referencias Fabric
descartadas. Deshacer una eliminación sin selección previa no selecciona objetos
arbitrarios. La UI se actualiza mediante `onSelection`, sin historial adicional.

La barra contextual concentra fuente, variante, tamaño y color. El inspector
conserva edición multilínea, transformación y alineación geométrica. El menú de
fuentes presenta muestras solo tras cargar cada archivo real; una carga fallida
inhabilita la opción y permite reintentar al abrir el menú de nuevo. No se sintetiza
negrita/cursiva en las muestras. Las variantes no disponibles están deshabilitadas.

## Contrato requerido al motor para continuar

Los siguientes son requisitos propuestos, **no APIs implementadas**. Antes de
añadir controles debe acordarse su representación canónica, validación,
renderizado, exportación, permisos, undo/redo y reapertura:

1. **Tipografía avanzada:** peso y estilo de fuentes con archivos reales; subrayado,
   tachado, alineación de párrafo (incluido justificado), espaciado e interlineado
   con unidades y límites explícitos. Hoy los campos desconocidos son descartados
   por `validateDocument`; no deben enviarse desde React para simular soporte.
2. **Trazos editables:** líneas, flechas, polilíneas y lápiz con puntos/extremos,
   color, grosor, patrón, opacidad y límites de geometría. No sustituir líneas
   por rectángulos ni atribuir trazos inventados a iconos de terceros.
3. **Grupos:** operaciones atómicas de agrupar/desagrupar, IDs estables, jerarquía
   acíclica, transformaciones, selección de hijos, bloqueo y visibilidad heredados.
   Publicar la jerarquía para Capas antes de añadir árbol o atajos Ctrl+G.
4. **SVG:** importación acotada que devuelva geometría segura, advertencias y
   procedencia/licencia. Definir qué se rechaza (scripts, referencias externas,
   estilos, filtros, etc.) y si hay conversión raster aislada. No insertar SVG
   en DOM ni decodificar archivos arbitrarios en el navegador como previsualización.

La UI conserva la sección informativa Ilustraciones y el acceso existente a
Iconos. No ofrece selector de SVG, herramientas de dibujo, agrupación ni
proveedores nuevos mientras esos contratos no estén implementados. Las antiguas
«Líneas» rectangulares se llaman «Franjas» dentro de Bandas decorativas.

## Validación local

`node scripts/verify-studio-typography.mjs` monta los componentes React reales y
Fabric con un documento sintético en memoria y las fuentes locales. No abre
conexiones API ni bases de datos. Requiere antes
`pnpm --filter @runly/desktop build:web` para utilizar el CSS real compilado.

Produce capturas en `.artifacts/studio/typography/` a 390, 820 y 1440 px en claro y
oscuro y un resultado JSON. Comprueba fuentes, variantes deshabilitadas, texto
multilínea, sincronización de selección e historial, color, sheets móviles,
navegación por teclado y ausencia de desbordamiento. Las capacidades pendientes
se reportan como no soportadas; no se cuentan como pruebas aprobadas.

Verificación de esta entrega: 10 grupos de comprobaciones del navegador, 7
capturas y ningún error de ejecución; regresión del renderer real (texto, formas,
imágenes, fuentes, vectores, historial y exportación PNG) aprobada; 2 pruebas de
historial aprobadas; ESLint y build web aprobados. React Doctor: 90/100, sin
incidencias detectadas. La revisión global de privacidad conserva 64 hallazgos
previos ajenos a estos cambios; los 9 archivos de esta entrega no tienen hallazgos.
