# SDK: plan de corrección del cuerpo pendiente

Date: 2026-10-12
Status: Complete
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

## Task 2 — Implementación [COMPLETE]

- [x] Agregar comprobación después de response.json().
- [x] Agregar pruebas deterministas de cuerpos pendientes y contratos conservados.

Validation: node --test packages/sdk/src/__tests__/company-fetch.test.js

## Task 3 — Verificación y commit

- [x] Ejecutar todas las pruebas SDK, privacidad y whitespace.
- [x] Registrar resultados y marcar solamente este subalcance completado.
- [x] Commit separado de documentos/progreso y luego código/regresiones/evidencia, sin incluir cambios ajenos.

Verified: 2026-10-12. Baseline: 2/3 pruebas originales pasaban, una fallaba por falta de rechazo. Después: 52/52 pruebas SDK pasan, sin omisiones; privacidad 4296 archivos, cero hallazgos; git diff --check pasa. No se ejecutó infraestructura real ni se modificó React. El resultado no demuestra aceptación de toda la etapa 2.

Validation: node --test "packages/sdk/src/**/*.test.js"; pnpm check:privacy; git diff --check.

## Rollback

Revertir el commit SDK. No despliegue, publicación o ensayo contra infraestructura real.
