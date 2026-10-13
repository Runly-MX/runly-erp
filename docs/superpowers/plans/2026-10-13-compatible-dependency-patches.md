# Dependencias compatibles: plan por familia

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-compatible-dependency-patches-design.md

## File Structure Map

Create: este spec/plan; apps/api/src/services/__tests__/vision-image.test.js; scripts/tests/hono-security.test.mjs; scripts/tests/dom-purify-browser.test.mjs; scripts/tests/brace-expansion.test.mjs; docs/architecture/2026-10-13-dependency-patch-results.md y .json.
Modify: package.json, apps/api/package.json, pnpm-lock.yaml, docs/TASKS.md, docs/superpowers/plans/2026-10-12-runly-stabilization.md.
Temporales y logs quedan en ubicaciones locales no versionadas. No workflow CI o scripts de producción modificados.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Leer advisories primarios y metadata/versiones instaladas.
- [x] Contrastar prepareVisionImage y referencias de dependencia.
- [x] Delimitar cuatro familias compatibles, no majors.

## Task 2 — Sharp [IN PROGRESS]

- [ ] Crear test de librsvg corregida y pipeline SVG/PNG/JPEG/inválido; baseline antes del cambio.
- [ ] Actualizar Sharp 0.35.5 y closure nativa; revisar diff y frozen install.
- [ ] Tests dirigidos y audit; commit de familia.

## Task 3 — Hono

- [ ] Test SSR root string/HTTP local; baseline.
- [ ] Actualizar Hono 4.13.7 en raíz/API; review/frozen/tests/audit; commit.

## Task 4 — DOMPurify

- [ ] Test en Chrome de sanitización/hook conforme a advisory, sin datos reales.
- [ ] Override 3.4.16; diff/frozen/test/build/audit; commit.

## Task 5 — brace-expansion

- [ ] Resolver copias usadas por minimatch/globs, probar contratos y límites del advisory.
- [ ] Overrides 1.1.21 y 2.1.7; diff/frozen/test/audit; commit.

## Task 6 — Cierre

- [ ] API/shared acotados y web build, audit, privacidad/secrets/whitespace.
- [ ] Registrar resultados, plataformas y límites; sin deployment.

## Rollback

Revertir commits por familia; no tocar datos, credenciales o instancias.
