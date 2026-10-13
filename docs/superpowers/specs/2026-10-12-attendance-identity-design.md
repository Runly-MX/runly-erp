# Attendance: integridad de identidad oficial

Date: 2026-10-12
Status: Complete
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 2)

## 1. Feature title

Completar el catálogo de identidades oficiales con runly.attendance.

## 2. Status

Complete. Alcance explícito de Task 2 del programa confirmado por el usuario al indicar «ok continuemos». Esta especificación concreta esa corrección sin ampliar el programa. Verified: 2026-10-12 (31/31 pruebas core, identidad y registro, sin omisiones; RBAC 321/321; privacidad sin hallazgos; whitespace).

## 3. Context

Attendance ya existe en el catálogo oficial. CURRENT_ONLY_OFFICIAL_MODULE_KEYS declara solamente Canvas. Los aliases Atlas/Runly se definen mediante pares explícitos.

## 4. Problem

El inventario exportado de identidades oficiales omite Attendance; las pruebas de igualdad con manifiestos y de fallbacks fallan (baseline: 8 pasan, 2 fallan). No se ha demostrado un fallo de registro real causado por esta omisión.

## 5. Goals

1. Incluir runly.attendance entre las identidades actuales sin alias histórico.
2. Mantener resolución exacta en ambos registros, rutas y fallbacks.
3. Verificar catálogo completo contra manifiestos oficiales.

## 6. Non-goals

No renombrar datos ni permisos, crear atlas.attendance, modificar el módulo Attendance, ejecutar sync contra una instancia o cambiar sus reglas de negocio.

## 7. User stories

Como mantenedor, quiero que el catálogo de identidades represente todos los manifiestos oficiales para detectar omisiones antes de publicar.

## 8. UX requirements

N/A: no cambia ninguna pantalla o texto.

## 9. Routes/screens

Sin rutas nuevas. La resolución de /app/m/runly.attendance conserva su identidad; una ruta atlas.attendance no se convierte en Runly.

## 10. Data model

N/A: sin entidades ni modificaciones de registros persistentes.

## 11. Prisma impact

Sin modelos ni migraciones; no editar schema.prisma.

## 12. API contract

Sin endpoints ni formatos nuevos. listOfficialFallbackManifests debe omitir Attendance si se descubre runly.attendance e incluirlo si falta; atlas.attendance no sustituye esa identidad.

## 13. SDK contract

N/A: SDK sin cambios. La exportación de @runly/core CURRENT_ONLY_OFFICIAL_MODULE_KEYS agrega runly.attendance conservando Canvas y su inmutabilidad.

## 14. Validator contract

N/A: sin cambios Zod.

## 15. Module manifest impact

Sin manifiestos nuevos o modificados, dependencias, ACL, PWA o claves nuevas. El manifiesto actual de Attendance sigue siendo la fuente de su política.

## 16. Navigation impact

N/A: sin entradas ni permisos de navegación nuevos.

## 17. Blueprint impact

N/A: sin cambios.

## 18. RBAC/permissions

Sin nuevas claves o política; comprobar que la política core corresponde al manifiesto real y no inventa un alias Atlas.

## 19. Multi-company behavior

Sin cambio de alcance por empresa ni de IDs. La corrección afecta al catálogo estático de módulos.

## 20. Files/storage impact

N/A: sin cambios de almacenamiento.

## 21. Export/import requirements

N/A: sin formatos nuevos.

## 22. Audit log requirements

N/A: no se agregan escrituras ni acciones.

## 23. Edge cases

Registro de runly.attendance, clave atlas.attendance desconocida, ambos registros con registro exacto, preservación de sufijos/query/hash y catálogo sin duplicados.

## 24. Risks

Inventar un alias puede alterar resolución de datos históricos; probar que atlas.attendance permanece independiente. No confundir pasar pruebas de catálogo con aceptación funcional de Attendance.

## 25. Acceptance criteria

1. Dado el catálogo oficial, sus claves actuales coinciden exactamente con pares y claves actuales sin alias.
2. Dado Attendance registrado, ambos registros resuelven su clave exacta y no atlas.attendance.
3. Dado Attendance descubierto, no se genera fallback; con solamente atlas.attendance, el manifiesto Runly sigue disponible.
4. Las pruebas de compatibilidad existentes pasan.

## 26. Verification plan

node --test scripts/__tests__/runly-module-identity.test.js apps/api/src/services/__tests__/runly-module-registration.test.js; pruebas core y module-engine de registro; pnpm rbac:verify-catalog; pnpm check:privacy; git diff --check. Fixtures locales, sin acceso a DB/servicios reales.

## 27. Rollback plan

Revertir el commit de catálogo y regresiones; sin migraciones ni acciones remotas. Esto reintroduce los dos fallos de integridad.

## 28. Future enhancements

Hook condicional de chat y hallazgos del transporte pendientes según Task 2. Aceptación funcional/hardware de Attendance pertenece a Task 6.

