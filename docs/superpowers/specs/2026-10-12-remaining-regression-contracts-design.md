# Contratos restantes de regresión

Date: 2026-10-12
Status: Complete
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 3)

## 1. Feature title

Restablecer mocks de tareas y contratos generados de runtime/Dev Kit.

## 2. Status

Complete. Continuación de Task 3 autorizada por el usuario; no extender a transporte o B2 diferidos. Verified: 2026-10-12 (Projects 65/65, runtime/Dev Kit 8/8, compilador 112/112; build web e importmap final, privacidad y whitespace).

## 3. Context

Baseline actual falla en dos tests de tareas, tres de runtime/QR y uno de snapshot. El único cambio de versión observado en catálogo es lucide-react 1.50.0→1.51.0, coherente con pnpm-lock.yaml e instalación.

## 4. Problem

Mock project carece de findUnique para la publicación del evento. QR inspecciona literales en Vite que ahora provienen de preview-runtime. Los archivos generados del runtime/Dev Kit no representan la fuente actual.

## 5. Goals

1. Completar fixture de tareas y verificar su evento/companyId.
2. Probar mappings QR efectivos de preview-runtime y plugins Vite dev/build.
3. Actualizar catálogo/documento y los 13 archivos divergentes del Dev Kit desde generadores existentes con revisión de diferencias.

## 6. Non-goals

Sin cambios de servicios, autorización, librerías instaladas, manifiestos de módulos, paquetes publicados o fuentes de instancia. Tras revisar el diff generado, se incluye reconciliar el inventario de componentes de la tabla documental con exports reales y normalizar los textos del exportador a LF; sin cambiar sus contratos de módulos.

## 7. User stories

Como mantenedor quiero mocks fieles al servicio y artefactos generados verificables para detectar regresiones reales y distribuir instrucciones actuales.

## 8. UX requirements

N/A: no cambiar UI. Los documentos generados conservan sus ejemplos y etiquetas según fuente vigente.

## 9. Routes/screens

Sin rutas nuevas. Los plugins Vite generan importmaps de desarrollo y producción para los shims QR existentes.

## 10. Data model

N/A: eventos se modelan en un stub local, no se modifica DB.

## 11. Prisma impact

Sin modelos ni migraciones; fixture project.findUnique corresponde al método ya usado por el servicio.

## 12. API contract

Sin cambios. El fixture verifica publicación projects.task.created con companyId del proyecto y payload id/projectId/title; no implementar transacción nueva de outbox.

## 13. SDK contract

Sin cambios SDK ni nombres lógicos. Contrato compartido de externals se importa por export preview-runtime/externals.

## 14. Validator contract

N/A: sin cambios.

## 15. Module manifest impact

Sin identidades/ACL/PWA nuevas. Snapshot del Dev Kit conserva el golden-path y manifiesto generado del inventario, sin editar fuentes de instancia.

## 16. Navigation impact

N/A: sin cambios.

## 17. Blueprint impact

N/A: sin cambios.

## 18. RBAC/permissions

No modificar controles; conservar pruebas de Tasks y Projects negativas existentes.

## 19. Multi-company behavior

Fixture de evento debe usar el companyId del proyecto consultado. Sin acceso a instalación real ni afirmación de aceptación multicompañía.

## 20. Files/storage impact

Staging en carpeta temporal nueva; copiar solo diferencias revisadas al snapshot. No ejecutar exportador destructivo directamente sobre carpeta tracked. Inventario revisado sin archivos añadidos o retirados. Normalizar los textos leídos por el exportador a LF para que promptStarter no dependa del checkout Windows/Linux; añadir regresión explícita.

## 21. Export/import requirements

Catálogo/documento mediante generate-module-runtime-catalog; snapshot mediante exportRme3Devkit y comparación. El snapshot developer-docs del compilador depende de librerias.md y debe regenerarse después mediante generate-module-developer-docs. generatedAt es metadato variable; no inventar SHA de release para fuente posterior.

## 22. Audit log requirements

Sin nuevas escrituras. Verificar outbox solo en fixture de pruebas.

## 23. Edge cases

Tareas existentes en estado/posición, número de tarea y título normalizado, plugin Vite con base de subruta, mappings dev/build y existencia de shims; versiones lockfile y diferencias timestamp-only.

## 24. Risks

Un mock permisivo puede ocultar fallo: assert de query específica y evento exacto. Regenerar desde instalación inconsistente podría falsear catálogo: contrastar lucide con lockfile. Snapshot contiene instrucciones: revisar privacidad y diff; nunca copiar configuración privada.

## 25. Acceptance criteria

1. Tasks tests pasan con evento observado y compañía correcta.
2. QR dev/build importmaps contienen ambos mappings/shims y respetan base.
3. Catálogo y doc coinciden con generador, snapshot coincide con exportador sin omitir pruebas.
4. Suites dirigidas pasan y privacidad no encuentra datos privados.

## 26. Verification plan

Node Tasks/Projects, module-runtime-catalog, export/snapshot/devkit; build web para importmap de producción; pnpm check:privacy y diff check. Registrar resultados, sin afirmar regresión general verde por pruebas dirigidas.

## 27. Rollback plan

Revertir commits de fixture o artefactos generados por separado. Sin cambios de DB o deploy.

## 28. Future enhancements

CI de enumeración completa, consumer aislado de paquetes, procedencia reproducible de releases y clasificación/parches de dependencias.

