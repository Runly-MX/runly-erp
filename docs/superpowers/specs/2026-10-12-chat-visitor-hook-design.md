# Chat: hook del panel de visitante

Date: 2026-10-12
Status: In Progress
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 2)

## 1. Feature title

Orden estable de hooks y limpieza del contador del panel de visitante.

## 2. Status

In Progress. Corrección de Task 2 autorizada al continuar el programa; alcance local sin servicios reales.

## 3. Context

VisitorInfoPanel retorna null antes de llamar useExpiryCountdown cuando no hay conversación. El hook usa useState/useEffect y un intervalo de un segundo.

## 4. Problem

La selección vacía cambia el orden de hooks y puede dejar activo el intervalo anterior. El contador conserva texto al deshabilitar la fecha, por ejemplo al cerrar la conversación.

## 5. Goals

1. Ejecutar el hook en cada render, antes del retorno vacío.
2. Cancelar el intervalo cuando no hay selección, la conversación está cerrada o se desmonta.
3. Ocultar el contador si no existe vencimiento activo.
4. Probar transiciones con React real en navegador local.

## 6. Non-goals

Rediseñar pantalla, reasignación, consultas, controles UI, transporte o reglas de cierre del servidor. No QA de conversación con usuarios reales.

## 7. User stories

Como operador, quiero seleccionar, limpiar y cerrar conversaciones sin errores React ni un contador que siga activo para una sesión cerrada.

## 8. UX requirements

Mantener diseño y etiquetas existentes. Sin conversación, panel vacío. Cerrada o sin fecha, ocultar «Sesion expira en»; abierta con fecha conserva contador.

## 9. Routes/screens

Pantalla existente ExternalInboxScreen y su panel VisitorInfoPanel. Sin nuevas rutas.

## 10. Data model

N/A: sin entidades nuevas; usar status e idle_expires_at/idleExpiresAt existentes.

## 11. Prisma impact

Sin modelos ni migraciones.

## 12. API contract

Sin endpoints o payloads nuevos.

## 13. SDK contract

N/A: sin cambios.

## 14. Validator contract

N/A: sin cambios.

## 15. Module manifest impact

Sin nuevos módulos, identidades, PWA, dependencias o ACL; manifiesto chat sin cambios.

## 16. Navigation impact

N/A: sin cambios.

## 17. Blueprint impact

N/A: sin cambios.

## 18. RBAC/permissions

Sin nuevas claves ni cambios de acceso.

## 19. Multi-company behavior

Sin cambios al transporte o consultas. Fixture sin servidor ni datos de instalación.

## 20. Files/storage impact

N/A: sin archivos del usuario o Storage.

## 21. Export/import requirements

N/A.

## 22. Audit log requirements

N/A: sin escrituras.

## 23. Edge cases

Sin selección inicial; abierta→vacía→abierta; abierta→cerrada→abierta; cambio de fecha; fecha ausente; desmontaje. Compatibilidad de ambas formas del nombre de fecha.

## 24. Risks

Una prueba solo de texto fuente no detecta limpieza real: usar ReactDOM en Chrome local y contar intervalos. Mockear servicios e iconos, conservando el componente y hook originales mediante exportación solamente en el bundle de prueba. Errores React Doctor preexistentes deben declararse, no ocultarse.

## 25. Acceptance criteria

1. Dado el panel abierto con fecha futura, hay un intervalo y contador visible.
2. Al limpiar selección o cerrar, no queda intervalo ni contador.
3. Al seleccionar otra conversación, contador correcto y un único intervalo.
4. Al desmontar, cero intervalos y sin errores de hooks.
5. Build web pasa y no queda diagnóstico de hook condicional en VisitorInfoPanel.

## 26. Verification plan

Node test opt-in con Playwright y esbuild ya presentes; ejecutar baseline antes de corrección. React Doctor sobre archivo cambiado, build:web, privacidad y git diff --check. No iniciar API, DB ni servidor de desarrollo conectado a una instalación.

## 27. Rollback plan

Revertir commit del hook y prueba; sin migraciones o acciones remotas.

## 28. Future enhancements

Otros diagnósticos UI/React y transporte se revisan en alcances separados; simulacro B2 permanece pendiente.

