# Chat: plan del hook del visitante

Date: 2026-10-12
Status: Complete
Spec: docs/superpowers/specs/2026-10-12-chat-visitor-hook-design.md

## File Structure Map

Create: este spec/plan y apps/desktop/src/modules/runly.chat/screens/__tests__/visitor-info-browser.test.js.
Modify: apps/desktop/src/modules/runly.chat/screens/ExternalInboxScreen.jsx (orden del hook y contador deshabilitado), docs/TASKS.md y docs/superpowers/plans/2026-10-12-runly-stabilization.md (evidencia).

## Task 1 — Descubrimiento [COMPLETE]

- [x] Consultar grafo y fuente de VisitorInfoPanel/useExpiryCountdown.
- [x] Leer skill react-doctor y reutilizar harness Playwright/esbuild existente sin nuevas dependencias.
- [x] Delimitar el alcance autorizado en Task 2.

## Task 2 — Prueba y corrección [COMPLETE]

- [x] Crear prueba navegador con servicios mock y componente/hook reales.
- [x] Reproducir fallo antes del cambio.
- [x] Mover el hook antes del retorno vacío, pasar null al deshabilitar, ocultar texto inactivo.
- [x] Verificar abierta/vacía/cerrada, nueva fecha, fecha ausente y desmontaje.

Validation: $env:RUN_VISITOR_BROWSER_TESTS='1'; node --test apps/desktop/src/modules/runly.chat/screens/__tests__/visitor-info-browser.test.js

## Task 3 — Verificación y commit

- [x] React Doctor sobre el archivo, build web, privacidad, diff check.
- [x] Registrar fallos ajenos sin cambiar su scope; completar solo este alcance.
- [x] Commit independiente; no publicación ni despliegue.

Verified: 2026-10-12. Prueba opt-in ejecutada en Chrome local: baseline falla porque queda un intervalo tras limpiar selección (1 en lugar de 0); después 1/1 pasa, sin skips. Verifica selección nula inicial, abierta/vacía/abierta/cerrada, fecha ausente, ambos nombres de fecha, un solo intervalo, desmontaje y ausencia de errores React. El comando sin RUN_VISITOR_BROWSER_TESTS=1 omite explícitamente esta prueba y no demuestra su resultado.

React Doctor: un archivo revisado, exit 0, sin errores ni hook condicional; quedan 3 advertencias sobre complejidad de las funciones VisitorInfoPanel/ExternalInboxScreen y etiqueta de búsqueda basada en placeholder. No se alteraron esos controles o estructuras; quedan pendientes de un alcance de accesibilidad/mantenibilidad. Sin score remoto. Build web: pasó (9095 módulos), conserva advertencia de chunks grandes. Privacidad: 4301 archivos, cero hallazgos. git diff --check: pasó. No se efectuó QA de conversación real, publicación o despliegue.

Validation: npx -y react-doctor@latest apps/desktop/src/modules/runly.chat/screens/ExternalInboxScreen.jsx --verbose --no-score --no-supply-chain; pnpm --filter @runly/desktop build:web; pnpm check:privacy; git diff --check.

## Rollback

Revertir commit. No cambios de DB, Storage ni configuración real.
