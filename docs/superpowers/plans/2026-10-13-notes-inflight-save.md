# Notes: plan de guardado en curso

Date: 2026-10-13
Status: Complete — local scope; durable recovery and operational acceptance pending
Spec: docs/superpowers/specs/2026-10-13-notes-inflight-save-design.md.

## Goal and architecture

Extraer flushNoteSave para probar la ruta que usa NoteEditor. Capturar Y.Doc antes de marcar rerun, mantener payload pendiente en ref y no aplicar respuesta a doc destruido. Layout cleanup captura/envía antes del teardown pasivo; el callback confirmado se mantiene.

## File Structure Map

Create: este spec/plan; apps/desktop/src/modules/runly.notes/lib/flushNoteSave.js; apps/desktop/src/modules/runly.notes/lib/__tests__/flush-note-save.test.js; apps/desktop/src/modules/runly.notes/hooks/useNoteSaveOnUnmount.js; scripts/fixtures/notes-inflight-save.mjs; scripts/tests/notes-inflight-save.test.mjs; docs/architecture/2026-10-13-notes-inflight-save-results.md.

Modify: apps/desktop/src/modules/runly.notes/components/NoteEditor.jsx; scripts/fixtures/notes-committed-ref.mjs; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Task 1 — Scope

- [x] Graph/source, lifecycle, skills y spec/plan; autorización local vigente.
- [x] Mode IMPLEMENTATION y commit documental 9d6839bd.

## Task 2 — Extraction and baseline

- [x] Extraer flujo original con refs/SDK inyectados; cinco tests pasan antes de fix.
- [x] Commit de extracción cf73a259 antes del fix.
- [x] Baseline: cinco pass/tres fail; se lee doc destruido, catch-up emite update tardío y payload fallido no se conserva. No pérdida real demostrada.

## Task 3 — Fix

- [x] Capturar antes de busy; conservar/restaurar payload más reciente; no catch-up a doc destruido. Dirty permanece visible al keepalive existente mientras espera y ante error.
- [x] Hook de salida layout; fixture React con teardown pasivo y callback regresiones usando hook real.
- [x] Tests dirigidos 16/16; commit de implementación tras revisión del diff.

Validation: node --test apps/desktop/src/modules/runly.notes/lib/__tests__/flush-note-save.test.js scripts/tests/notes-inflight-save.test.mjs scripts/tests/notes-committed-ref.test.mjs.

## Task 4 — Close

- [x] Notes/browser 168/168, build web 5.35 s; React Doctor completo, cero errores/cinco warnings previos.
- [x] Privacy/secrets: 4,367 archivos, cero hallazgos; whitespace pasa. Evidencias/trackers, límites de persistencia/keepalive y commit documental de cierre. Implementación 1b7305ed.

No provider/DB/producción. No introducir timers/retries indefinidos ni registrar cuerpos/credenciales/contenido real.
