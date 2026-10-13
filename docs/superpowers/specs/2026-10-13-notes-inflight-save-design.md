# Notes: guardado pendiente durante desmontaje

Date: 2026-10-13
Status: Complete — local save/teardown correction; durable and real persistence acceptance pending
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## 1. Feature title

Capturar cambios pendientes antes de destruir el documento del editor.

## 2. Status

Continuación local autorizada; scope concreto posterior al callback confirmado.

## 3. Context

NoteEditorSurface guarda Y.Doc primero y HTML después; si savingRef está activo, un flush sólo marca rerun. El engine padre destruye provider/Y.Doc en cleanup pasivo. Graph y source revisados. Los tests anteriores no ejecutan este flujo completo.

## 4. Problem

Un flush solicitado con envío en curso puede construir el siguiente update tras destruir Y.Doc. Una respuesta tardía también aplica catch-up al doc destruido. Fallos restauran dirty/snapshot, pero no existe recuperación durable o garantía de red.

## 5. Goals

Capturar el update pendiente antes de teardown, aun con envío activo. Serializar los envíos conservando el snapshot HTML más nuevo. Evitar aplicar catch-up al documento destruido y restaurar payloads fallidos sin pisar datos nuevos.

## 6. Non-goals

Sin offline storage, retries automáticos con backoff, nuevas garantías de entrega, cambios keepalive/provider/SDK/API/schema, UI de estados, dependencias o aceptación real de B2/CI/transporte empresarial. No resolver navegación entre compañías en este scope.

## 7. User stories

Como editor, quiero que las ediciones capturadas al salir sigan disponibles para el envío pendiente aunque el editor se destruya antes de finalizar la solicitud anterior.

## 8. UX requirements

Sin nuevas pantallas/textos/formularios. Debounce, updates optimistas y readOnly conservados.

## 9. Routes/screens

NoteEditor existente de runly.notes; sin rutas nuevas.

## 10. Data model

N/A; un ref adicional guarda payload Y.Doc en memoria por instancia, sin persistencia durable.

## 11. Prisma impact

N/A; sin migraciones/modelos.

## 12. API contract

notes.saveYDoc/update existentes sin cambios de request/response. Transporte simulado con promesas controladas.

## 13. SDK contract

Sin cambios; helper recibe notes y queryClient para probar el flujo real sin red.

## 14. Validator contract

N/A.

## 15. Module manifest impact

N/A; módulo oficial, ninguna identidad o manifest nuevo.

## 16. Navigation impact

N/A; preserve key por nota.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Mantener guardas readOnly/id/token antes de capturar o enviar.

## 19. Multi-company behavior

Refs siguen por instancia de nota y SDK existente. No cambia contexto empresarial, ni acepta aislamiento HTTP. Tests usan IDs/tokens ficticios.

## 20. Files/storage impact

N/A; sin uploads. Y.Doc real sólo en memoria; no conexión a Supabase.

## 21. Export/import requirements

N/A.

## 22. Audit log requirements

Sin cambios; acciones de servidor existentes conservadas.

## 23. Edge cases

Ediciones durante envío, flush al salir con busy=true, dos notas, fallo Y y HTML independientes, snapshot nuevo durante error, empty/readOnly, catch-up activo frente a destruido, segundo fallo sin loop automático. Capturar diff desde vector confirmado: el update nuevo incluye los cambios anteriores no confirmados y puede reemplazar uno pendiente anterior. El helper restaurará payload fallido sólo si no hay uno nuevo.

## 24. Risks

Codificar Y.Doc en layout cleanup bloquea brevemente commit; medir fixture y documentar límite de tamaño, no afirmar rendimiento universal. Cleanup layout debe preceder destrucción pasiva del padre; prueba React real. No leer/mutar doc tras await cuando isDestroyed=true. La cola es volátil; cierre del proceso, requests colgados y keepalive siguen abiertos. Sin retry continuo.

## 25. Acceptance criteria

Después de dos ediciones y flush con envío activo, destruir doc no impide al segundo payload conservar ambas. Catch-up tardío no emite update del doc destruido; doc activo converge. Error no reemplaza snapshot/payload más nuevo. La salida captura antes del cleanup pasivo del engine y cancela el timer. Envíos a notas distintas mantienen destinos y no comparten estado.

## 26. Verification plan

Extraer flujo original a helper y registrar baseline rojo controlado. Node tests con Y.Doc real/promesas SDK simuladas; fixture Chrome React con parent passive teardown y child layout capture, más regresiones del callback. Suite Notes/browser, build, React Doctor, privacy/secrets y whitespace. Sin DB/provider vivo.

## 27. Rollback plan

Revert focalizado helper/integración; sin migraciones o datos modificados.

## 28. Future enhancements

Durabilidad offline, UI y recuperación de errores, timeout/backoff con idempotencia, keepalive cap/orden, fallos reales de red/provider, cinco warnings previos y compañía/transporte separado.

React layout cleanup se ejecuta al desmontar: [referencia](https://react.dev/reference/react/useLayoutEffect). Supabase removeChannel revisado sin cambios de provider; changelog consultado, sin actualización de biblioteca en este scope.
