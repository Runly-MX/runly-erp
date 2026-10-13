# shell-quote: plan de parche compatible

Date: 2026-10-12
Status: Complete
Spec: docs/superpowers/specs/2026-10-12-shell-quote-security-design.md

## File Structure Map

Create: este spec/plan; scripts/tests/shell-quote-security.test.mjs; docs/architecture/2026-10-12-dependency-triage.md; docs/architecture/2026-10-12-dependency-triage.json.
Modify: package.json, pnpm-lock.yaml, docs/architecture/2026-10-12-regression-ledger.md, docs/TASKS.md, docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Verificar advisory primario y ruta/versiones instaladas.
- [x] Delimitar override específico; no alterar otras dependencias.

## Task 2 — Parche [COMPLETE]

- [x] Prueba de rechazo sin ejecutar el payload; baseline antes del cambio.
- [x] Override concurrently>shell-quote 1.11.0 y lockfile revisado.
- [x] Instalar congelado sin scripts; prueba y CLI de concurrently.

Validation: node --test scripts/tests/shell-quote-security.test.mjs scripts/__tests__/start-office-dev.test.js; pnpm exec concurrently --help; pnpm install --frozen-lockfile --ignore-scripts.

## Task 3 — Evidencia

- [x] Audit actualizado y matriz inicial de todas las familias; sin excepciones aceptadas.
- [x] Registrar barridos generales previos y resultado Gitleaks local; no atribuir verificación de infraestructura real.
- [x] pnpm check:privacy; git diff --check; commit de alcance.

Verified: 2026-10-12. pnpm intentó refrescar latest; se descartaron esos cambios conservando todas las resoluciones originales y agregando solo shell-quote 1.11.0/override. Lock diff: 9 líneas; package diff: una. Frozen install --ignore-scripts pasó. Seguridad/startup/runtime 10/10; CLI concurrently --help exit 0. Audit: 0 critical, 22 high, 19 moderate, 3 low; ninguna alerta shell-quote. Suites generales anteriores al parche: API 2361 pass/2 skip, shared ampliado 1616 pass/7 skip, ambas cero fallos. No se repitieron los barridos generales después del parche exclusivo de tooling; pruebas dirigidas y lock review cubren ese cambio. Gitleaks local 8.30.1 se verificó por checksum y el escaneo pasó; CI sigue pendiente de provisión.

## Rollback

Revertir commit e instalar desde lockfile anterior; alerta reaparece.
