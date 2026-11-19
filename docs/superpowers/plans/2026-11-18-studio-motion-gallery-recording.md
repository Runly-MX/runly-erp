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
