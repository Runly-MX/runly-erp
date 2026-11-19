# Plan: galería de animaciones, transiciones, sincronía y grabación de Studio

Spec: `docs/superpowers/specs/2026-11-18-studio-motion-gallery-recording-design.md`.
Trabajo directo en `main`, un commit por bloque verificado.

1. Motor (`studio-interchange/src/studio/motion.js`): presets nuevos, `clip`, transiciones nuevas,
   inversión exacta al retroceder. Website (mapeos + aviso) y PPTX (aviso). Pruebas en
   `apps/shared/studio/motion*.test.js`, `studio-website.test.js`.
2. Dibujo compartido de capas (`lib/stage-layers.js`): estilo CSS y dibujo canvas con `clip`/`front`;
   lo usan Presentar, la exportación de video y la grabación. `renderFrame` aplica `clip`.
3. Reloj único en `presentation-state.js` / `usePresentation.js`; pruebas de pausa, reanudación,
   avance automático y transición congelada.
4. Timeline: indicador compacto + barra de ayuda estable con lectura de arrastre.
5. Galería de efectos (`EffectGallery.jsx`, miniaturas del motor) + vista previa sobre el objeto real
   (`EffectPreviewLayer.jsx`) sin escribir.
6. Galería de transiciones en `SlideSettings` + `TransitionPreviewDialog`.
7. Grabación: `lib/presentation-recorder.js` (MIME, compositor, MediaRecorder, limpieza) +
   controles en `PresentationOverlay` (reiniciar, grabar, micrófono, pausa, detener, resultado).
8. Verificación en navegador real (`scripts/verify-studio-motion-gallery.mjs`), capturas, docs para
   desarrolladores si cambia el contrato publicado, nota de cierre.

## Verificación

- [x] Motor, reloj, grabador: `node --test` (200/200 en shared/studio, lib de Studio, studio-interchange y studio-website). Verified: 2026-11-18
- [x] Navegador real (`node scripts/verify-studio-motion-gallery.mjs --api-image=…`, pila desechable, Chrome): 17/17 comprobaciones; capturas en `.artifacts/studio/motion-gallery/`. Verified: 2026-11-18
  - Galería: probar no escribe (revisión y deshacer intactos), aplicar/tiempos/deshacer/quitar; transiciones con vista previa real en ambos sentidos.
  - Timeline: insignia con caja constante en 16 movimientos de segmento y 12 del cabezal; barra de ayuda de una línea (28 px).
  - Reproductor (reloj falso de Playwright): mismo fotograma a 1,5 s por reproducción, reinicio+pausa+reanudación y retroceso; barrido pausado al 50 % sin avanzar 3 s; retroceso inverso con la capa saliente delante; una sola capa tras interrumpir una transición.
  - Grabación: MP4 1920×1080 con narración (audio 5,61 s / video 5,66 s, pausa de 2 s excluida), sin micrófono sin pista de audio, pestaña oculta pausa, ✕ detiene y conserva, micrófono denegado explicado, sin MediaRecorder no hay botón de inicio, pistas liberadas.
  - Motores (sondeo Playwright): Chrome MP4 y WebM; Firefox solo WebM (vp8/opus); WebKit de Playwright sin MediaRecorder ni captureStream.
- [ ] Hub: publicar `@runly/studio-interchange` de esta revisión y adoptarlo en el Hub antes de que se suban paquetes con los efectos nuevos.
