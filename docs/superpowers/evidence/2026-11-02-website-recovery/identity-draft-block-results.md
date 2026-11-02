# Website Recovery — cierre S2: identidades y borradores revisionados

Fecha: 2026-11-02. Base autorizada y comprobada: `8ba6c6209760f462aaee238bd0bd88d6452e30ff`, main y árbol limpio al comenzar. Se leyeron maestro, contratos v1, plan y acta S1. Este cierre corresponde a las secciones A–E y los doce criterios de la orden S2 posterior. Los párrafos históricos de Fases 0/1/S1 no sustituyen esta autorización.

**APTO para el bloque local de identidades multisitio y borradores revisionados. S1 permanece APTO en la política administrativa probada. Website sigue NO APTO E2E. S3 no iniciado.** Commit de cierre: el que incorpora esta acta; SHA reproducible con `git log -1 --format=%H -- docs/superpowers/evidence/2026-11-02-website-recovery/identity-draft-block-results.md`.

## Causa, alcance y relación contractual

El modelo admitía varias filas WebsiteSite, pero los consumidores elegían la primera por createdAt; no había default persistido. Los borradores se sobrescribían sin revisión, el SEO era compartido con la lectura pública y las relaciones empresariales dependían de prelecturas sin constraints compuestas. Un guardado del editor podía cambiar SEO público, y un retry de creación no tenía recibo persistido.

Se aplicaron §2, §3, §5, §10 y §11 de [contratos v1](../../specs/2026-11-02-website-recovery-contracts-v1.md). Website es oficial/core, no un custom RME3: sus modelos Prisma existentes sí son la fuente adecuada. Se recuperaron servicios/rutas existentes en lugar de crear otro CMS o una API paralela. El publisher, lector público, dist/hosting, Commerce y React no se modificaron. El GET público se usa como observador en una prueba, sin alterar su implementación.

## Preflight de seguridad y PostgreSQL real

1. HEAD coincidía exactamente con el cierre S1; sin diferencias heredadas ni rama/worktree nuevos.
2. Antes de modificar persistencia se reconstruyó el esquema S1 en un contenedor PostgreSQL 18 propio, sin volúmenes compartidos y con puerto efímero ligado solo a loopback. Los seis controles dirigidos de lectura/escritura ajena, publicación sin permiso, scope empresarial y guardado legítimo pasaron usando el servicio S1 real y Prisma. No se detectó una regresión de S1.
3. En esa reconstrucción, las doce tablas Website tenían RLS deshabilitado. Las migraciones Website revisadas no acreditaban políticas que sustituyeran los checks del backend. Esto describe el esquema local reconstruido, **no una inspección de una instalación desplegada**. Las bases compartidas y external no se contactaron.
4. La fachada administrativa mantiene tenantContext/membership y permisos S1; el rol backend privilegiado debe comprobar pertenencia aun cuando pueda eludir RLS. Para las tablas expuestas por Data API, el objetivo de Fase 1 requería defensa adicional: la migración S2 activa RLS, revoca grants PUBLIC/anon/authenticated y crea una política restrictiva false para roles ordinarios. No hay una policy pública para CMS/respuestas; el acceso público legítimo sigue pasando por la API del servidor.
5. La prueba posterior incluye un grant SELECT accidental y una policy permisiva heredada: anon/authenticated siguen sin ver filas. El propietario/BYPASSRLS conserva operaciones backend, sujetas a la autorización de aplicación. No se concedieron privilegios BYPASSRLS a usuarios ni se modificaron roles reales.

Fundamento: [RLS y grants de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [locks PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html). Se consultó el changelog Supabase; no se utilizó una API externa Supabase ni se actualizó infraestructura. Se aplicaron las skills Supabase y Postgres Best Practices al revisar RLS, índices y bloqueos.

## Modelos definitivos de este bloque

| Modelo | Cambio S2 y garantía |
|---|---|
| WebsiteSite existente | Conserva id/companyId/name/domain y todos sus campos públicos. Añade `defaultForCompany`, `draftRevision` entero inicial 0 y `draftIdentity` JSON privado. PK id estable global; unique `(companyId,id)` y máximo un default activo por empresa mediante índice parcial. |
| WebsitePage existente | Añade `revision` inicial 0, `draftSeo` y `draftMetadata`. `draftBuilderData` sigue siendo el contenido editable; `publishedBuilderData`, seo/title/slug/routePath/visibility públicos permanecen separados. Se conserva unique histórico `(companyId,siteId,routePath)` y se añade unique `(companyId,id)`. |
| WebsiteBlogPost existente | Añade revision/draftSeo; el adapter save-draft puede recibir expectedRevision y utiliza el mismo CAS/recibo. No se reescribe el modelo de publicación del blog. |
| WebsiteDraftCommand nuevo | UUID generado en DB, empresa/actor/operación, hashes de clave y solicitud, resultado JSON y createdAt. Unique `(companyId,actorId,operation,keyHash)`. Incluye recurso en operation. Es un recibo privado de comandos de borrador, no una release ni un recibo de activación pública. |
| Padres históricos | Constraints compuestas empresa/sitio para page/theme/menu/category/post/render; post/category, menu/item, form/field/submission y page/version. Se añaden índices de FK. NOT VALID conserva anomalías anteriores; nuevas escrituras no pueden crear esos cruces. |

La pertenencia de sitio y de page/post se mantiene inmutable mediante triggers además de los guards S1. No se añadió unicidad por nombre: dos sitios pueden compartir etiqueta sin compartir identidad. El namespace/slug público global, reserva de hostnames y gateway son capacidades posteriores, no se simulan mediante el UUID ni una constraint local de domain. Ningún dominio/URL histórico se reasignó.

`draftIdentity` permite `{name?,siteType?,settings?,seoDefaults?,themeId?,homepagePageId?}`. Referencias y logoFileId se validan con el mismo tenant/sitio y ACL Files. `draftMetadata` permite `{title?,slug?,routePath?,visibility?}`. Ni owner, company/site, revisiones, status ni punteros públicos son propiedades libres.

## Concurrencia, retry y preservación pública

- Cada save moderno lleva expectedRevision. Dentro de una transacción se bloquea primero page/post y después su sitio, se revalida el padre activo, se compara revisión y se actualiza con predicado company/site/revision. Documento, revisión, incremento del sitio y audit se confirman juntos. Un conflicto devuelve 409 `revision_conflict` sin sobrescribir contenido; GET permite recuperar la revisión vigente.
- El orden page → site coincide con los writers SQL antiguos y su trigger de contador, evitando inversión de locks. Creación de páginas se serializa por sitio; creación de sitios por empresa. La prueba usa dos conexiones independientes, no un mock de compare-and-swap.
- Idempotency-Key de 16–200 caracteres es obligatoria en las creaciones de las rutas multisitio nuevas; opcional en guardados y adapters legacy. Misma clave/scope/body devuelve el resultado confirmado sin nuevo ID/revisión/audit; body diferente da 409 `idempotency_conflict`. La autorización se comprueba de nuevo antes de un replay. No hay purga de recibos.
- Los clientes antiguos sin expectedRevision siguen funcionando bajo lock con `concurrency: legacy_last_write_wins`; los adapters de página añaden Warning 299. **No se promete protección de edición simultánea al cliente viejo que no envía su revisión.** Una escritura del binario/SQL antiguo cambia la revisión mediante trigger y hace fallar el CAS obsoleto de un cliente nuevo. Metadata/SEO escritos por un código antiguo actualizan también su proyección editable.
- Guardar con la API de borradores escribe solo draftBuilderData/draftSeo/draftMetadata/draftIdentity, revisión y audit. No cambia publishedBuilderData, SEO/metadatos públicos, domain, estado o URL. La respuesta completa del resolver público permanece igual antes/después de guardar contenido, SEO y nueva ruta privados.
- Los documentos string JSON se parsean una sola vez y se guardan como objeto. Schema1 se valida sin descartar bloques/metadata; versión futura, ciclos, referencias repetidas, profundidad >50, más de 1000 bloques, huérfanos o documento >2 MiB se rechazan. Bloques desconocidos se conservan; el lector devuelve issue `unknown_block_type`. Un documento histórico inválido se devuelve con issues, no se limpia ni reemplaza al leer. JSON legacy opaco sin schema se conserva en el adapter antiguo, señalado como tal por el modo de compatibilidad.
- Se conservan rutas archivadas y reservas de ruta de otros borradores; una creación no reinicia una fila histórica ni ocupa una ruta ya reservada en ese sitio. El dominio o la ruta pública no se actualizan como efecto de editar un borrador.

## Contratos disponibles para Claude, REST y SDK

Son extensiones de las fachadas existentes bajo `/website`; **no equivalen todavía al SiteDTO/API v1 completo del objetivo**. El listado devuelve filas seguras del sitio con los nuevos campos, sin stripeSecretKey/turnstileSecretKey. Respuestas modernas usan `{data:...}` excepto listado de páginas que conserva `{data,total,page,pageSize}`.

| Endpoint | Permiso / entrada | Respuesta o efecto |
|---|---|---|
| GET /website/sites | site.read | Sitios activos de la empresa con id, identidad existente, draftIdentity, draftRevision y defaultForCompany; no-store. |
| POST /website/sites | site.update; createSiteSchema; Idempotency-Key requerida | 201 `{data:site}`; identidad/ID nuevos, sin plantilla/publicación/hostname automático. |
| GET /website/sites/:siteId | site.read | Sitio propio explícito, `{data:site}`; amplía la antigua respuesta de metadatos de sourceType. |
| PATCH /website/sites/:siteId | site.update; `{identity,expectedRevision}`; clave opcional | Actualiza únicamente draftIdentity, incrementa draftRevision, devuelve sitio. 409 si cambió. La variante legacy `{sourceType}` mantiene site.update + publish y los bloqueos S1. |
| GET /website/sites/:siteId/pages | pages.read | Páginas de ese sitio; incluye revision/draftMetadata. |
| POST /website/sites/:siteId/pages | pages.create; createPageSchema sin siteId; clave requerida | 201 `{data:page}`; el parent procede de la ruta, no del body. |
| GET /website/sites/:siteId/pages/:pageId/draft | pages.read | `{data:{pageId,siteId,revision,document,documentHash,metadata,seo,issues}}`; no-store. SEO/metadata son los de borrador. |
| PUT /website/sites/:siteId/pages/:pageId/draft | pages.update; `{document,seo?,metadata?,expectedRevision}`; clave opcional | `{data:{pageId,siteId,revision,document,documentHash,metadata,seo}}`; CAS obligatorio. No cambia publicación. |
| GET /website/theme?siteId=... | theme.read | Tema del sitio seleccionado, prefiriendo la referencia editable propia; sin siteId usa default persistido. No selecciona un tema de otro sitio por createdAt. |

Legacy `/website/site` sigue devolviendo el default fijado al migrar, no el sitio recién creado. Archivar ese default no selecciona otro silenciosamente: el adapter singular queda sin default activo; las rutas explícitas siguen funcionando. La elección pública/gateway no se cambia con este default administrativo.

POST `/pages/:id/draft` y `/save-draft` mantienen nombres y shapes de éxito; aceptan expectedRevision y clave opcionales. El alias exige exactamente un documento, no convierte un body vacío en reset `{}`. POST blog save-draft acepta string/objeto/revisión. PATCH de metadata/status legacy sigue sujeto a los controles publish de S1; no es el contrato moderno de borrador.

SDK Website añade `listSites`, `createSite`, `saveSiteDraft`, `listPages`, `createPage`, `getDraft` y `saveDraft`; las cuatro firmas previas y sus paths se conservan. MCP añade siteId opcional a los consumidores de sitio/página y conserva la revisión capturada en prepare para execute; ya no edita un título público como efecto lateral de guardar un draft. La consulta de detalle devuelve siteId/revision/draftMetadata; revision de aprobación incluye revisión de página. Un siteId ajeno no crea un sitio de reemplazo.

Errores: 401/403/404 S1; 409 `revision_conflict`, `idempotency_conflict` o conflicto de ruta; 400/422 validación; 500 genérico sin detalle de DB. Ante 409 el diseño debe conservar la edición local y ofrecer recargar/comparar; no reintentar con una revisión nueva automáticamente.

Claude queda habilitado **solo para estudiar estos contratos** de listado, alta sin tienda obligatoria, identidad editable, selección por sitio, páginas, estados de guardado y conflictos. No se le pidió editar archivos. Tema/menús revisionados, Forms propietario tipado persistido, releases, publicar SEO/metadata privados, ZIP, domains readiness y demás capacidades no se presentan como disponibles. El publisher legacy no consume todavía draftMetadata/draftIdentity ni promociona draftSeo: este bloque no promete ese comportamiento posterior.

## Migración, coexistencia y mitigación

Archivo: `prisma/migrations/20261102093000_website_identity_drafts/migration.sql`. Se ejecutó su SQL exacto dentro de DBs desechables. BEGIN/COMMIT incluye columnas, copia aditiva de configuración/SEO/metadata, default determinista por `(createdAt,id)`, constraints, RLS e instalación de triggers. El backfill no copia/renumera entidades, no fusiona sitios y no reescribe draftBuilderData ni publishedBuilderData. Historias con owner inválido quedan almacenadas y bloqueadas para revisión; NOT VALID no significa que estén saneadas.

La prueba de fallo sustituye temporalmente COMMIT por una división por cero, confirma que no quedó draft_revision y después aplica el archivo real limpio. No se ejecutó migrate deploy/reset, db push, bootstrap de API, sync de módulos ni SQL contra configuraciones de instalaciones existentes. El harness usa configuración Prisma temporal y la URL efímera creada por él; no lee DATABASE_URL/DIRECT_URL de la aplicación para conectarse.

Orden para una futura adopción autorizada: inventario/backup privado y verificación del rol backend → migración aditiva → código generado/servicios nuevos → consumidores CAS. El rol backend debe ser owner/BYPASSRLS con comprobaciones S1; un backend ordinario sin esa autoridad quedará bloqueado por RLS y debe tratarse como discrepancia de instalación, no otorgarle privilegios automáticamente. Antes de validar las FKs NOT VALID se debe resolver el inventario histórico. No se hizo esa operación en una base real compartida.

Mitigación de rollback: volver al binario/consumidor anterior **manteniendo columnas, tabla de recibos, revisiones, constraints y RLS**. Los campos históricos no se eliminaron y el SQL antiguo puede escribirlos; sus triggers incrementan revisiones y sincronizan la proyección. No ejecutar DROP de drafts ni restaurar un backup que borre escrituras nuevas. Los campos privados nuevos permanecen conservados aunque el binario viejo no los muestre; exportar/conciliar antes de un cutover posterior. No se habilitan policies públicas ni se reactiva upload inseguro para simular rollback.

## Pruebas y resultados

| Grupo | Resultado final |
|---|---|
| Preflight sobre código S1 antes de persistencia | Seis comprobaciones dirigidas en PostgreSQL 18 correctas; sin regresión de autoridad identificada. |
| Laboratorio PostgreSQL 17.10 | **29/29**, 0 omitidas; UUIDv7 de la función del baseline oficial, sin generarlo en JS. |
| Laboratorio PostgreSQL 18.6 | **29/29**, 0 omitidas; UUIDv7 nativo. |
| Regresiones seleccionadas de S1 + SDK | **224/224**, 0 omitidas; incluye REST, MCP, Catálogo, Commerce/POS, tenant-context, captura, Forms, resolver y dist. |

Los 29 casos son los mismos en ambos motores; no se suman como 58 funcionalidades distintas. En ambos se ejecutan transacciones reales, dos conexiones independientes, RLS/roles, FKs, reintentos y fallos de migración. Fixtures anteriores a S2 incluyen sitio con dominio/config, página publicada, borrador opaco, página huérfana, formulario/respuesta y producto Catálogo. Conservan sus IDs, valores y relaciones después de migrar.

| Criterio obligatorio | Evidencia |
|---|---|
| 1. A crea dos sitios | Identidades/configuraciones distintas, mismo path `/` permitido en sitios distintos; un default estable. |
| 2. B no accede | Servicio real y REST rechazan lectura/escritura de site/page ajenos con 404; sin permiso da 403 antes de write. |
| 3. Recursos propios por sitio | Listado pages/theme por sitio, referencias validadas, selección MCP explícita, draftIdentity independiente. |
| 4. Guardar/recuperar draft | Documento normalizado, revisión/hash, metadata/SEO privados y lectura actual. |
| 5. Edición simultánea | Dos conexiones con la misma revisión: un ganador y un 409, sin sobrescritura silenciosa moderna. |
| 6. Retry | Misma clave produce un site/page/save y un audit; cambio de body da 409. |
| 7. Históricos accesibles | Default/IDs/config y página publicados preservados; huérfano conservado y bloqueado explícitamente. |
| 8. URLs intactas | Dominio/routePath históricos iguales; respuesta del resolver público antes/después idéntica. |
| 9. Publicación no cambia al guardar | Public JSON, SEO, título/ruta/status anteriores intactos aun guardando otros privados. |
| 10. S1 sigue vigente | Guards del servicio, permisos/tenant REST/MCP, publisher y sourceType; RLS adicional comprobada. |
| 11. Catálogo y Forms | Fixtures pre-migración y operaciones posteriores conservan producto, formId/siteId/submission; suites Commerce/Catálogo verdes. |
| 12. Migración real aislada | SQL exacto en PostgreSQL 17/18, rollback de DDL inyectado, owner FK rechazando nueva anomalía, registros previos intactos. |

Reproducción desde el repo, sin URL elegida por el operador:

```powershell
node scripts/test-website-postgres.mjs --postgres17
node scripts/test-website-postgres.mjs
```

El harness crea un contenedor y una red bridge dedicados con nombre/label propios, tmpfs y puerto loopback efímero; no monta directorios, no usa Compose ni une otros contenedores a esa red; la comunicación entre contenedores está deshabilitada. Se retiran únicamente esos recursos después de verificar sus labels. Requiere Docker y las imágenes PostgreSQL disponibles, más las dependencias del repo; genera el cliente Prisma actual sin cargar el config de aplicación. También se retiró el contenedor específico usado para preflight, sin tocar stacks ajenos.

Regresiones:

```powershell
node --test apps/api/src/routes/website/__tests__/website-security.test.js apps/api/src/services/__tests__/dist-upload-service.test.js apps/api/src/services/__tests__/dist-serve-service.test.js apps/api/src/services/__tests__/forms-service.test.js apps/api/src/services/__tests__/storefront-capture-service.test.js apps/api/src/routes/storefront/__tests__/storefront-capture-routes.test.js apps/api/src/routes/__tests__/public-website-capture-config.test.js apps/api/src/routes/website/__tests__/website-capture-settings.test.js packages/sdk/src/__tests__/sdk-website-domain.test.js apps/api/src/lib/__tests__/tenant-context.test.js apps/api/src/routes/catalog/__tests__/catalog-tenant.test.js apps/api/src/routes/catalog/__tests__/stock-permissions.test.js apps/api/src/routes/__tests__/commerce-sync-guard.test.js apps/api/src/routes/pos/__tests__/pos-contracts.test.js apps/api/src/mcp/__tests__/website-catalog-adapters.test.js
```

## Archivos afectados y riesgos residuales

Persistencia: schema Prisma y la migración anterior. Lógica: nuevo `apps/api/src/services/website-draft-service.js`, política existente website-resource-policy y website-service. Adapters: Website index/pages/themes/blog/dist-routes (solo integración de la fachada de sitios, conserva los holds S1), MCP Website y SDK Website. Pruebas: nuevo website-postgres.test, harness Docker, fake S1 actualizado con revisión/incremento/actor explícito y assertions aditivas SDK. Documentos rectores actualizados únicamente con estado/handoff. No se editaron Commerce Recovery, public-website, dist parser/serve, React, manifests de dependencias ni lock.

Calidad: ESLint de los 15 JS/MJS de esta entrega y whitespace correctos. Privacidad global: 6574 archivos antes de añadir el acta, **67 hallazgos preexistentes**; el comando global falla por ellos. El control individual de los 21 entregables dio **0 hallazgos**. No se modifican archivos ajenos para ocultar ese baseline.

Límites explícitos:

- El plan original agrupaba en S2 también el mapa persistido FormScope, normalización completa de blog/temas/menús y otras adaptaciones. Esta orden concreta identidades multisitio y borradores; **no se declara cerrado WR-16 ni implementado FormScope/backfill analítico**. Las relaciones históricas y los bloqueos ambiguos de S1 se preservan. Ningún consumidor debe asumir que esos contratos futuros ya existen; el diseño liberado aquí excluye Forms y el editor de tema/menú revisionado.
- El lector/publisher público legacy sigue con los riesgos WR-01/02/03 y los demás pendientes del expediente. No hay releases, publicación atómica, rollback, retiro público verificable, gateway ni reserva global de dominios. Nuevos borradores privados no equivalen a una publicación completa funcional. El default es administrativo; no resuelve routing público multisitio ni elimina los ZIP legacy por empresa.
- No se inspeccionaron roles/policies/datos de instalaciones reales, sesiones OAuth reales, navegadores, corpus de clientes ni cargas/multirréplica. PostgreSQL normal reconstruido no reproduce toda una instalación Supabase, aunque sí ejecuta SQL, constraints, grants y RLS reales de este bloque. El despliegue exige inventario/backup/rol backend y está fuera de la autorización.
- Sigue vigente el gate S1 de ZIP y retención. No se compraron dominios, cambiaron DNS/certificados, hicieron SSH/push/deploy, ejecutaron migraciones compartidas ni actualizaron atlas-web-builder (permanece resuelto 0.2.0). No se pidió a Claude editar archivos ni se creó UI provisional. El trabajo se detiene antes de S3.
