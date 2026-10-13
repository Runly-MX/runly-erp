# Reconciliación de contratos de regresión

Date: 2026-10-12
Status: In Progress
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 3)

## 1. Feature title

Reconciliar pruebas históricas con contratos actuales de Growth, campos condicionales y scaffolder.

## 2. Status

In Progress. Continuación autorizada de Task 3; transporte empresarial y simulacro real B2 diferidos por el usuario.

## 3. Context

La auditoría detectó pruebas con navegación antigua, regex anterior a nullable y un scaffolder que cuenta archivos antiguos y trata Markdown como JavaScript.

## 4. Problem

Esas expectativas no representan los contratos actuales y mantienen roja la regresión, dificultando distinguir fallos reales. La ejecución actual reproduce Growth y condicional; scaffolder se reproduce antes de editar.

## 5. Goals

1. Verificar navegación Growth vigente con permisos exactos, sin quitar entradas.
2. Ejecutar el validador generado y comprobar null/ausencia para campos ocultos y obligación para visibles.
3. Verificar inventario exacto de salida scaffolder y sintaxis solo de JavaScript.

## 6. Non-goals

No modificar servicios, plantillas de producción, permisos, esquema o navegación. No corregir Projects, generar catálogos ni actualizar dependencias dentro de estos commits.

## 7. User stories

Como mantenedor quiero pruebas que reflejen contratos vigentes y fallen al romperlos para evaluar regresiones de forma fiable.

## 8. UX requirements

Sin cambios UI. La navegación vigente de Growth incluye páginas declaradas por su manifiesto; contrastar specs de Formularios y configuración de propiedades.

## 9. Routes/screens

Sin rutas nuevas. Verificar las entradas existentes de Growth.

## 10. Data model

Sin cambios de entidades.

## 11. Prisma impact

Sin modelos o migraciones.

## 12. API contract

Sin cambios API. La comprobación de campos condicionales obligatorios se mantiene en el contrato generado de rutas/visibility.

## 13. SDK contract

Sin cambios.

## 14. Validator contract

No alterar Zod generado. Campos condicionales ocultos pueden omitirse o limpiarse con null; cuando son visibles, findMissingConditionalRequired detecta ausencia/null. Los campos obligatorios no condicionales conservan min(1) y rechazo de null.

## 15. Module manifest impact

Sin manifiestos nuevos ni modificados. Test Growth usa clave Runly y permisos/entradas actuales documentados.

## 16. Navigation impact

Solo comprobar las entradas vigentes de forma exacta; no eliminar rutas añadidas para satisfacer un test antiguo.

## 17. Blueprint impact

Sin cambios de blueprints.

## 18. RBAC/permissions

Comprobar los permissionKey de navegación existentes. No ampliar permisos.

## 19. Multi-company behavior

Sin cambios; los tests no usan instalación real ni credenciales.

## 20. Files/storage impact

El scaffolder escribe únicamente en su fixture temporal. Inventario esperado incluye documentación AGENTS/README y source-definition; no ejecutar node --check sobre Markdown/JSON.

## 21. Export/import requirements

Sin formatos nuevos; proteger el contrato de salida del scaffolder mediante lista exacta.

## 22. Audit log requirements

N/A: sin escrituras de auditoría.

## 23. Edge cases

Campo condicional ausente/null/vacío/valor válido; campo requerido siempre visible ausente/null; archivos inesperados/faltantes, JavaScript con sintaxis inválida y documentación confundida con código.

## 24. Risks

Cambiar assertions puede ocultar defectos: conservar comparaciones exactas de inventario/navegación y añadir ejecución de schemas. No dar por verde suites generales hasta finalizar y clasificar todos los resultados.

## 25. Acceptance criteria

1. Growth navigation coincide con contrato actual y permisos declarados.
2. El schema generado acepta datos ocultos omitidos/null y rechaza nombre ausente/null; visibility exige campos visibles.
3. El scaffolder produce exactamente archivos soportados y todos sus .js pasan node --check.
4. Suites dirigidas pasan sin omisiones.

## 26. Verification plan

Node tests de los tres archivos y suites vecinas relevantes; ejecutar baseline antes de editar, pnpm rbac:verify-catalog, pnpm check:privacy y git diff --check. Registrar barridos generales por separado, con flags y skips.

## 27. Rollback plan

Revertir cada commit de pruebas; sin migraciones o acciones remotas.

## 28. Future enhancements

Resolver familias Projects/runtime/QR y actualizar dependencias en scopes separados; preparar CI reproducible después de clasificar el baseline.

