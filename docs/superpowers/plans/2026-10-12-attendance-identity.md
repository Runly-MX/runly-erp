# Attendance: plan de integridad de identidad

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-attendance-identity-design.md

## File Structure Map

Create: este plan y su spec.
Modify:
- packages/core/src/module-identity.js: agregar la clave actual sin alias.
- scripts/__tests__/runly-module-identity.test.js: resolución y no-alias.
- apps/api/src/services/__tests__/runly-module-registration.test.js: fallback explícito de Attendance.
- docs/TASKS.md y docs/superpowers/plans/2026-10-12-runly-stabilization.md: progreso verificado.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Consultar grafo, catálogo, registros y fallbacks existentes.
- [x] Reproducir baseline: 8/10 pasan; fallan integridad de catálogo y fallbacks.
- [x] Delimitar la corrección ya autorizada en Task 2; sin nuevos aliases ni migraciones.

## Task 2 — Corrección [IN PROGRESS]

- [ ] Agregar runly.attendance al catálogo current-only.
- [ ] Probar resolución exacta, rutas y ausencia de alias en ambos registros.
- [ ] Probar fallback cuando falta o se descubre Attendance.

Validation: node --test scripts/__tests__/runly-module-identity.test.js apps/api/src/services/__tests__/runly-module-registration.test.js

## Task 3 — Verificación y commit

- [ ] Ejecutar pruebas core/registro engine, catálogo RBAC, privacidad y diff check.
- [ ] Registrar resultados y actualizar solamente el subalcance Attendance.
- [ ] Commit de código, regresiones y evidencia; mantener otros alcances pendientes.

## Rollback

Revertir el commit; sin publicación, despliegue ni sync de una instancia.
