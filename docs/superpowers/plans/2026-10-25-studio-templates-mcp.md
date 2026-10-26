# Plan de ejecución: plantillas y MCP Studio

Fecha: 2026-10-25. Dependencia normativa: `../specs/2026-10-25-studio-templates-mcp-design.md`.

1. **Cerrar especificación antes de código.** Leer servicios Studio, contrato, ACL SQL, registry/runtime MCP, capacidades Canvas y wiring MirAI. Crear ambos documentos; comprobar secciones, alcance, privacidad y paths. Commit solo documentos propios. Aceptación: arquitectura descrita corresponde al HEAD local y decisiones de imágenes/aprobación son explícitas.
2. **Persistencia y permisos.** Añadir nueva `prisma/migrations/*_studio_templates/migration.sql`, modelos oficiales en `prisma/schema.prisma` si procede, `manifests/official/studio.js`, `permission-catalog.js`; revisar seed, provisioning y sync. Sin SQL en instalaciones. Aceptación: defaults/checks/FK/RLS/revokes y ninguna concesión silenciosa a roles existentes. Dependencia: 1.
3. **Servicio y recursos.** Crear `routes/studio/studio-templates-service.js` y utilidades backend de recorrido/proyección; extender mínimamente `studio-access.js` y `studio-collaboration.js` para recorrido recursivo. Mantener `studio-service.js` compartible dentro de transacción MCP. Añadir rutas delgadas en `routes/studio/index.js`. Aceptación: permisos en servicio, CAS, auditoría y copia independiente con acceso privado persistente. Dependencia: 2.
4. **Capacidades y lint.** Crear `routes/studio/studio-review.js`, `studio-application.js`, `mirai-capabilities.js`. Consultas compartidas, catálogo/Files reutilizados, esquema vigente y guía de composición. Aceptación: geometría rotada, contraste conservador, respuestas acotadas; MirAI no elude aprobación. Dependencia: 3.
5. **Dominio MCP.** Crear `mcp/adapters/studio.js`; registrar en `registry.js`, scopes en `config.js`; respetar readPermission explícito sin cambiar inferencia de otros dominios. Prepare/execute usan los mismos servicios y transacciones; company sensible. Wiring de consultas MirAI en `routes/chat/mirai-actions-wiring.js`. Aceptación: prepare→web→commit, revalidación de recursos/revisión, expiración e idempotencia heredadas verificadas. Dependencia: 4.
6. **Pruebas locales.** Añadir tests de servicio/PostgreSQL, HTTP, lint y capacidades; extender `mcp/__tests__/official-domains.js` mediante casos Studio dedicados y actualizar contratos de dominio. Crear runner Docker local desechable para Studio si hace falta. Ejecutar regresiones Studio, permisos, MCP y Files; ninguna variable de base habitual se usa. Aceptación: escenarios de spec cubiertos y resultados documentados, sin ocultar fallos ajenos. Dependencias: 2–5.
7. **Contrato de interfaz y cierre.** Añadir `docs/integrations/RUNLY_STUDIO_TEMPLATES_API.md` con requests/responses verificadas y registrar dominio en docs MCP/catalogo generado por su script. Actualizar estado del plan con evidencia de pruebas. Ejecutar `pnpm check:privacy`, revisar estado/HEAD/index y commits coherentes exclusivamente propios. No publicar/desplegar. Dependencia: 6.

## Estado

- [x] Arquitectura inspeccionada; spec y plan escritos antes de implementación.
- [ ] Persistencia/permisos.
- [ ] Servicio HTTP y referencias privadas.
- [ ] Capacidades compartidas y revisión.
- [ ] MCP y MirAI.
- [ ] Pruebas y contrato visual.

## Coordinación

Archivos React/Fabric y contrato `apps/shared/studio/document.js` quedan fuera del alcance. Los cambios presentes de otras sesiones no se incluyen en commits propios. Revisar cambios concurrentes antes de cada commit y añadir archivos explícitos, nunca `git add .`.
