# Chat: plan del hook del visitante

Date: 2026-10-12
Status: In Progress
Spec: docs/superpowers/specs/2026-10-12-chat-visitor-hook-design.md

## File Structure Map

Create: este spec/plan y apps/desktop/src/modules/runly.chat/screens/__tests__/visitor-info-browser.test.js.
Modify: apps/desktop/src/modules/runly.chat/screens/ExternalInboxScreen.jsx (orden del hook y contador deshabilitado), docs/TASKS.md y docs/superpowers/plans/2026-10-12-runly-stabilization.md (evidencia).

## Task 1 — Descubrimiento [COMPLETE]

- [x] Consultar grafo y fuente de VisitorInfoPanel/useExpiryCountdown.
- [x] Leer skill react-doctor y reutilizar harness Playwright/esbuild existente sin nuevas dependencias.
- [x] Delimitar el alcance autorizado en Task 2.

## Task 2 — Prueba y corrección [IN PROGRESS]

- [ ] Crear prueba navegador con servicios mock y componente/hook reales.
- [ ] Reproducir fallo antes del cambio.
- [ ] Mover el hook antes del retorno vacío, pasar null al deshabilitar, ocultar texto inactivo.
- [ ] Verificar abierta/vacía/cerrada, nueva fecha, fecha ausente y desmontaje.

Validation: $env:RUN_VISITOR_BROWSER_TESTS='1'; node --test apps/desktop/src/modules/runly.chat/screens/__tests__/visitor-info-browser.test.js

## Task 3 — Verificación y commit

- [ ] React Doctor sobre el archivo, build web, privacidad, diff check.
- [ ] Registrar fallos ajenos sin cambiar su scope; completar solo este alcance.
- [ ] Commit independiente; no publicación ni despliegue.

Validation: npx -y react-doctor@latest apps/desktop/src/modules/runly.chat/screens/ExternalInboxScreen.jsx --verbose --no-score --no-supply-chain; pnpm --filter @runly/desktop build:web; pnpm check:privacy; git diff --check.

## Rollback

Revertir commit. No cambios de DB, Storage ni configuración real.
