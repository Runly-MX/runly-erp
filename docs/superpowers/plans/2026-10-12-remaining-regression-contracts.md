# Contratos restantes: plan

Date: 2026-10-12
Status: Complete
Spec: docs/superpowers/specs/2026-10-12-remaining-regression-contracts-design.md

## File Structure Map

Create: este spec y plan.
Modify:
- apps/api/src/routes/projects/__tests__/tasks-service.test.js
- apps/api/src/services/__tests__/module-runtime-catalog.test.js
- scripts/generate-module-runtime-catalog.mjs (tabla de componentes que el generador omitía)
- scripts/lib/rme3-devkit.js (LF canónico para texto)
- scripts/__tests__/export-rme3-devkit.test.js (regresión de promptStarter)
- packages/module-compiler/src/runtime-catalog.json
- packages/module-compiler/src/developer-docs.json (snapshot dependiente de librerias.md)
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

## Task 2 — Fixture Tasks [COMPLETE]

- [x] Completar consulta project.findUnique sin cambiar servicio.
- [x] Probar evento de tarea, empresa, número y posición.
- [x] node --test "apps/api/src/routes/projects/__tests__/*.test.js".

## Task 3 — Runtime/QR/Dev Kit

- [x] Probar mappings compartidos y plugins Vite efectivos (dev/build/subruta).
- [x] Regenerar catálogo/documento desde scripts existentes.
- [x] Regenerar developer-docs.json después del documento público para mantener el ZIP offline coherente.
- [x] Reconciliar componentes documentados con exports y normalizar saltos del prompt; decisión de revisión del diff 2026-10-12.
- [x] Copiar los 13 archivos revisados desde staging; sin borrado recursivo del snapshot.
- [x] node --test apps/api/src/services/__tests__/module-runtime-catalog.test.js scripts/__tests__/export-rme3-devkit.test.js scripts/__tests__/installer-devkit-snapshot.test.js infra/installer/__tests__/devkit-installer.test.js.
- [x] Build web y revisión de importmap en dist/index.html.

## Task 4 — Cierre por alcance

- [x] Privacidad y whitespace; ledger/evidencia.
- [x] Commit separado Tasks y runtime/snapshot; sin publicación.

Verified: 2026-10-12. Projects 65/65 (evento, query y taskNumber incluidos); runtime/Dev Kit 8/8; compilador completo 112/112. Primer barrido del compilador encontró developer-docs.json dependiente de la versión de lucide; regenerado y repetido con éxito. Build web pasó con advertencia de chunks grandes; importmap QR de dist/index.html comprobado. Privacidad 4307 archivos, cero hallazgos; git diff --check pasó. Normalización LF evita introducir CRLF dentro de JSON del contrato. Sin nuevas dependencias o publicación de paquetes. Cambios concurrentes de NewMeetingDialog quedan fuera del commit.

## Rollback

Revertir cada commit. No cambios remotos o migraciones.

