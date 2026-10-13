# Notes: plan de callback confirmado

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-notes-committed-autosave-design.md.

## Goal and architecture

Publicar el ref de flush mediante useCommitRefValue en layout effect. Mantener cleanup, guardas y payloads del editor. Fixture con React real verifica commit/suspensión y ciclo de vida del hook; no simula éxito del servidor.

## File Structure Map

Create: este spec/plan; apps/desktop/src/modules/runly.notes/hooks/useCommitRefValue.js; scripts/fixtures/notes-committed-ref.mjs; scripts/tests/notes-committed-ref.test.mjs; docs/architecture/2026-10-13-notes-committed-autosave-results.md.

Implementation refinement: el ref se declara antes de flushSave con useRef para conservar su estabilidad reconocida por exhaustive-deps; useCommitRefValue sólo publica el valor en commit. Esto evita una dependencia circular/TDZ en el callback recursivo. El helper provisional useCommittedRef.js no se conserva.

Modify: apps/desktop/src/modules/runly.notes/components/NoteEditor.jsx; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Task 1 — Scope

- [x] Descubrimiento graph/source, contratos y spec/plan; autorización local vigente.
- [x] Declaración Mode IMPLEMENTATION y commit documental 408f1cff.

## Task 2 — Regression and fix

- [x] Extraer ref con comportamiento original y preparar Chrome harness.
- [x] Baseline: tres escenarios pass/dos fail (más fallo del test padre); render suspendido publica callback descartado. Actualizar ref sólo en commit.
- [x] Cambio confirmado, keys/unmount/debounce, StrictMode y acceso asíncrono pasan: cinco escenarios y test padre, 6/6.

Validation: node --test scripts/tests/notes-committed-ref.test.mjs.

## Task 3 — Verification and close

- [ ] Tests Notes existentes y fixture Tiptap; build web y React Doctor dirigido.
- [ ] Privacy/secrets y diff checks; evidencia con límites, trackers y commits por alcance.

No push/deploy/provider real. Renders suspendidos deben observarse en fixture antes de desmontar; no usar sleeps como evidencia de render ocurrido. Retener pendientes anteriores.
