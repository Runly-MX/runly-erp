# shell-quote: plan de parche compatible

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-shell-quote-security-design.md

## File Structure Map

Create: este spec/plan; scripts/tests/shell-quote-security.test.mjs; docs/architecture/2026-10-12-dependency-triage.md; docs/architecture/2026-10-12-dependency-triage.json.
Modify: package.json, pnpm-lock.yaml, docs/architecture/2026-10-12-regression-ledger.md, docs/TASKS.md, docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Verificar advisory primario y ruta/versiones instaladas.
- [x] Delimitar override específico; no alterar otras dependencias.

## Task 2 — Parche [IN PROGRESS]

- [ ] Prueba de rechazo sin ejecutar el payload; baseline antes del cambio.
- [ ] Override concurrently>shell-quote 1.11.0 y lockfile revisado.
- [ ] Instalar congelado sin scripts; prueba y CLI de concurrently.

Validation: node --test scripts/tests/shell-quote-security.test.mjs scripts/__tests__/start-office-dev.test.js; pnpm exec concurrently --help; pnpm install --frozen-lockfile --ignore-scripts.

## Task 3 — Evidencia

- [ ] Audit actualizado y matriz inicial de todas las familias; sin excepciones aceptadas.
- [ ] Registrar barridos generales previos y resultado Gitleaks local; no atribuir verificación de infraestructura real.
- [ ] pnpm check:privacy; git diff --check; commit de alcance.

## Rollback

Revertir commit e instalar desde lockfile anterior; alerta reaparece.
