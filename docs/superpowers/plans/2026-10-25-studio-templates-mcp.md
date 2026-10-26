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
- [x] Persistencia/permisos.
- [x] Servicio HTTP y referencias privadas.
- [x] Capacidades compartidas y revisión.
- [x] MCP y MirAI (consultas; escrituras mediante MCP aprobado).
- [x] Pruebas propias y contrato visual; regresiones globales ejecutadas con fallos previos documentados.

## Evidencia de verificación local

- `node scripts/verify-studio-local.mjs --tests-only`: PostgreSQL 18 Docker desechable; 1,336 correctas, 0 fallidas, 1 omitida. Incluye persistencia Studio, auth/JWT, RBAC y Files, además de regresiones de paquetes. Sin Auth/Storage remotos.
- `pnpm test:studio`: 28 correctas, 0 fallidas, 1 omitida (la prueba SQL se ejecutó en el runner Docker anterior).
- Pruebas enfocadas de HTTP/revisión/contratos MCP/destinos de archivos: 12 correctas, ninguna omitida o fallida.
- `pnpm rbac:verify-catalog`: 343 permisos en manifest y catálogo; ninguna diferencia.
- `pnpm test:mcp`: PostgreSQL 18 Docker desechable, migraciones forward Studio reales y funciones RBAC/ACL vigentes. 186 correctas, 17 fallidas, 2 omitidas, contando resultados padre. Todos los seis grupos Studio (servicio, aislamiento/CAS, imágenes, HTTP, MirAI, flujo MCP), sus nueve consultas y el destino studio.design pasan. Se verificó bloqueo tras revocar manage/publish/membresía/empresa/archivo, creación y actualización de diseños, confirmación sensible, expiración y commit repetido.
- Fallos globales MCP conservados: fixtures de Notas sin parent_note_id, expectativas previas de operaciones de Notas/Proyectos y consultas de tipos/plantillas de Documentos sin sus fixtures. Arrastran casos de adjuntos/SDK y sus padres. No se modifican servicios, contratos ni fixtures de esos módulos para ocultarlos.
- Comparación de control: ejecutar el runner MCP desde una copia local de `92712d38`, anterior a integrar el dominio, produjo 189 pruebas: 170 correctas, los mismos 17 fallos y 2 omitidas. Comparar nombres de fallos contra la ejecución final devuelve cero fallos nuevos; los 16 casos adicionales pasan. Ambas ejecuciones usan contenedores PostgreSQL desechables independientes.
- `pnpm check:privacy`: la comprobación global ya fallaba antes de cambios funcionales por 64 hallazgos en Notas/Automatizaciones y un documento ajeno; la ejecución final reporta 65 tras añadirse una licencia tipográfica por otra sesión. Los 27 archivos propios revisados en el índice no tienen hallazgos. No se altera el comprobador ni las excepciones de política.

Las migraciones solo se aplicaron dentro del runner Docker MCP, nunca a la base configurada habitual. Se preservaron cambios concurrentes del motor/UI. El contrato de integración está en `docs/integrations/RUNLY_STUDIO_TEMPLATES_API.md`. El catálogo MCP se generó y se incorporaron únicamente las entradas Studio, preservando explicaciones manuales ajenas que el generador global elimina actualmente.

## Coordinación

Archivos React/Fabric y contrato `apps/shared/studio/document.js` quedan fuera del alcance. Los cambios presentes de otras sesiones no se incluyen en commits propios. Revisar cambios concurrentes antes de cada commit y añadir archivos explícitos, nunca `git add .`.
