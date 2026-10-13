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

- [ ] Factory con lógica original y conexión en index.js.
- [ ] Fixtures HTTP: local/remoto/hit/401/no secret/casi expirado; tests y commit de extracción.

## Task 3 — Corrección

- [ ] Casos negativos key/TTL sobre factory original; registrar baseline.
- [ ] SHA256 del token completo y clamp remoto/no cache de exp desconocido.
- [ ] Fixtures HTTP/reloj y JWT/invitados relacionados; commit por alcance.

## Task 4 — Cierre

- [ ] Regresión API, syntax/privacy/secrets/whitespace.
- [ ] Evidence doc y riesgos abiertos actualizados; commit. Sin aceptación real de revocación.
