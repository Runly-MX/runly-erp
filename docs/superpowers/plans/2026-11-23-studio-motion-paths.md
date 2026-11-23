# Plan: Studio motion paths (spec `2026-11-23-studio-motion-paths-design.md`)

- [x] A1 Pure path engine `lib/motion-path.js` with tests. Verified: 2026-11-23 (`node --test apps/desktop/src/modules/runly.studio/lib/motion-path.test.js`, 7/7; checks keyframes against `validateMotion` and the rendered position through `sceneAt`, including rotated elements).
- [x] A2 Path overlay on the animated paper, point drag/keys/insert, selection sync. Verified: 2026-11-23 (`.e2e/studio-motion-paths-real.mjs` on a disposable Supabase stack: drag moves one keyframe at the same instant; point ↔ timeline selection both ways; «+» inserts, Supr removes; undo/redo).
- [x] A3 «Dibujar movimiento» and «Crear trayectoria» (one pipeline, draft preview, Aplicar/Descartar). Verified: 2026-11-23 (same script: drawn arc → 17 valid keyframes; clicked route → 4 keyframes through the clicked centres; Descartar writes nothing; reopening shows the same points).
- [x] B1 Playback seek fix and «Reproducir desde el inicio». Verified: 2026-11-23 (same script: seeking to 0 after 1.5 s of playback reads 0.26 s 250 ms later; restart from 0; the paper interior at 1.2 s is pixel-identical reached forward or backward).
- [x] B2 Timeline: labelled actions, Trayectoria menu, shared numbered labels, inspector titles, editable keyframe time. Verified: 2026-11-23 (screenshots in `.e2e/shots/studio-motion-paths/`, eslint clean, `vite build` ok).
- [x] C1 Modo enfocado and taller timeline. Verified: 2026-11-23 (same script: zoom 33 % → 47 % at 1440×900, restored on exit).
- [x] C2 Phone layout, light and dark. Verified: 2026-11-23 (390×844 emulated touch, screenshots `08-phone-light/dark`; physical devices not tested).
- [x] Regression. Verified: 2026-11-23 (Studio lib tests 110/110, studio-interchange 98/98).
- [ ] D Bézier paths, effect sequences, audio tracks, element names: design only (spec, block D).
