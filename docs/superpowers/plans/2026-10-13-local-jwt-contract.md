# Verificación JWT local: plan acotado

Date: 2026-10-13
Status: Complete (local verification)
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

- [x] Helper independiente con header configurable; reloj fijo y nuevos casos negativos.
- [x] Expectativa sin exp cambiada deliberadamente; baseline JWT/invitados 11 pass/8 fail de 19.

## Task 3 — Verificador

- [x] Estructura/header/alg y exp/nbf validados; firma y leeway conservados.
- [x] JWT/invitados 19/19; grupo sesión/Realtime/login/JWT 37/37, sin skips o servicios reales. Fracciones NumericDate y límites exactos probados.

## Task 4 — Cierre

- [x] API: 2376 tests, 2374 pass/2 skip/0 fail (213.38 s); controles de privacidad/secrets/whitespace.
- [x] Review con límites y scopes siguientes de caché/revocación, sin consultas o sesiones reales.
- [x] Verificador commiteado en c11cefe3 y evidencia registrada; CI/B2/transporte diferidos.

Node 22.12.0, concurrency 8, timeout 60000 ms, force-exit. Mismos globs/exclusiones del regression-ledger; force-exit no prueba limpieza de handles. Grupo relacionado sin force-exit: 37/37, finaliza normalmente. Sin cambios de dependencies/frontend; shared/build de la etapa previa no se atribuyen a este verificador.
