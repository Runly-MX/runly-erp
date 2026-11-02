# Plan — Canvas DWG viewer

Spec: `docs/superpowers/specs/2026-11-02-canvas-dwg-viewer-design.md`

- [x] 1. Converter service: `apps/dwg/main.py`, `infra/docker/dwg.Dockerfile`, build-push entry, `docker:release:dwg` script, compose service `runly-dwg`.
- [x] 2. API: `canvas-dwg.js` + routes + tests (`node --test apps/api/src/routes/canvas/__tests__/`).
- [x] 3. SDK domain `canvas.dwg`.
- [x] 4. Desktop: `isDwg`, `insertDwg` (shared DXF flow), `accept`, tests.
- [x] 5. Installer provisioning (`DWG_CONVERTER_MODE`) in setup-local and setup-external, mirroring TTS.
- [x] 6. Docs: CLAUDE.md env note, TASKS.md entry.
- [x] 7. Verify: node tests, lint, `node --check`, converter smoke test if Docker is available.

Verified: 2026-11-02 (tasks 1-7; converter smoke test with the six public LibreDWG samples; browser smoke test and a customer DWG still pending, tracked in docs/TASKS.md).
