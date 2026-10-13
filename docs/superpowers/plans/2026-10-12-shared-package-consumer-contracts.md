# Consumidor aislado: plan

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-shared-package-consumer-contracts-design.md

## File Structure Map

Create:
- scripts/verify-shared-consumer.mjs (CLI/orquestación local)
- scripts/lib/shared-consumer-registry.mjs (validación y registro GET local)
- scripts/fixtures/shared-consumer/node-contract.mjs
- scripts/fixtures/shared-consumer/browser-contract.jsx
- scripts/fixtures/shared-consumer/build.mjs
- scripts/tests/shared-consumer-registry.test.mjs
- docs/architecture/2026-10-12-shared-consumer-verification.md
- Este spec/plan.

Modify: package.json (comando verify:shared-consumer), docs/RUNLY_SHARED_PACKAGES.md, docs/TASKS.md, docs/superpowers/plans/2026-10-12-runly-stabilization.md. No workflow CI, imports ERP o fuentes de instancia.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Leer contratos, manifests y preparación/rewrite actuales.
- [x] Preparar seis artifacts desde SHA limpio 5f9066dc447ac16ff8daf86724201c69e61c1a23; sin publicación.
- [x] Definir aislamiento, npm aliases, singleton pins y frozen reinstall.

## Task 2 — Implementación [IN PROGRESS]

- [ ] Validador de manifest/checksums y registry local read-only.
- [ ] Tests de invalid input y HTTP policy.
- [ ] Consumer temporal con npm aliases exactos, env sin secretos y runtime pins.
- [ ] Fixtures Node/compiler/SDK y build JSX/CSS sin fuente hermana.
- [ ] Navegador real, metafile/resolución y segunda instalación frozen.

Validation: node --test scripts/tests/shared-consumer-registry.test.mjs; pnpm verify:shared-consumer --manifest .artifacts/shared-release/<SHA>/manifest.json.

## Task 3 — Verificación y cierre

- [ ] Release policy tests y privacy/secrets/diff checks.
- [ ] Documentar exactamente qué prueba registry local y qué aceptación real falta.
- [ ] Commit CLI/fixtures/tests por alcance; mantener CI/B2/transporte diferidos.

## Rollback

Revertir scope; sin publicación, upgrade de Hub o cambios persistentes.
