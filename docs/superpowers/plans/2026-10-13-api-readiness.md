# API readiness — implementación

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-api-readiness-design.md.

## Goal and architecture

Service con deadline/cache/coalescing, adaptador del pool con AbortSignal y release seguro; router Hono operativo reservado antes de módulos. Bootstrap explícito y status ERROR bloquean verde; shutdown lo revoca.

## File Structure Map

Create: este spec/plan; apps/api/src/services/readiness-service.js; apps/api/src/services/__tests__/readiness-service.test.js; apps/api/src/routes/health-routes.js; apps/api/src/routes/__tests__/health-routes.test.js; docs/architecture/2026-10-13-readiness-verification.md; docs/deployment/api-health.md.

Modify: apps/api/src/index.js; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Task 1 — Scope

- [x] Graph/source, pg y skills; audit 27 confirmado (13 high/13 moderate/1 low), diez familias.
- [ ] Mode IMPLEMENTATION y commit documental.

## Task 2 — Service and HTTP

- [ ] Service/adaptador/tests: timeout, errores, client release, concurrencia, late settlement y recuperación.
- [ ] Router/tests: contratos health/ready, privacidad, no-store, runtime y wiring antes de módulos.
- [ ] Integración bootstrap y shutdown; commit tras tests dirigidos.

Validation: node --test apps/api/src/services/__tests__/readiness-service.test.js apps/api/src/routes/__tests__/health-routes.test.js.

## Task 3 — Close

- [ ] Barrido API sin flags de DB real; docs operativas/evidencias y trackers.
- [ ] Privacy/secrets/whitespace; commit documental. Audit permanece failing, sin excepciones.

Sin publicar/desplegar/cambiar Compose. No marcar recorridos ERP, módulos completos o servicios externos como aceptados.
