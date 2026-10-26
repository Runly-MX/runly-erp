# Studio — contrato entre editor y UI

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
