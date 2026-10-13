# Middleware de autenticación: extracción y caché

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-auth-cache-contract-design.md.

## File Structure Map

Create: este spec/plan; apps/api/src/services/auth-middleware.js; apps/api/src/services/__tests__/auth-middleware.test.js; docs/architecture/2026-10-13-auth-cache-verification.md.
Modify: apps/api/src/index.js (import y bloque authMiddleware exclusivamente); docs/architecture/2026-10-13-authentication-review.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/TASKS.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.
Sin dependencies, frontend, configuración real o base de datos.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Skill Supabase/docs/graph y source revisados en etapa JWT.
- [x] Contrastar TTL.USER_CONTEXT=300, cache get/set, block middleware y usos posteriores a su definición.
- [x] Definir dos commits de source: extracción compatible y corrección comprobada.

## Task 2 — Extracción

- [x] Factory con lógica original y conexión en index.js; usos posteriores a inicialización revisados.
- [x] Seis fixtures HTTP local/remoto/hit/401/no secret/casi expirado pasan; JWT/invitados incluidos, 25/25. Syntax index/factory y privacidad/whitespace pasan; commit de extracción separado.

## Task 3 — Corrección

- [x] Factory original: 12 tests, 7 pass/5 fail; cuatro comportamientos key/TTL y forma del key reproducidos.
- [x] SHA256 del token completo; clamp remoto al exp/buffer y TTL existente; no cache de exp desconocido/inválido. Identidad viene sólo de verificación local o getUser.
- [x] Middleware 12/12 y grupo relacionado total 49/49, sin skips o servicios reales; commit de hardening separado de extracción.

## Task 4 — Cierre

- [ ] Regresión API, syntax/privacy/secrets/whitespace.
- [ ] Evidence doc y riesgos abiertos actualizados; commit. Sin aceptación real de revocación.
