# Parches compatibles: Hono, fast-uri y Valibot

Date: 2026-10-13
Status: Complete — three local patches; remaining families and operational acceptance pending

## 1. Feature title

Eliminar tres familias alertadas con contratos de consumidores comprobados.

## 2. Status

Continuación de seguridad autorizada. Baseline audit 27; ninguna excepción aceptada.

## 3. Context

Graph sin resultados útiles para dependencias; resolución real Prisma → dev → streams/Ajv consultada. Copias: Hono adapter 1.19.11 (API directo ya 1.19.17), fast-uri 3.1.2, Valibot 1.2.0. Metadata npm confirma targets 1.19.17, 3.1.8 y 1.4.2 disponibles, sin dependencias nuevas; peers actuales satisfacen Hono ^4 y TS >=5 opcional.

## 4. Problem

Static paths ambiguos pueden evitar guardas; normalización URI puede cambiar la autoridad; flatten de errores puede fallar con nombres heredados. Instalación vulnerable no demuestra explotación del ERP.

## 5. Goals

Parchar sólo rangos vulnerables y conservar resoluciones ajenas. Reproducir regresiones, mantener static/API válidos, resolución Ajv y validación normal. Registrar audit por familia y commits separados.

## 6. Non-goals

Sin cambios Prisma/CLI/runtime/server, upgrades major, provider/DB, reglas de módulos, CI, despliegue, B2 o transporte empresarial. No afirmar todas las alertas resueltas.

## 7. User stories

Como operador quiero dependencias parcheadas sin romper validadores ni servicios que las consumen.

## 8. UX requirements

Sin UI o textos de producto.

## 9. Routes/screens

Sin rutas ERP nuevas; fixtures Hono en memoria y loopback temporal.

## 10. Data model

N/A.

## 11. Prisma impact

No schema/generate/migraciones. Resolver packages de Prisma no inicia dev server ni consulta datos.

## 12. API contract

Sin cambios; smoke adaptador HTTP con Hono actual y static fixture sintético.

## 13. SDK contract

N/A.

## 14. Validator contract

Sin schemas Runly cambiados. Ajv real conserva $id/$ref/rechazo de entradas; Valibot record/flatten y schemas ordinarios conservados.

## 15. Module manifest impact

N/A.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Sin cambios; guardas static del fixture verificadas, no aceptación de RBAC ERP.

## 19. Multi-company behavior

Sin transporte/contexto modificado.

## 20. Files/storage impact

Directorio temporal propio para archivos ficticios; verificar target antes de borrar. Sin Storage real.

## 21. Export/import requirements

N/A.

## 22. Audit log requirements

N/A; no acciones persistentes.

## 23. Edge cases

Double slashes y backslash Windows, static normal/HEAD/range, URI backslash/encoded host/scheme/IPv6/port/case, refs Ajv, claves heredadas en errores Valibot; input URLs .test, sin requests a esos destinos. Pares peer/engine existentes se conservan.

## 24. Risks

Overrides de Prisma sobre pins exactos requieren fixtures del consumer y load del paquete. No iniciar Prisma dev server. Tests unitarios no aceptan Studio real o DB. Manual lockfile sólo de familias; frozen install y comparación estructural obligatorios. No ejecutar audit fix force.

## 25. Acceptance criteria

Static protegido nunca revela sentinel por rutas ambiguas; static normal/API loopback siguen funcionando. URI inválida rechazada o sin cambiar autoridad hacia una distinta de WHATWG; normales/ref Ajv pasan. Flatten devuelve arrays propios en claves heredadas sin mutar Object.prototype. Audit deja de alertar cada familia; otras resoluciones no cambian.

## 26. Verification plan

Baseline y corrected tests separados por familia; frozen install sin scripts; audit JSON por etapa; comparación YAML/manifiesto; barrido API/shared una vez al final sin DB real; privacy/secrets/whitespace.

## 27. Rollback plan

Revert focalizado por familia; sin reset, migraciones o datos.

## 28. Future enhancements

Restantes uuid/deepmerge-ts/mysql2/nodemailer/csv-parse/braces/katex en scopes propios. Aceptación real de CLI/Studio/red y dependencias major; deferrals conservados.

Fuentes: [Static slash](https://github.com/advisories/GHSA-92pp-h63x-v22m), [Windows](https://github.com/advisories/GHSA-frvp-7c67-39w9), [URI case](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj), [Valibot](https://github.com/advisories/GHSA-5qjj-4xww-7phc). Otros advisories URI del audit se usan para fixtures acotados.
