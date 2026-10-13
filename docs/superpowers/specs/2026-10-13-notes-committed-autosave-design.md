# Notes: callback de guardado confirmado por React

Date: 2026-10-13
Status: Authorized autonomous local scope
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## 1. Feature title

Evitar que renders descartados cambien el callback de flush de Notes.

## 2. Status

Continuación local autorizada por el usuario; spec concreto para el pendiente descubierto con React Doctor.

## 3. Context

NoteEditorSurface pertenece a una nota mediante key=note.id. flushSave captura token, permisos y engine; un ref permite al cleanup y rerun usar el callback reciente. Graph y source consultados; revisión Tiptap encontró una escritura durante render.

## 4. Problem

Un render suspendido puede publicar su callback al ref compartido antes de commit, afectando el flush de la UI que sigue montada. No se demostró pérdida de datos en producción.

## 5. Goals

El ref conserva el callback del último commit. Desmontaje cancela el debounce y usa ese callback. Cambiar de nota conserva el aislamiento por key.

## 6. Non-goals

No rediseñar autosave, keepalive, retries, Y.Doc, provider, metadatos ni accesibilidad. No aceptación real de persistencia, red o colaboración; sin dependencias, schema, CI, B2 ni transporte empresarial.

## 7. User stories

Como editor, quiero que salir de una nota use su guardado confirmado aunque otra actualización de React quede suspendida.

## 8. UX requirements

Sin cambios visuales, textos o elementos de formulario. Mantener debounce y flush existentes.

## 9. Routes/screens

NoteEditor existente de runly.notes; ninguna ruta nueva.

## 10. Data model

N/A; sin cambios.

## 11. Prisma impact

N/A; sin modelos o migraciones.

## 12. API contract

N/A; notes.update/saveYDoc existentes conservados.

## 13. SDK contract

N/A; no cambios.

## 14. Validator contract

N/A.

## 15. Module manifest impact

N/A; módulo oficial existente, sin manifest nuevo.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Guardas readOnly/token existentes; sin cambios de autorización.

## 19. Multi-company behavior

Sin cambios de transporte. El ref permanece por instancia con key; el test de keys usa notas ficticias y no acepta aislamiento de API.

## 20. Files/storage impact

N/A; sin uploads o provider real.

## 21. Export/import requirements

N/A.

## 22. Audit log requirements

N/A; acciones persistentes conservadas.

## 23. Edge cases

Actualización suspendida, callback cambiado en commit, cambio de key, unmount antes del debounce, StrictMode y callback usado por rerun. La inicialización useRef conserva el primer callback; el update ocurre en useLayoutEffect antes de eventos/microtasks posteriores al commit.

## 24. Risks

Pruebas del hook no prueban el transporte de autosave completo. Documentar ese límite. Mantener cleanup pasivo existente para no cambiar orden de destrucción del engine; no introducir nuevos flush por cambio de callback. React browser host singleton en fixture, sin SSR.

## 25. Acceptance criteria

Después de un render suspendido, unmount llama al último callback confirmado. Un commit nuevo actualiza el ref sin disparar guardado. Cada key desmontada llama su propio callback y cancela su timeout. StrictMode no publica callbacks de renders suspendidos.

## 26. Verification plan

Chrome con React real, Suspense y startTransition; baseline con escritura original y resultado corregido. Tests Notes existentes y fixture Tiptap; build web; React Doctor dirigido sin score/supply chain; privacy/secrets y diff checks.

## 27. Rollback plan

Revert focalizado de hook/import; sin migraciones, reset o datos modificados.

## 28. Future enhancements

Persistencia/autoguardado completo bajo fallos y desmontaje durante request en curso; proveedor real, keepalive y recuperación; cinco warnings previos en scope separado.

React permite actualizar refs desde efectos y advierte sobre leer/escribir durante render. El efecto layout se ejecuta en commit antes del repintado. Fuentes: [useRef](https://react.dev/reference/react/useRef), [useLayoutEffect](https://react.dev/reference/react/useLayoutEffect).
