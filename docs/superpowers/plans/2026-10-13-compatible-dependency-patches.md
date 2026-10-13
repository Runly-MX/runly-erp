# Dependencias compatibles: plan por familia

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-compatible-dependency-patches-design.md

## File Structure Map

Create: este spec/plan; apps/api/src/services/__tests__/vision-image.test.js; scripts/tests/hono-security.test.mjs; scripts/tests/dom-purify-browser.test.mjs; scripts/tests/brace-expansion.test.mjs; docs/architecture/2026-10-13-dependency-patch-results.md y .json.
Modify: infra/installer/devkit-export/AGENTS.md (regeneraci?n ante divergencia detectada por el barrido), package.json, apps/api/package.json, pnpm-lock.yaml, docs/TASKS.md, docs/superpowers/plans/2026-10-12-runly-stabilization.md.
Temporales y logs quedan en ubicaciones locales no versionadas. No workflow CI o scripts de producción modificados.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Leer advisories primarios y metadata/versiones instaladas.
- [x] Contrastar prepareVisionImage y referencias de dependencia.
- [x] Delimitar cuatro familias compatibles, no majors.

## Task 2 — Sharp [IN PROGRESS]

- [x] Crear test de librsvg corregida y pipeline SVG/PNG/JPEG/inválido; baseline antes del cambio.
- [x] Actualizar Sharp 0.35.5 y closure nativa; revisar diff y frozen install.
- [x] Tests dirigidos y audit; commit de familia.

Resultado: baseline 3/4; corregido 4/4. Sharp 0.35.5 carga librsvg 2.63.2 en Windows. Frozen install pasa; comparaci?n YAML confirma ninguna resoluci?n ajena cambi?. Audit 43 (0 cr?ticas, 21 altas, 19 moderadas, 3 bajas). Linux y explotaci?n no probados.

## Task 3 — Hono

- [x] Test SSR root string/HTTP local; baseline 2/6, corregido 6/6 en ra?z y API.
- [ ] Actualizar Hono 4.13.7 en raíz/API; review/frozen/tests/audit; commit.

## Task 4 — DOMPurify

- [ ] Test en Chrome de sanitización/hook conforme a advisory, sin datos reales.
- [x] Override 3.4.16; frozen/test/build pasan, sin cambios de versiones ajenas. Audit 40 (0 cr?ticas, 21 altas, 18 moderadas, 1 baja). Commit de familia.

## Task 5 — brace-expansion

- [ ] Resolver copias usadas por minimatch/globs, probar contratos y límites del advisory.
- [x] Overrides 1.1.21 y 2.1.7; diff exclusivo, frozen/tests pasan. Audit 34 (0 cr?ticas, 17 altas, 16 moderadas, 1 baja). Commit por familia.

## Task 6 — Cierre

- [ ] API/shared acotados y web build, audit, privacidad/secrets/whitespace.
- [ ] Registrar resultados, plataformas y límites; sin deployment.

## Rollback

Revertir commits por familia; no tocar datos, credenciales o instancias.

## Hallazgo del barrido posterior

API: 2365 pass, 2 skip, 0 fail. Shared: 1616 pass, 7 skip, 1 fail: AGENTS.md exportado no incluye la secci?n Developer documentation presente en el documento fuente. Se regenera ?nicamente ese archivo mediante exportRme3Devkit; sin cambiar el documento fuente ni el test. Verificaci?n dirigida y nuevo barrido shared necesarios antes de declarar cierre.
