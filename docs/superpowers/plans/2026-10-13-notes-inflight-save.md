# Notes: plan de guardado en curso

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-notes-inflight-save-design.md.

## Goal and architecture

Extraer flushNoteSave para probar la ruta que usa NoteEditor. Capturar Y.Doc antes de marcar rerun, mantener payload pendiente en ref y no aplicar respuesta a doc destruido. Layout cleanup captura/envía antes del teardown pasivo; el callback confirmado se mantiene.

## File Structure Map

Create: este spec/plan; apps/desktop/src/modules/runly.notes/lib/flushNoteSave.js; apps/desktop/src/modules/runly.notes/lib/__tests__/flush-note-save.test.js; apps/desktop/src/modules/runly.notes/hooks/useNoteSaveOnUnmount.js; scripts/fixtures/notes-inflight-save.mjs; scripts/tests/notes-inflight-save.test.mjs; docs/architecture/2026-10-13-notes-inflight-save-results.md.

Modify: apps/desktop/src/modules/runly.notes/components/NoteEditor.jsx; scripts/fixtures/notes-committed-ref.mjs; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Task 1 — Scope

- [x] Graph/source, lifecycle, skills y spec/plan; autorización local vigente.
- [ ] Mode IMPLEMENTATION y commit documental.

## Task 2 — Extraction and baseline

- [ ] Extraer flujo original con refs/SDK inyectados y tests de comportamiento conservado.
- [ ] Commit de extracción validado antes del fix.
- [ ] Reproducir flush en curso + Y.Doc destruido y respuesta tardía; errores más nuevos cubiertos.

## Task 3 — Fix

- [ ] Capturar antes de busy; conservar/restaurar payload más reciente; no catch-up a doc destruido.
- [ ] Hook de salida layout; fixture React con teardown pasivo y callback regresiones usando hook real.
- [ ] Tests dirigidos pasan; commit de implementación.

Validation: node --test apps/desktop/src/modules/runly.notes/lib/__tests__/flush-note-save.test.js scripts/tests/notes-inflight-save.test.mjs scripts/tests/notes-committed-ref.test.mjs.

## Task 4 — Close

- [ ] Notes/browser suite, build web y React Doctor completo.
- [ ] Privacy/secrets/whitespace, evidencias y trackers, commit documental. Limitaciones de persistencia y keepalive explícitas.

No provider/DB/producción. No introducir timers/retries indefinidos ni registrar cuerpos/credenciales/contenido real.
