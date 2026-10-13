# SDK: plan de corrección del cuerpo pendiente

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-sdk-company-response-design.md

## File Structure Map

Create: los presentes spec y plan.
Modify:
- packages/sdk/src/index.js: comprobación posterior al consumo JSON.
- packages/sdk/src/__tests__/company-fetch.test.js: regresiones de contexto y compatibilidad.
- docs/TASKS.md: evidencia del alcance y simulacro B2 pendiente.
- docs/superpowers/plans/2026-10-12-runly-stabilization.md: progreso por subalcance.
- docs/deployment/backup-acceptance.md: diferir aceptación real por indicación del usuario.

## Task 1 — Descubrimiento y delimitación

- [x] Leer programa, metodología y contratos relevantes; consultar grafo y fuente actual.
- [x] Reproducir prueba fallida: company-fetch, 2 pasan / 1 falla por falta de rechazo.
- [x] Documentar alcance exacto bajo Task 2 ya autorizado; conservar cambios locales de grabaciones.

## Task 2 — Implementación [IN PROGRESS]

- [ ] Agregar comprobación después de response.json().
- [ ] Agregar pruebas deterministas de cuerpos pendientes y contratos conservados.

Validation: node --test packages/sdk/src/__tests__/company-fetch.test.js

## Task 3 — Verificación y commit

- [ ] Ejecutar todas las pruebas SDK, privacidad y whitespace.
- [ ] Registrar resultados y marcar solamente este subalcance completado.
- [ ] Commit separado de documentos/progreso y luego código/regresiones/evidencia, sin incluir cambios ajenos.

Validation: node --test "packages/sdk/src/**/*.test.js"; pnpm check:privacy; git diff --check.

## Rollback

Revertir el commit SDK. No despliegue, publicación o ensayo contra infraestructura real.
