# Website Recovery — cierre S3: releases, publicación y gateway

Fecha: 2026-11-02. Base autorizada y comprobada: `532f9351e7f6fc3960be8baa58d1aeede065e71e`, main y árbol limpio al comenzar. Se consultaron maestro, contratos v1, plan y actas S1/S2 antes de modificar sus contratos. **S3 APTO en laboratorio local para el alcance descrito. S1 y S2 conservan sus garantías probadas. Website completo sigue NO APTO E2E. S4 no iniciado.** El commit que incorpora esta acta es el cierre; SHA reproducible con `git log -1 --format=%H -- docs/superpowers/evidence/2026-11-02-website-recovery/publication-block-results.md`.

## Defectos y cambios

| Defecto / causa raíz | Corrección y archivos principales |
|---|---|
| WR-03: el publisher antiguo ignoraba el documento enviado y escribía página/version/audit por separado | `website-release-service.js`, `website-service.js`, `pages-routes.js`, `blog-routes.js`: guardado CAS del payload, preparación privada, activación transaccional común. |
| WR-01: lifecycle/source no retiraban consistentemente el contenido servido | `website-gateway-service.js`, `public-website.js`, `dist-serve-service.js`: el puntero, estado, fuente, habilitación y pertenencia se comprueban en cada lectura. Unpublish es un comando atómico. |
| WR-02: hostname desconocido podía terminar en la empresa principal | Registro único `website_domain`, parser estricto, binding explícito y rechazo 404 sin fallback. Las cabeceras forwarded no conceden confianza. |
| Publicación mutable: cambios de SEO, tema, menús o borradores afectaban la lectura pública | Snapshot sellado de documento, SEO, identidad pública, tema, menús, recursos y runtime. Lectura gestionada exclusivamente desde el manifiesto activo. |
| Estado concurrente y retry sin recibo de activación | CAS de revisión agregada y publicación, locks ordenados, recibo persistido y evento/outbox/audit en la misma transacción. |

Servicios nuevos bajo `apps/api/src/services/`: `website-release-service.js`, `website-release-storage.js`, `website-publication-context.js`, `website-gateway-service.js`, `website-origin-guard.js`. Rutas nuevas: `routes/website/releases-routes.js` y `public-release-routes.js`. Se integran en los routers existentes y MCP/SDK; no se crea otro CMS ni `/website/v1` paralelo. La política de recursos bloquea mutaciones legacy ambiguas del estado público con 409 en sitios gestionados; los cambios de metadata/tema permanecen privados hasta publicar.

## Persistencia, integridad y concurrencia

La migración aditiva `20261102110000_website_releases` añade WebsiteRelease, WebsitePublicationEvent, WebsitePublicationOutbox y WebsiteDomain; WebsiteSite incorpora `activeReleaseId`, `lastPublishedReleaseId`, `publicationRevision`, `lifecycle` y `releaseManaged`. Hay claves compuestas empresa/sitio/release, UUID generados por PostgreSQL, índices y RLS backend-only para las cuatro tablas nuevas. No se borra ni renumera contenido, respuesta, archivo o relación histórica. Website es core oficial con modelos Prisma existentes.

La preparación captura con Repeatable Read el borrador agregado y su base. Persiste un recibo privado para que un retry no seleccione contenido nuevo. Valida rutas, bloques/propiedades conocidas, referencias propias, menús y límites antes de marcar `ready`. Hash del manifiesto, hashes de documentos y hashes/tamaños de bytes permiten verificar integridad. Un trigger impide UPDATE/DELETE de releases listos; solo permite revocación sin alterar el resto de sus campos. Historial y propietarios de hostnames tampoco son reasignables.

Activar comprueba permisos, revisión del borrador, revisión de publicación, base y hash. Antes de abrir la transacción verifica los objetos privados. Bloquea páginas/posts y después sitio, compatible con el orden S2; dentro confirma puntero, lifecycle, proyecciones legacy, versiones, evento, outbox, audit y recibo. **No hay Storage/red dentro de esos locks.** El perdedor concurrente recibe 409; los fallos de preparación o antes del commit conservan la publicación anterior. El replay devuelve el resultado original y `current` para identificar una activación posteriormente reemplazada, sin reactivarla. Un intento fallido conserva su resultado; corregir contenido requiere otro intento/clave.

Rollback solo admite un release propio, íntegro, listo y previamente publicado. Cambia el puntero y conserva el borrador actual. Unpublish retira el puntero; mantiene releases, objetos e historial. Las proyecciones `status` de páginas/posts retirados pasan a draft sin borrar `publishedBuilderData` ni modificar la revisión del documento editable.

Storage exige un bucket **privado** `runly-website-releases`; no lo crea ni cambia su política. Escritura create-only, deduplicación por SHA-256 y comprobación de lectura. Los recursos raster propios usan `file:<FileAssetId>`, ACL Files, checksum/revisión y copia verificada; no se publica SVG/HTML activo. Los assets del runtime se comparten físicamente por hash. No se devuelven objectKeys ni URLs Storage firmadas al lector público. Los assets anteriores solo se sirven si pertenecen a un release publicado del mismo sitio y el sitio sigue público. Un candidato privado no da acceso público a sus bytes.

Fundamento consultado: [Storage upload](https://supabase.com/docs/reference/javascript/storage-from-upload), [getBucket](https://supabase.com/docs/reference/javascript/storage-getbucket). El adaptador Supabase se prueba con dobles de su contrato y errores; los tests de publicación usan archivos temporales reales. **No se acreditó un bucket Supabase desplegado ni se contactó uno compartido.**

## Gateway, runtime y caché

El dominio registrado resuelve sitio → empresa habilitada → release activo propio. Parser ASCII estricto; rechaza hostnames malformados/desconocidos, no confía en X-Forwarded-Host y no usa primary/default como autoridad pública. Los nombres tienen PK global en esta instalación, reservas y tombstones sin reasignación. El namespace es configurable: `.test` permite laboratorio; dominios reales quedan `pending`, `ready:false`. La unicidad entre instalaciones, DNS/TLS y acreditación operativa no se simulan como resueltos.

`website-origin-guard.js` impide usar el hostname público para rutas privadas/admin aunque se envíe bearer. `infra/nginx/spa.conf` añade gate administrativo para ERP/fallback y sirve la publicación mediante `/public/site/*`; los hosts desconocidos no reciben la SPA ERP. La entrada técnica `apps/desktop/src/website/public-release-entry.jsx` reutiliza el renderer actual sin AuthProvider, shell ni editor. `scripts/build-website-public-runtime.mjs` genera JS/CSS de confianza con hashes, comprueba dependencias y exige atlas-web-builder **0.2.0 instalado**. El Dockerfile prepara ese artefacto en una etapa separada. No se implementó diseño, interfaz administrativa o actualización del paquete. No se ejecutó un build de imagen ni se certificó navegador/E2E.

HTML, JSON y assets servidos usan `no-store`; el gateway relee el puntero desde PostgreSQL en cada petición y verifica el manifiesto, sin caché local de autoridad. Si cambia la publicación entre HTML y JSON, la entrada pública recarga para evitar mezclar releases. Dos instancias del servicio observan rollback/unpublish sin invalidación en memoria. El outbox registra la revisión en la misma transacción: una futura integración CDN podrá consumir eventos, purgar alias/HTML y conservar blobs por hash con clave empresa/sitio/release. **No hay worker ni automatización CDN nueva.**

## Compatibilidad y discrepancias explícitas

- La migración registra alias históricos normalizados, incluidos www y URLs antiguas, sin elegir otra empresa. Duplicados quedan en cuarentena sin propietario; entradas inválidas o ambiguas requieren resolución controlada. No hay reasignación silenciosa. Los sitios no gestionados siguen en modo `legacy-reference`: no se les atribuye integridad retroactiva. La primera preparación válida conserva páginas públicas previamente publicadas no seleccionadas y crea el primer snapshot; páginas privadas quedan fuera.
- Las firmas REST/MCP/SDK históricas se conservan. Publicar por ellas invoca el mismo servicio; un payload enviado se guarda bajo CAS y no se ignora. Clientes sin revisión mantienen la limitación legacy de S2. En sitios gestionados, cambios directos de status/origen ambiguos dan `publication_requires_explicit_action`; `sourceType:none` se adapta al comando unpublish. MCP setup tampoco puede saltar el diario de publicación.
- Los datos y binarios ZIP históricos se conservan, pero su ejecución pública devuelve `isolation_required` 409. Se elimina el fallback que exponía ejecutables bajo el origen ERP. El importador y aislamiento definitivo siguen siendo S4.
- La preparación rechaza bloques desconocidos, propiedades no soportadas, documentos inválidos, media mutable externa y CSS con recursos sin pinning; conserva el borrador y la publicación anterior. No promete publicar cualquier corpus histórico. La primera publicación exige snapshot de tema/menús; para publicar solo un cambio de tema se selecciona también una página.
- FormScope Website/Growth no quedó resuelto en S2. Un `formId` configurado falla cerrado con `form_scope_unresolved` 422; Calendar configurado con `dynamic_binding_unavailable` 422. No se reasignan IDs ni respuestas. Catálogo conserva consultas públicas dinámicas de productos publicados propios; precios/stock no se congelan ni se modifican en Commerce. Estas capacidades dinámicas no equivalen a una captura/checkout E2E certificado.
- No se implementan aquí el SiteDTO objetivo completo, CAS individual de tema/menús pendiente de S2, CDN, custom domains reales ni backfill global. La revisión agregada sí cambia con escrituras legacy de tema/menú/metadata para invalidar publicaciones CAS obsoletas.

## Contratos disponibles para Claude

Además de listado de sitios y borradores S2, quedan disponibles en las fachadas actuales:

| Operación | Contrato efectivo |
|---|---|
| Historial/detalle | GET `/website/sites/:siteId/releases?limit=25&cursor=...`, GET `.../releases/:releaseId`; `{data,meta:{nextCursor}}` en listado, máximo 100. Permiso `website.pages.read`. |
| Preparar | POST `.../releases`; `{kind:'builder',baseReleaseId,expectedDraftRevision,expectedPublicationRevision,changes:{publishPageIds,publishPostIds?,unpublishPageIds?,includeThemeAndMenus?}}`; `Idempotency-Key` 16–200, respuesta 202 `{data:release}`. `website.pages.publish` y `website.site.read`. |
| Activar | POST `.../publication/activate`; `{releaseId,manifestHash,expectedDraftRevision,expectedPublicationRevision}` + clave. `website.pages.publish`; cambio de fuente exige además `website.site.update`. |
| Rollback/retirada | POST `.../publication/rollback` con `{releaseId,expectedPublicationRevision}`, POST `.../publication/unpublish` con `{expectedPublicationRevision}`, ambas con clave y permiso publicar. Devuelven puntero/revisión/lifecycle y `current`. |
| Hostnames | GET `.../domains`, POST `.../domains` con `{slug}`; lectura `website.site.read`, reserva `website.domains.manage` + `website.site.update`. La repetición del mismo propietario conserva el binding. Infraestructura pendiente se muestra como tal. |
| Público | GET `/public/website/resolve?path=/...`: `integrityMode`, release/revisión, página/tema/menús y referencias públicas del snapshot. HTML mediante gateway; bytes bajo `/public/website/releases/:releaseId/assets/:hash`. Sin credenciales ERP. |

SDK añade `listReleases`, `getRelease`, `prepareRelease`, `activateRelease`, `rollbackRelease`, `unpublishSite`, `reserveHostname`, `listDomains`. MCP añade query `website_releases` y acciones sensibles `website.publication.rollback/unpublish`; publish histórico sigue siendo acción revisable. La política backend revalida todos los permisos, también en replay. Errores relevantes: 403 permiso, 404 recurso opaco, 409 `draft_changed/publication_conflict/idempotency_conflict/hostname_taken/publication_requires_explicit_action`, 422 validación/binding, 503 dependencia/integridad. JSON inválido en los comandos nuevos da 400. Claude todavía no modifica archivos.

## Evidencia ejecutada y reproducción

`node scripts/test-website-postgres.mjs` y `node scripts/test-website-postgres.mjs --postgres17`: **61/61 por versión**, 29 regresiones S2 + 32 casos S3. PostgreSQL real desechable, dos conexiones, disco temporal y servidor HTTP real en loopback con Host explícito, sin DNS. El runner usa imágenes locales sin pull, bridge propio con comunicación entre contenedores deshabilitada, tmpfs y puerto efímero loopback; verifica el contenedor por nombre/label antes de limpieza. Reconstruye S1, siembra históricos antes de S2/S3 e inyecta fallo en la migración S3 para demostrar rollback de tablas/funciones. No usa DATABASE_URL externo ni arranca la API principal, Compose o workers.

| Criterios de la orden S3 | Evidencia |
|---|---|
| 1–5: inicial, borrador privado, segunda, preservación, rollback | Manifiesto/bytes anteriores conservados; tema/SEO/draft no cambian release; rollback mantiene draft actual. |
| 6–8: concurrencia, fallos, idempotencia | Dos activadores y dos preparadores, ganador único, fallo de preparación y antes de commit, replay después de otra activación/rollback y retiro. |
| 9–12: hostname, desconocido, aislamiento, históricos | Host real por HTTP sin DNS; forwarded no confiable; nombres reservados/pending; tenant ajeno; alias histórico y duplicados en cuarentena. |
| 13: integridad | SQL rechaza mutación, corrupción de bytes falla, PNG propio pinneado resiste cambio del original, candidatos privados y referencias cruzadas denegados. |
| 14: REST/MCP/SDK | Prepare/activate, payload legacy nuevo, historial/detalle/domains, rollback/unpublish; MCP publish/historial/rollback/unpublish pasan por el núcleo común. |
| 15–16: regresiones y PostgreSQL | S1/S2 preservados; 234/234 tests seleccionados de seguridad, Files/Forms/capture, tenant, Catálogo, stock, Commerce guard, POS y adapters; no se modifica Commerce Recovery. |

Los 234 tests se reproducen con los mismos quince archivos seleccionados del acta S2 más `apps/api/src/services/__tests__/website-release-contracts.test.js` (10 nuevos de autoridad, rutas y Storage). En tests existentes se sustituyeron expectativas del fallback inseguro por rechazo explícito y se registró el hostname del fixture; no se eliminan aserciones de aislamiento/publicación legítima. Fixtures de publish usan un documento schema1 real.

Verificaciones adicionales: ESLint de los 30 JS/MJS/JSX modificados, React Doctor 100/100 sobre la entrada pública cambiada, build real del runtime durante cada matriz y `nginx -t` en contenedor propio sin red: satisfactorios. `pnpm check:privacy` se ejecutó: falla por **67 hallazgos preexistentes**, conservados fuera de alcance; inspección individual de los archivos del bloque sin nuevos hallazgos. No se atribuye un pase global de privacidad al repositorio.

## Riesgos y cierre

APTO se limita a publicación/gateway locales de documentos soportados y recursos verificables. Pendientes: navegador/corpus histórico, buckets/operación de runtime instalados, resolución humana de hostnames ambiguos, FormScope/captura, Calendar, ZIP/origen registrable independiente, CDN, dominios/DNS/TLS y despliegue autorizado. Una instalación antigua debe aplicar primero migraciones y disponer del artefacto/bucket privado antes de habilitar estas rutas; la ausencia falla cerrada. No hay downgrade destructivo: conservar tablas/objetos y volver al release anterior mediante el comando probado.

No se hizo SSH, push, despliegue, compra/DNS/TLS, modificación productiva o de external compartido. No se actualizó atlas-web-builder, no se tocó Commerce Recovery, no se diseñó interfaz ni se inició S4.
