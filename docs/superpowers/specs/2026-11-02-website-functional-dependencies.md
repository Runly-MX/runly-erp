# Website: contratos de dependencias funcionales

Fecha: 2026-11-02. Base: `website-functional-frontend`, `e8df5c181`. Extiende [los contratos de backend](2026-11-02-website-backend-contracts.md); no sustituye S1–S4. Implementación local en `website-functional-dependencies`, sin integración a main. Website completo sigue **NO APTO E2E**.

## Autoridad y navegación

El manifiesto declara explícitamente `/sites/:siteId/catalog`, `/advanced`, `/payments` y `/blog/:postId`. El resolver solo acepta patrones declarados y autorizados; no hereda una concesión del padre. Se conserva la actualización de políticas oficiales sobre manifiestos almacenados y la autorización definitiva del backend.

`GET /website/sites/:siteId/state` conserva su DTO y añade `sectionCapabilities`: mapa por `overview`, `pages`, `blog`, `catalog`, `forms`, `appearance`, `publishing`, `domains`, `import`, `settings`, `advanced`, `payments`. Cada valor es `{allowed:true}` o `{allowed:false,reason:{code,requiredPermission?}}`. Requiere pertenencia y `website.site.read`; las secciones usan los permisos efectivos existentes, incluidas sus equivalencias históricas. Catálogo requiere además `catalog.products.read`; avanzado y pagos, `website.site.update`; entrada de Blog, `website.pages.read`.

Capacidades nuevas: `catalog.read`, `catalog.select`, `settings.operational`, `payments.configure`, `templates.apply`, `templates.applyTheme`, `forms.resolveAmbiguous`. Seleccionar exige lectura de Catálogo y actualización de sitio; aplicar plantilla, crear páginas; incluir tema exige además actualizar sitio y tema. Resolver propiedad ambigua exige conjuntamente `website.forms.update` y `growth.forms.update`. No basta un permiso de uno de los propietarios. Calendar continúa no disponible. Los enlaces del workspace, también en móvil, consumen las capacidades; ocultar un enlace no concede autoridad.

## Catálogo por sitio

Catálogo conserva los productos originales y `catalog_product.published`: elegibilidad web global de la empresa. `website_catalog_product(company_id,site_id,product_id,included)` añade selección sin duplicar productos. Clave compuesta, dos FK compuestas de pertenencia, RLS y revocación de acceso directo para `anon`/`authenticated`. Solo el backend autorizado administra asociaciones. No cambia POS.

Tres conceptos distintos:

- **Elegible:** producto activo con `published=true` en la empresa.
- **Incluido:** asociación explícita, o inclusión histórica implícita cuando el sitio tiene `catalogMode=legacy_all` y no existe una excepción.
- **Visible:** elegible e incluido en un sitio publicado y disponible; un sitio administrado por releases requiere release activo. Esto permite servirlo por catálogo público, pero no promete que exista una tarjeta/enlace en una ruta concreta.

La migración marca los sitios existentes `legacy_all`, conservando su comportamiento. No inserta asociaciones ni publica productos adicionales. Nuevos sitios usan `explicit` y comienzan sin productos incluidos. Una exclusión en modo histórico es una excepción conservada. La adopción de selección explícita es un comando deliberado, nunca una migración automática. Los registros de asociación se conservan al reemplazar una selección; los no elegidos pasan a `included=false`.

Todos los endpoints administrativos requieren sesión, empresa y sitio propios. Lectura: `website.site.read` + `catalog.products.read`. Escritura: además `website.site.update`. UUID o recurso ajeno producen 404 opaco; falta de permiso, 403. No se admiten selectores de empresa por query para cambiar el ámbito autenticado.

| REST, prefijo `/website/sites/:siteId` | Entrada / salida |
|---|---|
| `GET /catalog/products` | Query `limit` 1–100, `offset`, `published` (`true`/`false`), `categoryId`, `search`. `{data:[producto + eligibleForWeb,includedInSite,publiclyVisible],meta:{catalogMode,draftRevision,nextOffset}}`. |
| `PUT /catalog/products/:productId` | `{included:boolean,expectedRevision}` + `Idempotency-Key`. `{data:{siteId,productId,includedInSite,draftRevision,operational:true}}`. |
| `PUT /catalog/selection` | `{productIds:UUID[],expectedRevision}` (únicos, máximo 1000) + clave. Sustituye el conjunto de manera atómica y establece `explicit`. `{data:{siteId,catalogMode:'explicit',selectedCount,draftRevision,operational:true}}`. Un solo producto ajeno rechaza todo. |
| `GET /catalog/products/:productId/used-by` | Requiere además `website.pages.read`. Query `limit` 1–100 y `cursor` opaco. `{data:[{source,id,title,blockId,kind,visibilityConditional}],meta:{nextCursor,consistency:'live',warnings,operationalSurfaces}}`. |

Escrituras usan bloqueo de sitio, revisión agregada, recibos y auditoría existentes. Revisiones obsoletas: 409 `revision_conflict`; conservar cuerpo y clave para reintentar una respuesta perdida. Tras conflicto real, volver a leer y obtener intención/clave nuevas. Selección es configuración operativa inmediata: no crea un release ni modifica snapshots. Cambia la revisión para impedir activar una preparación obsoleta; por sí sola no implica contenido pendiente según C-2.

`usedBy` enumera todas las páginas y entradas habilitadas en lotes internos de 100, el release activo y superficies históricas publicadas sin release administrado. Busca tarjetas por ID o slug y grids compatibles por categoría. Los grids tienen `visibilityConditional=true`: límite/orden/disponibilidad pueden excluir al producto. Incluye superficies operativas `public_catalog` y `legacy_checkout` cuando corresponde. Devuelve advertencias `historical_document_unreadable` para documentos históricos opacos, sin repararlos ni omitir silenciosamente su incertidumbre. Máximo 100 advertencias por respuesta. Continuar hasta `nextCursor=null`; no depende de las primeras 50 páginas del frontend. La consistencia es viva, no un snapshot de lectura entre peticiones. Escanea el sitio completo por petición; en sitios muy grandes queda un riesgo de coste que requerirá medir antes de introducir un índice de referencias.

Catálogo público: `X-Runly-Website-Site` es el selector tipado, junto a `X-Runly-Company`. Un host público de Website, o un Origin con dominio asignado cuando se llama a la API central, fija sitio y empresa; el selector no puede sobreescribirlo. Productos, detalle y categorías aplican elegibilidad e inclusión. Un consumidor histórico de API central que solo informa empresa mantiene la elegibilidad global; ese resultado no equivale a visibilidad dentro de un Website. El cliente de bloques y el SDK actualizado envían el selector tipado. `websiteSiteId` debe ser explícito en `createRunlyERP`; no se infiere del ambiguo `siteId` histórico. El checkout existente usa la misma selección, sin añadir pagos ni modificar Commerce.

SDK `client.website`: `listSiteCatalogProducts(siteId,options,token)`, `setSiteCatalogProduct(siteId,productId,data,key,token)`, `setSiteCatalogSelection(siteId,data,key,token)`, `getCatalogProductUsage(siteId,productId,options,token)`.

## Plantillas atómicas multisitio

`POST /website/sites/:siteId/templates/:templateId/apply`, cuerpo `{pageIds:string[],expectedRevision,includeTheme?:boolean}`, `Idempotency-Key` (16–200 caracteres). IDs de página son claves del catálogo de plantillas existente, no UUID de recursos. De 1 a 100 páginas distintas. `includeTheme=false` por defecto. SDK: `applySiteTemplate(siteId,templateId,data,key,token)`.

Respuesta `{data:{siteId,pages:[{id,title,routePath}],firstPageId,draftRevision,publicReleaseUnchanged:true}}`. Transacción única con bloqueo, recibo y CAS; páginas nuevas en borrador y tema nuevo opcional. Reutiliza el registro y blueprints existentes, normalización del builder y servicio de borradores. No sobreescribe páginas ni cambia sitio predeterminado, contenido público, formularios o releases. Una ruta ya reservada por página existente, archivada o borrador devuelve 409 `route_conflict` y no crea nada. Revisar selección o resolver el conflicto deliberadamente; no reintentar con sobrescritura implícita. Error intermedio revierte páginas, revisión y recibo; la misma clave puede recuperarse tras fallo no confirmado.

La API depende directamente del mismo builder **0.2.4 ya fijado**, sin actualización. La imagen API incluye únicamente los dos directorios de blueprints JavaScript existentes necesarios para importar el registro. No introduce otro motor o catálogo.

## Retirada explícita de entradas

Los contratos existentes de preflight (solo lectura), preparación y activación añaden `changes.unpublishPostIds:UUID[]` (máximo 100). `publishPageIds:[]` sigue siendo obligatorio; una retirada de Blog por sí sola es válida. Publicar y retirar el mismo ID produce 422 `scope_conflict`. IDs ajenos o fuera del sitio/base autorizado se rechazan.

No seleccionar una entrada conserva su snapshot anterior. Retirarla elimina esa ruta del nuevo manifest, preserva borrador y releases anteriores. La composición no vuelve a añadir entradas retiradas por su estado histórico. Activación/rollback siguen usando CAS y recibos existentes; rollback puede recuperar la entrada desde un release anterior. No purga recursos ni respuestas. Campo ausente y array vacío se canonizan como el contrato anterior, conservando hashes de recibos previos. La hoja existente conecta preflight, selección y retirada explícita, sin rediseño.

## Configuración pública, operativa y secretos

| Clase | Datos / comportamiento definitivo |
|---|---|
| A: versionado | Páginas, Blog, SEO, identidad pública (nombre/tipo/settings públicos), tema y menús. En sitios con releases administrados, el PATCH histórico de identidad actualiza `draftIdentity`; no reescribe el sitio público. Publicar conserva whitelist y validación de recursos. |
| B: operativo vivo | `analyticsMode`, Turnstile y sus políticas; selección de productos y elegibilidad global; configuración del checkout Stripe existente y su mensaje; SMTP por empresa. No requiere republicación. Gateway, formularios y captura/configuración Storefront consultan el propietario Website vigente. Cambiarlo no modifica los bytes ni hashes de releases anteriores. |
| C: privado | Stripe secret, Turnstile secret y contraseña SMTP cifrados mediante el mecanismo existente. No forman parte de snapshots públicos, DTO de lectura ni auditorías de valores privados. Se exponen únicamente indicadores de configuración donde corresponde; errores de proveedor se saneán. El cifrado necesita `JWT_SECRET` configurado conforme al contrato existente. |

Los nuevos manifests no congelan analítica ni clave pública Turnstile dentro de `identity`. Campos operativos que existan en snapshots anteriores permanecen intactos pero no gobiernan el runtime actual ni la comparación de C-2. La API pública puede exponer claves expresamente públicas, nunca sus secretos asociados. Sitios históricos sin gestión de releases mantienen el comportamiento seguro anterior; no se fuerzan conversiones ni publicaciones.

## Integración mínima y trabajo restante

Se modificaron hooks/adaptador Website, workspace, Catálogo, selector/preview de plantillas, hoja de publicación y confirmación FormScope únicamente para consumir estos contratos. Sin nuevo diseño ni cambios en documentos de Claude. Catálogo ahora consulta el servidor para referencias; la selección explícita completa está disponible en REST/SDK para que Claude decida su presentación. La tabla conserva paginación y búsqueda local del lote cargado, con navegación a lotes del servidor. El frontend debe mostrar claramente elegibilidad, inclusión y visibilidad y respetar advertencias históricas.

Los cinco contratos quedan disponibles. Calendar, dominios personalizados y nuevas funciones de pagos siguen fuera del alcance. Faltan la última integración del frontend y su validación integral antes de declarar Website APTO E2E. No se autorizó ejecutar ninguna de ellas en este cierre.
