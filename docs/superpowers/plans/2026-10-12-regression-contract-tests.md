# Reconciliación de pruebas: plan

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-regression-contract-tests-design.md

## File Structure Map

Create: este spec/plan y docs/architecture/2026-10-12-regression-ledger.md.
Modify:
- apps/api/src/manifests/official/__tests__/storefront-capture-foundation-contract.test.js
- packages/module-compiler/src/__tests__/conditional-layout.test.js
- scripts/scaffold/__tests__/e2e.test.js
- docs/TASKS.md
- docs/superpowers/plans/2026-10-12-runly-stabilization.md

## Task 1 — Descubrimiento [COMPLETE]

- [x] Reproducir Growth y condicional; contrastar manifiesto y spec Formularios.
- [x] Revisar nullable-validation y scaffolder; conservar código de producción.
- [x] Iniciar refresh general de baseline y auditoría de dependencias (resultados pendientes).

## Task 2 — Contratos [IN PROGRESS]

- [ ] Actualizar navegación exacta de Growth según contrato actual.
- [ ] Ejecutar schemas generados y visibility para null/ausencia/valor requerido.
- [ ] Reproducir scaffolder y comprobar inventario exacto, sintaxis .js y documentos requeridos.

Validation: node --test apps/api/src/manifests/official/__tests__/storefront-capture-foundation-contract.test.js packages/module-compiler/src/__tests__/conditional-layout.test.js packages/module-compiler/src/__tests__/nullable-validation.test.js scripts/scaffold/__tests__/e2e.test.js

## Task 3 — Evidencia y commits

- [ ] Suites dirigidas y catálogo RBAC, privacidad, diff check.
- [ ] Registrar ledger del baseline y causas, dejando fallos ajenos pendientes.
- [ ] Un commit por familia verificada; no publicación ni despliegue.

## Rollback

Revertir commits por familia; no cambios persistentes.
