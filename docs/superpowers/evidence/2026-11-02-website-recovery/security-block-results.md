# Website Recovery — cierre local S1: autoridad y aislamiento multitenant

Fecha: 2026-11-02. Base funcional de este bloque: `fef52f42b17f921d0626e67a15c5c6742c927ea3`, main. Expediente contractual: `da8e06afc`, [contratos v1](../../specs/2026-11-02-website-recovery-contracts-v1.md) §2, §10 y §11, [plan S1](../../plans/2026-11-02-website-recovery.md). El commit que incorpora esta acta es el cierre local; obtener su SHA con `git log -1 --format=%H -- docs/superpowers/evidence/2026-11-02-website-recovery/security-block-results.md`.

**APTO para el bloque S1 de autorización de aplicación sobre los accesos administrativos afectados. Website permanece NO APTO E2E.** No se inicia S2. La prueba es local, con servicios y rutas Hono reales sobre repositorios sintéticos en memoria; no certifica constraints/RLS de PostgreSQL ni aislamiento del navegador. No se cargó configuración de producción, arrancó la API completa, abrió un servidor de pruebas ni conectó DB/Storage/SMTP reales.

## Defectos corregidos y causa raíz

| Hallazgo / riesgo | Causa | Corrección y evidencia |
|---|---|---|
| WR-04: editor podía publicar por PATCH genérico | Permiso update sin comprobar transición o efecto público | Política backend exige pages.publish para cambiar status, alterar metadata de una página publicada, eliminarla o cambiar fuente pública. Draft ordinario sigue disponible; SEO vivo también exige publish. Pruebas editor/publicador REST y servicio. |
| WR-05: padres ajenos o referencias cruzadas | Filtrar fila por company no acreditaba site, menu, form ni referencias secundarias | Cadena empresa → sitio activo → recurso, referencias al mismo sitio, parent al mismo menú, reorder validado completo y predicados company/parent en writes. Se verifican homepage, theme, category, page, padre, campos, submissions, render existente y archivos mediante ACL Files. |
| WR-15: categoría blog aceptaba cambios de ownership | PATCH raw y propagación de data a Prisma | Allowlist estricta REST y servicio directo; rechaza companyId/siteId y demás propiedades desconocidas antes de persistir. |
| WR-17: regresión original del resolver | Stub company sin findUnique ni enabled | Fixture corregido, mismas aserciones conservadas; no se añadió fallback de producción. Suite original seleccionada vuelve a estar incluida en los 221 tests correctos. |
| Llamadas internas/MCP podían omitir controles de ruta | Servicio confiaba en argumentos, middleware como única barrera | Todas las operaciones exportadas de Website y Forms exigen contexto opaco emitido por servidor y permiso de operación antes del repositorio. MCP verifica también run/prepare/execute/revision. Actor del audit se deriva del contexto. |
| Selector ausente podía ampliar consulta | Prisma omite undefined en where | Métodos por recurso exigen su ID; referencias con padre explícito deben coincidir. Pruebas de servicio directo. |
| Website/Growth compartían una columna con semántica distinta | siteId histórico también contiene GrowthProperty.id | Adaptadores separados por ownerDomain. Se preserva el ID; cada operación valida el tipo y empresa de su owner y, si existe, su sitio vinculado. Coincidencia ambigua produce 409, sin migrar ni asignar arbitrariamente. Es un guard de S1, no la solución completa WR-16/FormScope de S2. |
| Borrados y recreación podían perder historia | Cascada del sitio, deleteSubmission y restauración que reiniciaba página | Sitio se archiva y audita en una transacción, sin borrar hijos; eliminación de respuestas/ZIP retenida con 409. Crear sobre ruta archivada produce 409 y no reinicia contenido. |
| Upload/fuente legacy permitían exposición fuera del permiso publish | Endpoint upload escribía públicamente y activaba dist | La frontera existente exige dist.upload + site.update + pages.publish y se mantiene cerrada con 409 isolation_required. No hay implementación nueva de importación/publicación ZIP. |

No se modificaron los algoritmos de releases, hosting o serving. Los objetos públicos históricos no se revocaron ni se trasladaron. La conservación de filas no acredita que el serving legacy retire todo contenido al archivar: lifecycle, caché y URLs públicas permanecen en S3.

## Archivos y responsabilidades

Todos los paths siguientes son relativos al repositorio.

| Archivos | Responsabilidad |
|---|---|
| `apps/api/src/services/website-authorization-service.js` (nuevo) | Contexto emitido por servidor, permisos, alias explícitos, actor, errores sin detalles internos. |
| `apps/api/src/services/website-resource-policy.js` (nuevo) | Política de operación, padres, referencias, exposición pública y ACL de archivos. |
| `apps/api/src/routes/website/website-service.js`, `service-helpers.js` | Fachada segura, writes por empresa/padre, hidratación blog filtrada, conservación y error común. |
| `apps/api/src/routes/website/index.js`, `pages-routes.js`, `themes-routes.js`, `menus-routes.js`, `blog-routes.js`, `forms-routes.js`, `validators.js` | Propagación del contexto, IDs parent, validación estricta, permisos y errores REST. |
| `apps/api/src/routes/website/dist-routes.js` | Exclusivamente frontera de autoridad y bloqueo de mutaciones incompatibles con aislamiento/retención aprobados. Se retiró el handler que publicaba inmediatamente; el servicio parser/serving no se cambió ni ejecutó. |
| `apps/api/src/services/forms-service.js`, `apps/api/src/routes/growth/growth-router.js`, `growth-form-routes.js` | Owner tipado sin cambiar IDs históricos, protección de fields/submissions y compatibilidad Growth externo. |
| `apps/api/src/mcp/adapters/website.js` | Permisos de entrada e internos; setup con tema/publicación exige los permisos adicionales; overview no devuelve páginas/tema sin el permiso correspondiente. |
| `apps/api/src/manifests/official/feature-modules.js` | Seis permisos Website declarados con sus acciones ACL; ningún grant o sync aplicado a empresas. |
| `apps/api/src/routes/website/__tests__/security-fixtures.js`, `website-security.test.js` (nuevos) | Laboratorio sintético A/B, A1/A2, Growth externo, acceso privado, roles y regresiones de este bloque. |
| Tests existentes `public-website-capture-config.test.js`, `website-capture-settings.test.js`, `services/__tests__/forms-service.test.js`, `mcp/__tests__/website-catalog-adapters.test.js` | Fixtures y actores adaptados al contrato de seguridad; conservan las aserciones funcionales originales. No se editaron pruebas ni código de Commerce/Catálogo. |

## Contratos efectivamente afectados y compatibilidad

Antes de cambiar cada frontera se contrastó con §2 (autoridad), §10 (adapters) y §11 (Forms) del expediente. El alcance se limita a la API legacy existente; no se crearon endpoints `/website/v1`, DTO, tablas ni migraciones nuevos.

- `companyId`, permisos e identidad proceden de tenantContext y sesión. No se usan grants globales de otro tenant, body ni indicadores admin del cliente. Cada sitio administrado pertenece a la empresa activa. No hay ACL individual nueva por sitio: como establece §2, el permiso empresarial comprende los sitios propios.
- WebsiteService y FormsService requieren ahora `access` emitido por el adaptador autenticado, además del scope. Todos sus consumidores de producción identificados (REST Website, Growth Forms y MCP Website) se adaptaron. JSON con `{can: ...}` no sustituye un contexto emitido. La emisión es una frontera de servidor, no una firma para procesos externos.
- Website Forms conserva permisos históricos mediante equivalencias únicamente por acción: `forms.read/create/update/delete` acepta `pages.read/create/update/delete` respectivamente; `submissions.read/delete` acepta `pages.read/delete`. Ninguna equivalencia concede publish. Growth mantiene `growth.forms.*`; un permiso Website no administra un owner Growth y viceversa. Export/domain y grants persistidos siguen pendientes.
- Editar metadatos globales de tema/menú/sitio con una página pública exige publish adicional: el runtime actual los lee en vivo. No se simuló un borrador de tema ni una release inmutable. Guardar contenido draft continúa permitido con update; guardar SEO compartido de una página pública exige publish por su efecto vivo.
- `DELETE /website/site/:id` conserva el éxito legacy, pero archiva sin cascada. `DELETE .../submissions/:id` y borrados dist devuelven 409 `retention_required`. POST upload y sourceType dist devuelven 409 `isolation_required` aun con permiso. Son restricciones deliberadas, no capacidades implementadas; no implican adquisición de dominio ni cambio de bucket.
- IDs, company/site, versiones, renders, formularios, campos, respuestas y archivos históricos no se renumeran ni migran. Reutilizar una ruta archivada deja de reiniciar el registro. Ambigüedad del owner devuelve 409 `ambiguous_site_identifier`; referencias ajenas devuelven 404 sin revelar nombres ni payload. Lecturas legítimas no deshabilitan/reasignan filas.
- Errores de autoridad: 401 sin contexto válido, 403 sin permiso, 404 para scope/recurso ajeno; validación REST legacy 400/422; 500 genérico ante fallo de repositorio. Algunos adapters mantienen el sobre legacy `{error}` en lugar del sobre futuro v1 con `code`. Los guards de retención/aislamiento publican su code. No se cambió el contrato SDK de rutas.
- Lectura de respuestas audita actor, formulario, empresa y cantidad, sin values. Auditoría uniforme de rechazos, revisiones e idempotencia v1 completa permanecen pendientes; no se declara implementado todo §2.10.

## Pruebas ejecutadas

Resultado final conjunto: **221 tests, 221 pass, 0 fail, 0 skipped, 0 cancelled; 26 suites**. De ellos **112** corresponden a la nueva suite de seguridad y **109** a regresiones existentes seleccionadas (incluyen los ocho archivos del baseline 77 y las pruebas adicionales tenant/Catálogo/Commerce/MCP). Ejecución Node integrada por imports de fábricas y request Hono en proceso, sin API boot/dotenv, credenciales ni bases compartidas. La nueva suite bloquea fetch y el fake prohíbe deletes físicos. Storage/SMTP en las suites heredadas usan sus dobles existentes.

```powershell
node --test apps/api/src/routes/website/__tests__/website-security.test.js apps/api/src/services/__tests__/dist-upload-service.test.js apps/api/src/services/__tests__/dist-serve-service.test.js apps/api/src/services/__tests__/forms-service.test.js apps/api/src/services/__tests__/storefront-capture-service.test.js apps/api/src/routes/storefront/__tests__/storefront-capture-routes.test.js apps/api/src/routes/__tests__/public-website-capture-config.test.js apps/api/src/routes/website/__tests__/website-capture-settings.test.js packages/sdk/src/__tests__/sdk-website-domain.test.js apps/api/src/lib/__tests__/tenant-context.test.js apps/api/src/routes/catalog/__tests__/catalog-tenant.test.js apps/api/src/routes/catalog/__tests__/stock-permissions.test.js apps/api/src/routes/__tests__/commerce-sync-guard.test.js apps/api/src/routes/pos/__tests__/pos-contracts.test.js apps/api/src/mcp/__tests__/website-catalog-adapters.test.js
```

| Criterio del bloque | Evidencia ejecutada | Resultado |
|---|---|---|
| A no accede a sitios privados de B | REST real en 24 paths de lectura/escritura, snapshots y cero writes; servicio con contexto de otra empresa rechazado antes de repositorio | Correcto |
| Usuario autorizado conserva operaciones | Reads, creación de página, draft, publicación existente, sitio/tema/menú/blog/form/field y Growth externo | Correcto |
| Permisos en accesos afectados | Todos los métodos Website y Forms (ambos owners), contexto ausente/forjado/empresa distinta/sin permiso; REST sin grants; MCP directo y fuente pública; tenantContext ignora grants globales obsoletos | Correcto |
| IDs cruzados no modifican recursos ajenos | Page/theme/homepage/category/menu/pageId/parentId/field/submission/FileAsset, owner activo, lotes mixtos, render corrupto y selectores ausentes | Correcto |
| Relaciones históricas preservadas | WebsiteSite y Property distintos, ambiguo 409 sin writes, archivado conserva tablas relacionadas, rollback del archivado si audit falla, ruta archivada no se reinicia | Correcto en fixtures; no se ensayó corpus productivo |
| Errores no revelan privados | 404 sin nombres/values de B, permiso antes de consulta, actor del servidor, fallo DB sintético da 500 sin su detalle | Correcto |
| Catálogo y Commerce | catalog-tenant, stock-permissions, commerce-sync-guard, pos-contracts y asserts Catálogo del adapter compartido | Correcto en suites seleccionadas; sin cambios de esos módulos |

Calidad: ESLint sobre los 23 JS modificados/nuevos, sintaxis y `git diff --check` correctos. Privacidad global ejecutada: 6569 archivos antes de añadir esta acta; **67 hallazgos preexistentes**, por lo que el comando global no queda verde. Control individual con `inspectFile` sobre los 27 entregables de este bloque: **0 hallazgos**. No se corrigieron archivos ajenos ni se copiaron datos operativos para alterar ese resultado.

## Riesgos y límites del cierre

1. No se probaron conexiones reales, RLS, constraints, sesiones OAuth reales ni concurrencia multirréplica/PostgreSQL. El cierre acredita la política de aplicación mediante regresiones locales, no persistencia/infraestructura E2E.
2. WR-01/02/03 y serving público, hostnames, independencia de origen, release atómica/CAS, caché y aislamiento del navegador siguen abiertos en sus bloques. Impedir nuevos uploads inseguros no vuelve privados los originales ya publicados. No se declara Website APTO.
3. FormScope, backfill, default multisitio, esquema de documento/tema/blog, corpus histórico y resolución controlada de owners siguen pendientes de S2. Un owner ambiguo o huérfano queda bloqueado; no se altera su respuesta ni se inventa un vínculo.
4. Los permisos nuevos solo se declaran en código, con alias de compatibilidad. No hay grants automáticos ni sincronización contra instalaciones. Auditoría uniforme v1 de rechazos y métricas pendientes, sin contenido sensible.
5. `atlas-web-builder` permanece en 0.2.0 según manifest/lock sin cambios; 0.2.4 sigue candidata pendiente de navegador/corpus. No hubo npm update/publish, UI provisional ni trabajo de Claude.
6. No se modificó Commerce Recovery, información de empresas existentes, bases compartidas o instalaciones externas. Sin SSH/push/deploy/DNS/TLS, compras ni certificados. Este cierre no autoriza el siguiente bloque.
