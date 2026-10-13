# Parcheo compatible de dependencias

Date: 2026-10-13
Status: Complete (local verification)
Program: docs/superpowers/plans/2026-10-12-runly-stabilization.md (Task 3)

## 1. Feature title

Aplicar parches compatibles de Hono, Sharp, DOMPurify y brace-expansion.

## 2. Status

In Progress. Trabajo local autónomo autorizado por el usuario; CI, B2 real y transporte empresarial siguen diferidos.

## 3. Context

Auditoría actual: 44 alertas. Versiones parcheadas verificadas en advisories primarios: Hono 4.13.7, Sharp 0.35.5, DOMPurify 3.4.16 y brace-expansion 1.1.21/2.1.7.

## 4. Problem

Siguen instaladas versiones alertadas de HTTP/SSR, imágenes, sanitización y globs. La presencia en el lockfile no demuestra una ruta explotable en Runly, pero los parches compatibles se pueden probar localmente.

## 5. Goals

1. Cambiar una familia por commit, conservando resoluciones ajenas.
2. Probar Hono HTTP/SSR, librsvg y pipeline de imágenes, DOMPurify en navegador y globs ordinarios.
3. Verificar frozen install, audit y regresión general al terminar.

## 6. Non-goals

No upgrades major, imágenes publicadas, despliegues, cambios de autorización, payload RCE, bloqueo global de SVG, ajustes de políticas de empresa ni mensajes externos.

## 7. User stories

Como operador/desarrollador quiero dependencias parcheadas con contratos locales verificados y cambios recuperables por familia.

## 8. UX requirements

Sin cambios de pantallas; la sanitización puede retirar contenido inseguro según el parche del proveedor.

## 9. Routes/screens

Sin rutas nuevas. HTTP fixture loopback con Hono, no arranque de API de instalación.

## 10. Data model

Sin entidades nuevas o datos reales.

## 11. Prisma impact

Sin modelos/migraciones. No actualizar familias Prisma dentro de este alcance.

## 12. API contract

Firmas y payloads actuales conservados. Probar respuesta JSON, auth fake y encabezado de empresa; SSR de Hono debe escapar strings ordinarios, sin afirmar que Runly usa esa ruta vulnerable.

## 13. SDK contract

Sin cambios SDK.

## 14. Validator contract

Parchear librerías existentes, no agregar reglas nuevas de negocio. DOMPurify usa su configuración actual; no cambiar allowlists de producto.

## 15. Module manifest impact

Sin nuevos módulos/PWA/ACL, aliases o identidades persistentes.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Sin cambios. Fixtures usan encabezados y datos ficticios; no verifican una autenticaci?n real.

## 19. Multi-company behavior

Mantener encabezados/contratos existentes; pruebas de aislamiento posteriores no usan DB real.

## 20. Files/storage impact

Sharp y binarios opcionales/libvips de su familia actualizados; probar SVG válido y JPEG sin ampliación y rechazo de entrada inválida. No usar archivos de clientes.

## 21. Export/import requirements

CSV/SMTP/editores quedan fuera si requieren major/coordinación. No regenerar catálogo runtime por cambios ajenos a sus librerías.

## 22. Audit log requirements

Resumen sanitizado de audit, versiones y resultados; logs privados en temporal o artifacts ignorados.

## 23. Edge cases

Hono string SSR, rutas JSON y context header; SVG/PNG a JPEG, input corrupto, dimension limits; DOM event attributes/script sanitization; glob 1.x/2.x con Node consumers reales.

## 24. Risks

pnpm puede refrescar latest accidentalmente: revisar diff y preservar todas las resoluciones ajenas. Sharp incluye binaries por plataforma; verificar host Windows y metadata, sin reclamar exploit/Linux acceptance. Si API/generador cambia, detener ese parche y documentar causa.

## 25. Acceptance criteria

1. Versiones alertadas de las cuatro familias desaparecen del audit tras cada patch.
2. Pruebas dirigidas y frozen install pasan; no resoluciones ajenas aceptadas.
3. Native librsvg del host cumple versión corregida y image pipeline conserva contratos.
4. Regresión API/shared y web build pasan o se registra un fallo reproducible sin ocultarlo.

## 26. Verification plan

node:test Hono SSR/HTTP, Sharp/librsvg/prepareVisionImage, DOM en Chrome local y brace consumers; pnpm install frozen sin scripts, audit, API/shared acotados, web build, privacidad/secrets y diff check.

## 27. Rollback plan

Revertir por familia y reinstalar desde lockfile anterior; reaparecen sus alertas. Sin cambios de datos.

## 28. Future enhancements

Nodemailer/CSV/UUID y otras majors con diseño propio; actualización coordinada Tiptap y parches transitorios Prisma. Confirmación de artefactos Linux/deploy separada.


Verified: 2026-10-13. Evidencia y l?mites en docs/architecture/2026-10-13-dependency-patch-results.md/.json. Cierre de estas cuatro familias; no cierre de la auditor?a general.
