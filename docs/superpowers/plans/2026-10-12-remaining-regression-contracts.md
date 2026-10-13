# Contratos restantes: plan

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-remaining-regression-contracts-design.md

## File Structure Map

Create: este spec y plan.
Modify:
- apps/api/src/routes/projects/__tests__/tasks-service.test.js
- apps/api/src/services/__tests__/module-runtime-catalog.test.js
- packages/module-compiler/src/runtime-catalog.json
- docs/developers/librerias.md
- docs/architecture/2026-10-12-regression-ledger.md
- docs/TASKS.md
- docs/superpowers/plans/2026-10-12-runly-stabilization.md
- infra/installer/devkit-export/AGENTS.md
- infra/installer/devkit-export/README.md
- infra/installer/devkit-export/capabilities.runtime.json
- infra/installer/devkit-export/docs/02_module_system.md
- infra/installer/devkit-export/docs/03_core_modules.md
- infra/installer/devkit-export/docs/03_custom_modules.md
- infra/installer/devkit-export/docs/ai-context/rme3-modules.md
- infra/installer/devkit-export/docs/ai-context/rme3-runtime-capabilities.md
- infra/installer/devkit-export/docs/ai-context/runly-storefront-sdk.md
- infra/installer/devkit-export/docs/module-quality-standards.md
- infra/installer/devkit-export/manifest.json
- infra/installer/devkit-export/prompt-starter.txt
- infra/installer/devkit-export/troubleshooting.md

## Task 1 — Descubrimiento [COMPLETE]

- [x] Baseline: Tasks 2 fallos, runtime/QR 3 y Dev Kit 1.
- [x] Comparar exportador en staging: sin altas/bajas, 13 archivos divergentes.
- [x] Contrastar lucide-react 1.51.0 contra instalación y lockfile.

## Task 2 — Fixture Tasks [IN PROGRESS]

- [ ] Completar consulta project.findUnique sin cambiar servicio.
- [ ] Probar evento de tarea, empresa, número y posición.
- [ ] node --test "apps/api/src/routes/projects/__tests__/*.test.js".

## Task 3 — Runtime/QR/Dev Kit

- [ ] Probar mappings compartidos y plugins Vite efectivos (dev/build/subruta).
- [ ] Regenerar catálogo/documento desde scripts existentes.
- [ ] Copiar los 13 archivos revisados desde staging; sin borrado recursivo del snapshot.
- [ ] node --test apps/api/src/services/__tests__/module-runtime-catalog.test.js scripts/__tests__/export-rme3-devkit.test.js scripts/__tests__/installer-devkit-snapshot.test.js infra/installer/__tests__/devkit-installer.test.js.
- [ ] Build web y revisión de importmap en dist/index.html.

## Task 4 — Cierre por alcance

- [ ] Privacidad y whitespace; ledger/evidencia.
- [ ] Commit separado Tasks y runtime/snapshot; sin publicación.

## Rollback

Revertir cada commit. No cambios remotos o migraciones.

