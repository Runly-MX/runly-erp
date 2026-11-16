# Studio Next Fase 3 — línea de tiempo y keyframes (plan)

Base: `724fccd27`. Fuentes: [plan maestro](../../architecture/studio-next-master-plan.md),
[diseño técnico](../../architecture/studio-next-technical-design.md),
[hoja de ruta](../../architecture/studio-next-implementation-roadmap.md),
[plan de Fase 2](2026-11-16-studio-next-phase2-motion-engine.md). Sin exportadores (Fase 4),
sin motor nuevo y **sin cambios de contrato**: todo cabe en `enter`/`exit`/`emphasis`/
`keyframes` de v8.

## Arquitectura

La línea de tiempo es una vista sobre el documento del editor. Nada temporal se guarda
fuera de él.

| Pieza | Responsabilidad |
| --- | --- |
| `studio/keyframes.js` (paquete compartido, puro) | Valores de pista en `t`, insertar/actualizar, mover, borrar, copiar keyframes y escalarlos; respeta los límites del validador (2–32 entradas, `at` creciente) |
| `page.js` `resizeDocument` | Con «escalar contenido», escala también `x`/`y` de los keyframes |
| `lib/timeline-math.js` (puro) | ms↔px, marcas de la regla, *snapping*, ajuste a la duración |
| `components/editor/timeline/useTimeline.js` | Cabezal, reproducción (reloj estable), zoom, imán, modo Diseño/Animación, keyframe y efecto seleccionados, borrador durante arrastres |
| `TimelinePanel.jsx` | Barra (modo, reproducción, tiempo, zoom, imán, añadir/navegar keyframes), panel redimensionable y plegable, inspector de keyframe |
| `TimelineTracks.jsx` | Regla, pistas por elemento (grupos con cabecera), segmentos de efectos, rombos de keyframes, cabezal, zona fuera de la diapositiva |
| `KeyframeInspector.jsx` | x, y, rotación, opacidad, escala y curva del keyframe seleccionado |
| `AnimatedCanvasLayer.jsx` | En modo Animación cubre el papel con el `MotionStage` (escena evaluada), selecciona por impacto sobre la escena evaluada y convierte arrastres en keyframes |
| `MotionStage.jsx` | Reconstruye el reproductor solo si cambia el diseño base (no los campos de animación) |

## Modos

- **Diseño** (por defecto): el editor normal; la geometría base se edita como siempre.
- **Animación**: el lienzo muestra `sceneAt(documento con borrador, página, t)` en una capa de
  solo lectura sobre el papel, con borde y etiqueta «Editando animación · 1,5 s». Arrastrar un
  elemento crea o actualiza su keyframe de posición en `t`; nunca toca `x`/`y` base.
- Reproducir o mover el cabezal desde Diseño pasa a Animación. Volver a Diseño muestra el
  diseño base.

## Reglas de keyframes (sin cambio de contrato)

- Valores absolutos: `x`, `y` (esquina superior izquierda del contrato), `rotation`, `opacity`;
  `scale` es un multiplicador.
- El contrato exige al menos dos keyframes: el primero que crea el usuario en `t > 0` añade un
  ancla en 0 con los valores base de las propiedades editadas (en `t = 0`, el ancla va al final
  de la diapositiva). Al quedar uno solo, se elimina el campo.
- Un keyframe en el mismo `at` se actualiza; mover a un `at` ocupado se rechaza; máximo 32.
- Arrastre en el lienzo: `x`/`y` del keyframe = valor de la pista en `t` + desplazamiento.

## Efectos en la pista

Segmentos de entrada, énfasis y salida. Arrastrar el cuerpo cambia `delay`; los extremos
cambian `duration` (el izquierdo mueve el inicio y conserva el final). Límites del contrato:
duración 0–10 s, retraso 0–600 s. Los segmentos pueden solaparse (se componen como en Fase 2).
Lo que pasa de la duración de la diapositiva se dibuja sobre la zona rayada y se recorta al
reproducir.

## Persistencia, historial y concurrencia

- Cabezal, zoom, reproducción y borrador de arrastre son estado local: sin escrituras ni
  historial. Un arrastre o una edición del inspector = un `patch` del objeto = un paso de
  deshacer y un lote de sincronización.
- Convergencia existente: última escritura por clave de objeto. `enter`, `exit`, `emphasis` y
  `keyframes` son claves distintas (dos personas editando efecto y keyframes del mismo objeto
  no se pisan); dos personas editando keyframes del mismo objeto: gana la última (documentado;
  ampliar a nivel de keyframe exigiría operaciones nuevas y protocolo 5).
- Solo lectura: se puede reproducir y mover el cabezal, no editar.

## Interacción, móvil y accesibilidad

- Panel bajo el lienzo, alto 160–480 px con asa (se recuerda en `localStorage`), plegable.
- Desplazamiento nativo horizontal y vertical en las pistas; solo regla, segmentos y rombos
  usan `touch-action: none`; `select-none` en todo el panel.
- Teclado (foco en la línea de tiempo): Espacio reproducir/pausar, Inicio/Fin, ←/→ ±100 ms
  (Mayús ±1 s), `[`/`]` keyframe anterior/siguiente, `K` añadir keyframe, Supr eliminar.
  Segmento o rombo enfocado: ←/→ mueve (Alt+←/→ cambia duración); Intro abre propiedades.
- Etiquetas accesibles con tiempos en segundos; cabezal `role="slider"`.
- Movimiento reducido: la capa animada usa `reducedMotion` al reproducir; el *scrubbing*
  muestra el instante exacto.

## Rendimiento

Sin reconstruir Fabric ni recargar fotos al mover el cabezal: `renderFrame` en el reproductor
ya construido. Medir cabezal continuo, arrastre de keyframe, 100 objetos, cambio de página,
abrir/cerrar y memoria, con el mismo método que Fase 2.

## Pruebas

Unitarias: `keyframes.js`, `timeline-math.js`, escalado de keyframes (trayectoria proporcional).
Navegador (`scripts/verify-studio-timeline.mjs`): crear/mover/borrar keyframes, arrastre en
lienzo a 1,5 s, segmentos (retraso/duración), imán y zoom, selección lienzo↔pista↔capas,
deshacer/rehacer, reabrir, dos usuarios y conflicto en el mismo keyframe, solo lectura, móvil,
escalado de página, Presentar igual que la línea de tiempo, rendimiento y memoria. Regresión:
`verify-studio-presentations.mjs` y `verify-studio-motion.mjs`.

## Resultado (2026-11-16)

Implementado sin cambios de contrato. Desviaciones y hallazgos:

- En modo Animación, la barra del lienzo y el inspector siguen editando el **diseño base**; solo
  los arrastres en el lienzo crean keyframes. La etiqueta dice «arrastra en el lienzo para crear
  keyframes» para no prometer más.
- Arrastrar un elemento agrupado en Animación mueve el grupo: un keyframe por miembro con el
  mismo desplazamiento, en un solo paso de deshacer (`patchEach`).
- Corregidos durante la verificación: Supr sobre un keyframe llegaba a los atajos del editor y
  pedía eliminar el elemento; los rombos se recreaban al cambiar su instante y perdían la captura
  del puntero (ahora se identifican por posición); la pista seleccionada no se mostraba si estaba
  desplazada (ahora entra en vista); en el teléfono la barra ocupaba tres filas (ahora una fila
  desplazable).
- Teclas de la línea de tiempo que no maneja (H, V, Ctrl+Z…) siguen llegando al editor.

Evidencia:

- [x] Unitarias: `keyframes.test.js` (modelo y escalado con trayectoria proporcional),
  `timeline-math.test.js`; `node --test` Studio 183/183. Verified: 2026-11-16
- [x] Navegador: `node scripts/verify-studio-timeline.mjs --api-image=<etiqueta>` 22/22 en stack
  Supabase desechable (capturas en `.artifacts/studio/timeline/`). Verified: 2026-11-16
- [x] Regresión: `verify-studio-presentations.mjs` y `verify-studio-motion.mjs`. Verified: 2026-11-16

Rendimiento medido (Chrome headless, equipo de desarrollo, página de 100 objetos con 50
keyframes y 25 efectos): cambiar de página y abrir la línea de tiempo hasta el primer fotograma
410–564 ms; `renderFrame` medio 1,7–2,1 ms y máximo 20,9–32,6 ms durante el *scrubbing*; heap
+1,7/+2,5 MiB tras 5 aperturas y cierres, todos los canvas liberados. Los tiempos totales de
121 movimientos de cabezal (1,7–3,2 s) y de un arrastre de 60 pasos (1,5–1,9 s) incluyen la
latencia de Playwright por evento: no son FPS. Frente a Fase 2 (2,2–2,6 ms por fotograma con
40 efectos durante la reproducción) el coste por fotograma es del mismo orden; el método es el
mismo `renderFrame` medido dentro del navegador. Sin medir en teléfonos físicos ni Tauri.
