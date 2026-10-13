# Verificación JWT local: plan acotado

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-local-jwt-contract-design.md.

## File Structure Map

Create: este spec/plan; docs/architecture/2026-10-13-authentication-review.md.
Modify: apps/api/src/services/jwt-verification.js; apps/api/src/services/__tests__/verify-supabase-jwt.test.js; docs/TASKS.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md; docs/architecture/2026-10-13-stabilization-current-state.md.
No cambios index.js, middleware, dependencies, schema o clientes.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Leer skill Supabase, índice de changelog y documentación JWT/sesiones.
- [x] Graph y callers; contrastar helper, test que acepta falta de exp, signer y tokens de invitados.
- [x] Separar verificación local de caché/fallback/revocación; alcance decidido sin consultar secretos.

## Task 2 — Regresiones

- [ ] Helper independiente con header configurable; reloj fijo y nuevos casos negativos.
- [ ] Cambiar expectativa sin exp explícitamente; ejecutar y registrar baseline fallida.

## Task 3 — Verificador

- [ ] Validar estructura/header/alg y exp/nbf; preservar firma y leeway.
- [ ] JWT/invitados y pruebas PWA pertinentes; investigar fallos sin ocultarlos.

## Task 4 — Cierre

- [ ] Regresión API acotada, privacidad/secrets/whitespace.
- [ ] Review/documento con pruebas, límites y scopes siguientes de caché/revocación.
- [ ] Commit del verificador y evidencia; mantener CI/B2/transporte diferidos.
