# Consumidor aislado: plan

Date: 2026-10-12
Status: Complete (local packed consumer; registry acceptance pending)
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

Modify .gitignore: excluir específicamente .artifacts/shared-consumer/ y .artifacts/shared-consumer-source-*/ para que logs, fixture lockfiles y checkout auxiliar nunca se versionen. No excluir código o módulos completos del control de privacidad.

Discovery update: consumer real falló al importar AtlasTable; añadir packages/ui/src/index.js y packages/ui/src/runly-renderer/index.js para restaurar cinco exports históricos al mismo componente (incluido CardView, documentado en el spec de migración). Ampliar scripts/__tests__/runly-package-compatibility.test.js para probar exports en bundle y compatibilidad de scopes. Actualizar infra/installer/devkit-export/capabilities.runtime.json, README.md y manifest.json desde staging para los nuevos aliases/conteos. Verificar con React Doctor/export test y nuevo pack de commit limpio antes de repetir consumer. Preparación puede usar checkout aislado del commit mientras el CLI permanece en desarrollo; no empaquetar fuentes sucias.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Leer contratos, manifests y preparación/rewrite actuales.
- [x] Preparar seis artifacts desde SHA limpio 5f9066dc447ac16ff8daf86724201c69e61c1a23; sin publicación.
- [x] Definir aislamiento, npm aliases, singleton pins y frozen reinstall.

## Task 2 — Implementación [COMPLETE]

- [x] Validador de manifest/checksums y registry local read-only.
- [x] Tests de invalid input y HTTP policy.
- [x] Consumer temporal con npm aliases exactos, env sin secretos y runtime pins.
- [x] Restore five historical renderer exports: source package scope/bundle tests 3/3, Dev Kit 2/2, web build passed, targeted React Doctor 2 files/no issues, privacy/whitespace passed. Consumer identity assertion will be repeated from a clean committed pack.
- [x] Fixtures Node/compiler/SDK y build JSX/CSS sin fuente hermana.
- [x] Navegador real, metafile/resolución y segunda instalación frozen.

Validation: node --test scripts/tests/shared-consumer-registry.test.mjs; pnpm verify:shared-consumer --manifest .artifacts/shared-release/<SHA>/manifest.json.

## Task 3 — Verificación y cierre

- [x] Release policy tests y privacy/secrets/diff checks.
- [x] Documentar exactamente qué prueba registry local y qué aceptación real falta.
- [x] Commit CLI/fixtures/tests por alcance; mantener CI/B2/transporte diferidos.

Verified: 2026-10-12. Policy/registry 8/8 tests; existing scopes/export bundle 3/3 and Dev Kit 2/2. Source pack 257771de39f3f9d966eae1c0e47d9ca2598309c9 from clean checkout; two independent directories (second frozen) pass Node/browser/build, inventory integrity and singletons; 4539 isolated build inputs each. React/DOM 19.3.0 and Query 5.104.1 pinned at host level. CLI rejects publication options. Privacy/secrets/whitespace passed; logs/locks/checkouts ignored specifically. HTTP 404 on read-only Hub package lookup leaves actual remote pin unverified. Source packages were not published. Full evidence/limits in shared-consumer-verification.md.

## Rollback

Revertir scope; sin publicación, upgrade de Hub o cambios persistentes.
