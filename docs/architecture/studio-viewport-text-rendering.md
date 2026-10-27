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

Fabric actualiza controles, sus áreas de interacción, offset y posición del textarea de edición antes de
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
Se arrastra también el borde visible de un control al 5 %, comprobando que su
área de interacción acompaña el tamaño dibujado después del zoom.

Los PDF cubren actual, todas (16 páginas mixtas) y `1-3, 5`, RGB/CMYK, fuentes y
variantes, alineación centrada/justificada, interlineados y alturas de texto
distintas de Fabric. Se verifican cantidad, orden, medidas, ColorSpace, imágenes,
degradados y texto rasterizado. Dos editores separados reproducen cambios remotos;
se exige rechazo por edición real, revocación y revisión obsoleta.

La identidad y el transporte colaborativo de esta prueba son fixtures en memoria;
no equivalen a dos sesiones autenticadas contra Realtime. Las certificaciones RC1
y RC2 permanecen intactas y no se extienden implícitamente a esta implementación.

La comprobación autenticada adicional está en
`scripts/fixtures/studio/supabase-text-multipage.mjs`, integrada en las fases
`all` y `multipage` de `verify-studio-v7.mjs`. Arranca dos sesiones Web reales
sobre el stack Supabase desechable del runner, crea textos de API con 16 páginas
y verifica las seis descargas desde la UI, sus perfiles y la ausencia de escrituras
de revisión por mediciones del renderer. Exige imágenes locales inmutables:

```sh
node scripts/build-studio-v7.mjs --revision=REVISION
node scripts/verify-studio-v7.mjs --revision=REVISION
node scripts/verify-studio-v7.mjs --revision=REVISION --phase=ui
python scripts/fixtures/studio/viewport-inspect-pdf.py .artifacts/studio/DIRECTORIO_DEL_STACK
```

## Resultados del cambio

- Reproducción inicial: desviación de 55,44 px y rechazo de exportación de texto
  válido con altura canónica distinta de Fabric.
- Matriz nueva: 24 escenarios y seis escenarios de StudioWorkspace completo;
  desviación máxima de 0,75 px CSS, sin cambios de documento por zoom. Tamaño del
  cursor remoto constante, selección, edición de texto y controles comprobados.
- Seis PDF locales inspeccionados estructuralmente y rasterizados con PyMuPDF;
  texto, orden, medidas, fotos, degradados y perfiles RGB/CMYK correctos.
- Las seis descargas autenticadas de 16 páginas, actual y rango también pasan
  contra las imágenes locales de `ad3977d5`: dos sesiones Web abiertas, alturas
  canónicas conservadas y ninguna escritura de revisión al abrir o exportar.
  Rasterización independiente de esos seis PDF aprobada.
- Stack real: 13 grupos de colaboración/recibos/plantillas/seguridad, cuatro de
  degradados, cuatro de fotos y cinco de fotos en formas aprobados. La exportación
  conserva los rechazos por cambios concurrentes, abortos y revocación; también
  pasa la inspección PDF de PPI, cajas físicas, transparencia y marcas de corte.
- Tres perfiles de recibos medidos: escritura durante 120 segundos, commits de
  arrastre y transformaciones de 200 miembros. El recibo envejecido 400 días se
  conserva después de reiniciar la API y no duplica la operación al reintentarla.
- Fase UI repetida y aprobada sobre `ad3977d5`: 33 comprobaciones, compatibilidad
  SQL v6/v7, rechazo de downgrade, 222 migraciones con checksums verificados y
  arranque del worker de la misma revisión. El stack desechable fue eliminado.
- Regresión Node ampliada: 1.430 aprobadas, una omitida, cero fallos. MCP dirigido:
  cinco aprobadas. Renderer real, build web y ESLint aprobados. React Doctor:
  84/100 y ningún issue en siete archivos escaneados.
- El antiguo `verify-studio-ui.mjs` se detiene buscando el botón manual Guardar;
  ese fixture no representa el flujo actual. No se registra como aprobado.
- `pnpm check:privacy` conserva 67 hallazgos fuera de los archivos de esta entrega;
  la inspección dirigida de sus 17 archivos no detecta hallazgos.

Los fixtures v7 drenan sus escritores de recuperación antes de fijar una revisión
para la prueba MCP, comprueban el selector/resumen actual de Todas y capturan las
promesas de descarga para que un fallo previo no oculte su causa ni impida limpiar
el stack desechable. Estos ajustes no relajan las comprobaciones del producto.
La prueba final de marcas de corte ahora activa explícitamente esa opción antes
de exigir el margen correspondiente: el estado predeterminado era sin marcas.
La ejecución ampliada conserva su informe fallido por esa expectativa anterior;
la repetición dirigida de UI, compatibilidad y worker terminó con `passed: true`.
No se reetiquetan informes fallidos como aprobados.

La evidencia de las imágenes corresponde al código de producto `ad3977d5`. El
cierre posterior cambia únicamente fixtures y este informe; no certifica trabajo
concurrente posterior que permanezca en el workspace.
