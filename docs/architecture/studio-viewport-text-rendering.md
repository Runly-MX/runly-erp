# Studio v7: viewport y medidas de texto

El zoom es estado de sesión. No cambia el documento, su versión de esquema,
operaciones colaborativas ni historial. Se conserva el protocolo actual.

## Transacción visual

`useStudioViewport` distingue el zoom presentado del solicitado para el próximo
frame. Rueda, botones, ajuste, restauración y pinch comparten un RAF pendiente;
la última solicitud sustituye su destino. Las operaciones relativas acumulan sus
factores sobre el destino pendiente, sin leer una escala aún no presentada.

El RAF confirma React con `flushSync`, compensa el scroll y sincroniza Fabric y
reglas antes de pintar. Los overlays reciben la misma escala del papel. El pinch
conserva el punto documental inicial bajo el centro móvil del gesto. El desmontaje
cancela el RAF; no hay correcciones anidadas que sobrevivan a la siguiente petición.

El plano tiene márgenes del tamaño del viewport para poder anclar también un
papel pequeño; su overflow se acota a sus dimensiones explícitas. La escala tiene
origen superior izquierdo. El viewport desactiva el anclaje automático de scroll.
ResizeObserver actualiza dimensiones dentro de esa misma transacción y respeta
la petición pendiente. En modo ajustar vuelve a centrar el papel.

Fabric actualiza controles, offset y posición del textarea de edición antes de
pintar. Las reglas escuchan `studio:viewport` para colocar su origen después de
compensar el scroll. El cursor remoto anima únicamente su traslación por presencia;
su escala inversa cambia inmediatamente con el zoom.

## Documento y renderer

Cada Textbox conserva las medidas que Fabric calculó al construirlo o aplicar un
documento canónico. Mientras esas medidas no cambien por una interacción, snapshot
devuelve el ancho y alto canónicos. No convierte la medición inicial de Fabric en
una edición. Un cambio real de dimensiones durante edición conserva su resultado;
una altura canónica recibida de otro usuario continúa siendo un cambio detectable.

Esto aplica a documentos válidos independientemente de su origen: UI, API,
MCP/MirAI, plantilla o histórico. El render auxiliar mantiene su propio Textbox y
no escribe en el documento de origen. No se omiten campos de la comparación de
escenas: siguen comparándose documentos validados completos antes y después de
exportar, además de los permisos y la revisión del servidor en los print jobs.

## Reproducción local

```sh
pnpm --filter @runly/desktop build:web
pnpm verify:studio:viewport
python scripts/fixtures/studio/viewport-inspect-pdf.py
node scripts/verify-studio-browser.mjs
node scripts/verify-studio-local.mjs --tests-only
```

El verificador usa Chrome, React, Fabric, fuentes locales y el ensamblador PDF
progresivo real. La inspección independiente requiere PyMuPDF. Los artefactos se
guardan bajo `.artifacts/studio/viewport/`; las pruebas fuente están versionadas.
No conecta con bases existentes ni servicios remotos.

La matriz incluye 100 eventos por ráfaga, botones acumulados, 5–400 %, selección,
edición de texto, fotos/degradados/grupos, paneles, páginas horizontales/verticales,
390/820/1440 px, DPR 1/2 y temas claro/oscuro. Pinch y pan usan eventos confiables
de Chrome. Hay una segunda matriz con StudioWorkspace completo y presencia remota.
La tolerancia del anclaje es 1 px CSS; la del canvas/overlays es 0,05 px CSS.

Los PDF cubren actual, todas (16 páginas mixtas) y `1-3, 5`, RGB/CMYK, fuentes y
variantes, alineación centrada/justificada, interlineados y alturas de texto
distintas de Fabric. Se verifican cantidad, orden, medidas, ColorSpace, imágenes,
degradados y texto rasterizado. Dos editores separados reproducen cambios remotos;
se exige rechazo por edición real, revocación y revisión obsoleta.

La identidad y el transporte colaborativo de esta prueba son fixtures en memoria;
no equivalen a dos sesiones autenticadas contra Realtime. Las certificaciones RC1
y RC2 permanecen intactas y no se extienden implícitamente a esta implementación.
