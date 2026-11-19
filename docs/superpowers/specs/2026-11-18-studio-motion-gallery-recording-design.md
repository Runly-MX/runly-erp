# Studio: galería de animaciones, transiciones, sincronía del reproductor y grabación

Fecha: 2026-11-18. Alcance cerrado (no abre fases nuevas). Sin despliegue.

## Objetivo

Explorar animaciones y transiciones visualmente, reproducirlas con un único reloj
determinista, eliminar los mensajes inestables del timeline y grabar la presentación
(con o sin micrófono) desde Presentar.

## Decisiones

1. **Un solo motor.** Los efectos nuevos se añaden a `packages/studio-interchange/src/studio/motion.js`
   (`sceneAt` / `transitionAt`). Editor, Presentar, GIF/MP4/WebM y la grabación los evalúan igual.
   - Entrada/salida nuevas: `wipe-*` (barrido), `reveal` (revelar desde el centro), `float-*`
     (flotar, 6 %), `fly-*` (volar desde fuera de la página), `grow` (expandir/contraer),
     `elastic` (elástica suave), `spiral` (giro con desplazamiento). Zoom + fundido ya existe (`zoom-in`).
   - Énfasis nuevos: `swing`, `wobble`, `soft-pulse`, `tremble`, `tilt`, `jelly`, `enlarge`.
     Todos vuelven al estado de reposo en u = 0 y u = 1.
   - Barridos: el objeto evaluado lleva `clip: {left, top, right, bottom}` (fracciones de su caja
     visual). Solo lo lee el renderizador de reproducción (`renderFrame`, clipPath absoluto de Fabric);
     el documento no cambia.
   - Transiciones nuevas: `cover-*`, `uncover-*`, `wipe-*`, `split-horizontal`, `split-vertical`,
     `zoom-out`, `fade-black`. Las capas ganan `clip` y `front` (qué capa va delante).
   - Retroceder reproduce **exactamente al revés** la transición de la diapositiva que se deja
     (progreso 1 − p con capas intercambiadas), para todas las transiciones.
2. **Contrato compartido.** Los presets amplían listas cerradas (sin cambio de esquema ni migración).
   El Hub valida con el `@runly/studio-interchange` publicado y fijado por SHA: hasta publicar los
   paquetes compartidos de esta revisión y adoptarlos en el Hub (`pnpm release:shared --publish`,
   `pnpm shared:adopt`), un paquete que use efectos nuevos sería rechazado allí. Paso coordinado previo
   al despliegue; documentado en la entrega.
3. **Pérdidas.** PPTX: solo el fundido como transición (aviso generalizado). Website: `float-*` →
   `slide-fade-*`, `fly-*` → `slide-*`, `grow` → `zoom-in`; el resto de entradas sin equivalente se
   omite con aviso.
4. **Reloj del reproductor.** Un único reloj de diapositiva (`motionTime`) gobierna animaciones,
   progreso de la transición, avance automático y barra de progreso. Pausar congela todo (también la
   transición). Una transición solo se dibuja cuando la diapositiva destino ya está visible.
5. **Timeline.** La píldora centrada «Editando animación · {segundos} · arrastra…» se sustituye por un
   indicador compacto de ancho fijo (reloj `mm:ss,mmm` tabular, sin saltos de línea, fuera de la
   columna centrada) y una barra de ayuda estable en el panel del timeline que muestra la instrucción o,
   durante un arrastre, los tiempos del segmento/keyframe.
6. **Galería de efectos.** Tarjetas por Entrada/Énfasis/Salida con miniatura generada por el propio
   motor (estela de cuatro instantes), búsqueda, marca de aplicado. Tocar/clic = previsualizar sobre el
   objeto real (capa de solo lectura encima del lienzo, documento temporal, sin historial ni
   operaciones colaborativas); botón separado Aplicar; Reproducir de nuevo; Quitar. Hover en escritorio
   también previsualiza. `prefers-reduced-motion`: sin vista previa en movimiento, aviso.
7. **Galería de transiciones.** Tarjetas con miniatura animable, curva, duración, aplicar a todas,
   quitar, y diálogo de vista previa real entre la diapositiva anterior y la actual (adelante y atrás).
8. **Grabar presentación.** Un compositor dibuja en un canvas propio las mismas capas que muestra el
   reproductor (mismo estado, mismo reloj, misma función de dibujo que la exportación) →
   `canvas.captureStream` + pista de micrófono opcional → `MediaRecorder`. Nunca captura la pantalla ni
   controles. MP4 si `MediaRecorder.isTypeSupported` lo confirma, si no WebM; si el navegador no
   tiene `MediaRecorder` o `captureStream`, el botón explica la alternativa (Exportar video). Micrófono
   solo al elegirlo. Pausa/reanudación de la grabación congela también la presentación. Cambiar de
   pestaña pausa la grabación. Detener: `requestData` + `stop` con vigilancia; vista previa y descarga
   local; nada se sube al servidor. Utilidades de llamadas/chat: el grabador de notas de voz vive dentro
   de `MessageComposer` (no es una utilidad independiente); se reutilizan sus lecciones (orden de MIME,
   `requestData` antes de `stop`, watchdog), no su código, y llamadas no se toca.

## Fuera de alcance

Remux de WebM para añadir duración, grabación de cámara, subida al servidor, transiciones 3D.

## Verificación

Pruebas unitarias del motor y del reloj; script de navegador real (Playwright, Chromium con
dispositivo de audio simulado) con capturas de escritorio y móvil: galería sin escribir el documento,
aplicar, timeline estable, determinismo de píxeles en tiempos idénticos, pausa/reanudación, retroceso,
grabación con y sin micrófono, micrófono denegado, limpieza de pistas.
