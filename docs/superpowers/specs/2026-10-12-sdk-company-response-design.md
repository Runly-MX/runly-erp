# SDK: respuestas pendientes y cambio de empresa

Date: 2026-10-12
Status: In Progress
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 2)

## 1. Feature title

Validar la empresa después de consumir el cuerpo JSON del SDK.

## 2. Status

In Progress. Continuación autorizada por el usuario del programa de estabilización; el simulacro real de B2 queda pendiente por indicación del usuario. Este documento concreta únicamente la corrección ya descrita en Task 2.

## 3. Context

El SDK captura la empresa en los encabezados de cada operación. El transporte createCompanyFetch ya verifica el contexto después de consumir cuerpos; request del SDK comprueba solamente antes de consumir JSON.

## 4. Problem

Una respuesta exitosa puede entregar datos de la empresa anterior si cambia la selección mientras response.json() está pendiente. La prueba existente reproduce el fallo localmente.

## 5. Goals

1. Rechazar el resultado tardío con company_changed y status 409.
2. Mantener las firmas, multipart, respuestas vacías y transporte offline actuales.
3. Verificar respuestas JSON y Blob con pruebas deterministas, sin servicios reales.

## 6. Non-goals

1. Cambiar autorización del servidor, cancelar o revertir mutaciones ya ejecutadas.
2. Rediseñar colas offline, inventar un contador de cambios de empresa o modificar las pantallas.
3. Resolver Attendance, hooks y hallazgos del guardrail en este commit.

## 7. User stories

Como usuario que cambia de empresa, quiero que una respuesta pendiente de la empresa anterior sea rechazada para evitar presentarla en el contexto nuevo.

## 8. UX requirements

Conservar el mensaje existente: «La empresa activa cambió. Repite la operación.» No se agregan elementos de interfaz.

## 9. Routes/screens

N/A: no se crean rutas ni pantallas.

## 10. Data model

N/A: no hay cambios de entidades ni persistencia.

## 11. Prisma impact

N/A: sin modelos ni migraciones.

## 12. API contract

Endpoints y formatos sin cambios. Las respuestas HTTP de error conservan status, details y responseText actuales; este alcance se limita a respuestas exitosas.

## 13. SDK contract

createRunlyClient y sus dominios mantienen firmas y valores de retorno. request revalida options.headers después de await response.json(), antes de devolver datos. Conservar la comprobación previa y retorno null para 204/205. requestBlob mantiene su comprobación posterior existente. Las solicitudes sin encabezado de empresa siguen permitidas para endpoints públicos/de plataforma.

## 14. Validator contract

N/A: reutilizar assertCurrentCompany; sin esquemas Zod nuevos.

## 15. Module manifest impact

N/A: no se crea módulo, identidad, dependencia, ACL o manifiesto.

## 16. Navigation impact

N/A: sin cambios.

## 17. Blueprint impact

N/A: sin cambios.

## 18. RBAC/permissions

Sin nuevas claves; los controles del servidor permanecen vigentes. El rechazo del cliente protege la entrega del resultado, no sustituye autorización.

## 19. Multi-company behavior

Comparar la empresa capturada en X-Runly-Company-Id contra getActiveCompanyId tras consumir JSON. Un cambio a otra empresa o a null rechaza; la empresa estable permite el resultado. Conservar semántica basada en identidad: A→B→A no se detecta como cambio al finalizar.

## 20. Files/storage impact

N/A: no se altera Storage. Verificar que Blob y multipart conservan sus contratos.

## 21. Export/import requirements

Sin nuevos formatos; regresión sobre una descarga Blob existente.

## 22. Audit log requirements

N/A: no se agregan escrituras de auditoría.

## 23. Edge cases

JSON pendiente, cambio a null, empresa estable, JSON inválido, 204/205, multipart, endpoint sin empresa, Blob pendiente y resultado de cola offline. Los errores de análisis JSON y HTTP conservan su semántica actual.

## 24. Risks

Una mutación puede haber ocurrido antes del rechazo: no prometer reversión ni añadir reintentos automáticos. El archivo index.js ya excede el límite SDD de tamaño; agregar una sola comprobación sin ampliar dominios y dejar su división para un alcance separado.

## 25. Acceptance criteria

1. Dada una respuesta JSON pendiente de A, cuando cambia a B o null, entonces rechaza con company_changed/409.
2. Dada una empresa estable, cuando termina JSON, entonces conserva el resultado.
3. Dados multipart, Blob, 204/205, errores HTTP, solicitud sin empresa o cola offline, entonces mantienen sus contratos actuales.

## 26. Verification plan

Reproducir el fallo existente antes del cambio; ejecutar company-fetch y todas las pruebas SDK. Ejecutar pnpm check:privacy y git diff --check. No se requiere servidor, B2 ni cambios React.

## 27. Rollback plan

Revertir el commit del SDK; sin migraciones ni cambios remotos. El rollback reintroduce el fallo descrito.

## 28. Future enhancements

Separar dominios del archivo SDK grande; evaluar un contador de contexto y errores tardíos en otro alcance. Continuar Attendance, hooks y guardrail según el programa.
