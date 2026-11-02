# Runly Website Recovery — expediente técnico de Fases 0 y 1

Fecha: 2026-11-02. **Fase 1 documental e investigación terminadas para revisión; NO APTO como recuperación funcional/E2E.** No se inició Fase 2 ni se implementaron correcciones. Base de esta fase: `2d4efd6a9c5aebafe96124bf4ddb821810d061aa`; código auditado `5a716b43ac940a62172b96b67a369940e10fb26a`.

Los apartados 0–11 conservan el expediente de Fase 0 (incluidas decisiones entonces pendientes). El avance y aclaraciones de Fase 1 están en §12–16. La especificación de objetivo vigente es [Contratos v1](2026-11-02-website-recovery-contracts-v1.md); sus rutas/modelos son **propuestos, no implementados**. El plan actualizado reemplaza el calendario preliminar por una secuencia cerrable de implementación, siempre posterior a revisión.

## 0. Baseline, insumos y límites

- ERP auditado: `main`, `5a716b43ac940a62172b96b67a369940e10fb26a`; árbol limpio al comenzar, un checkout, sin worktrees adicionales.
- Commerce: los commits `15a42bd4920baf58062a75300d69ee904f0bd334` y `919a50cff` existen localmente y son ancestros de HEAD. Se consultó el contrato; no se cambió Commerce, Catálogo ni POS.
- Builder externo: `main`, `424de9f169690399947142b749efa0aadfd9d51f`, sin cambios de archivos al comenzar; rama tres commits delante de su referencia local `origin/main`. No se hizo fetch/pull.
- Los insumos entregados eran **cuatro archivos Markdown: dos documentos y dos duplicados byte a byte**, no skills instalables. No había `SKILL.md`, archivos comprimidos ni instrucciones adicionales de skills. Las copias canónicas se trasladaron a las rutas de este expediente y el plan; los originales preliminares se conservaron en `docs/private/website-recovery-inputs/`, ignorado por Git. La carpeta de entrega quedó sin archivos; no se borraron directorios recursivamente.
- SHA-256 de los originales: maestro `F6D202862C1978BF19AA1C738E02CB4A56C0A5FF9C57534232601F01BB6F7017`; plan `EFBAAD4FCC3892C04FF65207D34D4A58F739D4C5214A67095EB92C3AAFF2C1BA`.
- Se aplicaron AGENTS.md, referencias RME3, privacidad del repositorio y skill Supabase para Storage/sesiones. Website es un **módulo oficial integrado**, no una carpeta custom RME3: sus tablas Prisma sí existen. No extrapolar la prohibición de accessors de tablas custom a estos modelos históricos.
- Descubrimiento mediante grafo MCP y contraste con archivos actuales. Se refrescó el índice; los números de línea citados corresponden al archivo en disco, no a snippets cacheados del grafo.
- No se arrancó API/worker/Compose, no se cargaron `.env`, no se consultaron registros reales ni se ejecutaron migraciones. El arranque de API tiene efectos sobre Storage (`apps/api/src/index.js:715`, `:867`); un GET tampoco garantiza ausencia de escrituras por el espejo Growth descrito abajo.
- Excepciones de lectura necesarias a la restricción de trabajo local: el usuario pidió consultar el paquete externo; se leyó su checkout y metadata pública npm, y se verificó documentación oficial de TLS/Storage. No se contactó infraestructura de clientes.

**Grados:** `CONFIRMADO-CÓDIGO`, `CONFIRMADO-PRUEBA` (dobles locales, no producción), `RIESGO`, `PROPUESTA`, `PENDIENTE`. Ausencia de prueba no significa ausencia de función. Un probe que pasa **reproduce el comportamiento actual, incluso un defecto**; no certifica aceptación.

## 1. Inventario y flujo real

| Superficie | Fuente auditada | Contrato observado |
|---|---|---|
| Registro/ACL | `apps/api/src/manifests/official/feature-modules.js:291` | `runly.website` v0.3.0, WEBSITE, core; dependencia declarada `runly.core`; permisos `website.access`, `site.read/update`, `pages.read/create/update/publish/delete`, `theme.read/update`, `menus.read/update`, `dist.upload`. Resumen todavía dice Puck; implementación activa usa atlas-web-builder. |
| Administración | `apps/desktop/src/modules/runly.website/screens/` | Wizard, overview, páginas/editor, blog/editor, temas, plantillas/preview, menús, formularios, pagos y settings. Rutas `/app/m/runly.website/...`; no se implementaron pantallas. |
| API protegida | `apps/api/src/routes/website/index.js:15`, `apps/api/src/index.js:2515` | Sitio singular, páginas, temas, menús, blog, forms, SMTP y dist. Middleware central de autenticación y permisos; companyId del contexto, no del body. Las excepciones de validación se detallan en hallazgos. |
| Servicio CMS | `apps/api/src/routes/website/website-service.js:7` | Inyección de Prisma. Lectura del primer sitio activo por empresa; CRUD y borradores/versiones. Sin servicio de releases atómicos. |
| Persistencia | `prisma/schema.prisma:1343` | `WebsiteSite`, `WebsitePage`, `WebsitePageVersion`, `WebsiteTheme`, `WebsiteMenu`, `WebsiteMenuItem`, `WebsitePublishedRender`, `WebsiteBlogCategory`, `WebsiteBlogPost`, `WebsiteForm`, `WebsiteFormField`, `WebsiteFormSubmission`. Históricos en migrations de mayo/junio; no se aplicaron. |
| Runtime builder | `apps/desktop/src/website/WebsitePageRenderer.jsx:1`, `apps/desktop/src/shell/PublicWebsiteEntry.jsx:728` | Renderer React cliente; registro de bloques base y Runly; configuración pública y barra de editor; preview local del borrador. |
| Resolución pública | `apps/api/src/routes/public-website.js:9` | `/public/website/resolve?path=...`: dominio/empresa → sitio → página publicada, pública y habilitada → tema por themeId → menús del sitio. No lee `WebsitePublishedRender.html`. |
| ZIP | `apps/api/src/routes/website/dist-routes.js:7`, `apps/api/src/services/dist-upload-service.js:32` | `/website/sites/:siteId/dist/upload`, listado/eliminación de builds y cambio `sourceType`; almacenamiento directo en bucket público. |
| Hosting | `apps/api/src/services/dist-serve-service.js:247`, `infra/nginx/spa.conf:1` | Nginx sirve ERP en `/app/`, proxy de `/` a `/public/site...`; API descarga/reformula HTML y redirige assets a Storage. En builder devuelve 404 para fallback SPA. |
| Catálogo | `apps/api/src/routes/catalog/catalog-public-service.js:6` | API pública de solo lectura de producto/categoría, visibilidad `published`; distinta del contrato POS. |
| Captura/Growth | `apps/api/src/services/forms-service.js:13`, `apps/api/src/services/storefront-capture-service.js:74`, `apps/api/src/routes/growth/growth-property-service.js:12` | Definiciones Website; captura v1 compartida con Growth, leads/actividad, notificación. Existe incompatibilidad de identificadores, WR-16. |
| SDK/MCP | `packages/sdk/src/domains/website.js`, `apps/api/src/public/runly-sdk.js:744`, `apps/api/src/mcp/adapters/website.js:34` | SDK administrativo, IIFE público con renderForm/analytics y aliases históricos; MCP setup/draft/publish con prepare/revision. Mantener estos consumidores en futuros cambios. |

```text
Wizard/editor -> /website/site, /website/pages/:id/draft
             -> createWebsiteService -> WebsiteSite / WebsitePage
Publicar     -> /website/pages/:id/publish -> version + publishedBuilderData
Visitante    -> Nginx -> distServeService
                builder -> fallback React -> /public/website/resolve -> AtlasWebRenderer
                dist    -> bucket runly-website/dist/<companySlug>/ -> HTML + SDK
Form público -> storefront v1 -> capture service -> GrowthProperty + WebsiteForm
             -> transacción submission/lead/activity -> notificación best effort
```

**Modelos/constraints:** Page único por `(companyId, siteId, routePath)`; render único por `(siteId,path)`; submission único por `(formId,idempotencyKey)`. `WebsiteSite.domain` no tiene unique ni estados de verificación/TLS; no hay slug público por sitio. VersionNumber no tiene unique en el modelo. Numerosas referencias siteId/companyId son escalares sin relación compuesta; no asumir integridad multitenant automática. Confirmación final de constraints/RLS del motor desplegado pendiente: no se inspeccionó una DB.

## 2. Matriz de los 15 recorridos

`PARCIAL` significa cadena de código localizada o unidad aislada probada; **ninguna fila representa un E2E de navegador completo**. Precondición administrativa: sesión, empresa y permisos indicados por routers. Pruebas UI/DB bloqueadas por no disponer de un stack desechable explícitamente configurado, sin usar entornos existentes.

| # | Recorrido | Estado | Evidencia / límite |
|---|---|---|---|
| 1 | Crear sitio | PARCIAL | POST `/website/site`, `website.site.update`, `createSite:34`; crea draft sin tienda obligatoria. Repetir puede crear varios; GET selecciona el más antiguo. |
| 2 | Setup | PARCIAL | `WebsiteWizard.jsx:81`: varias peticiones consecutivas, sin transacción/reanudación; puede dejar alta parcial. |
| 3 | Tipo/plantilla | PARCIAL | Wizard usa tipos website/ecommerce/blog/landing; crea páginas elegidas y guarda serialización en `/draft`. ZIP bifurca después de nombre/dominio. |
| 4 | Editar páginas | PARCIAL | Editor externo + bloques locales; editor standalone redirige al path público con `?edit=1`; fixture histórica real pendiente. |
| 5 | Guardar | PARCIAL | Alias `/pages/:id/draft` admite string/objeto; `/save-draft` tiene otro contrato (WR-11); no control optimista; UI usa `.mutate`, no espera persistencia dentro del callback. |
| 6 | Previsualizar | PARCIAL | Builder tiene preview del estado local y barra pública muestra borrador al editor; no hay release de preview aislado/tokenizado equivalente para ZIP. |
| 7 | Publicar | FALLA en unidad | WR-03: enviar contenido nuevo a publish publica el borrador anterior. Version/create + update + upsert + audit son operaciones separadas. |
| 8 | Republicar | PARCIAL | Misma operación; nuevo snapshot. Carreras, fallo intermedio y rollback integrado pendientes; ZIP tiene reemplazo parcial WR-07. |
| 9 | Despublicar | PARCIAL | `PublicWebsiteEntry.jsx:831` cambia página a draft; query pública sí filtra página. Cambiar status del sitio no bloquea contenido (WR-01). `sourceType:none` ofrece otro control, distinto de status. |
| 10 | Asociar productos | PARCIAL | Bloques ProductCard/ProductsGrid consultan Catálogo público con header de empresa; no copian el maestro. Validación SQL y tests de tenant; navegador/cache pendientes. |
| 11 | Crear formulario | PARCIAL | `forms-routes.js:25`, `forms-service.js:50`; nombre, campos, semántica, responsable y antispam. Falta validación site↔company en creación (WR-05). |
| 12 | Enviar/leer respuesta | FALLA para IDs distintos | Captura, idempotencia y transacción pasan unidades; WR-16 reproduce 404 de formulario válido con GrowthProperty.id distinto. Listado administrativo filtra companyId/formId. |
| 13 | Cargar ZIP | PARCIAL | 100 MiB comprimidos, index raíz/un wrapper, JSZip; fixtures aisladas aceptadas. WR-08/09; no build/SSR. |
| 14 | Publicar ZIP | FALLA en integridad | Upload escribe ya en ubicación pública; no staging ni promoción. Dos sitios colisionan y un fallo deja mezcla (WR-06/07). E2E de rutas/frameworks pendiente. |
| 15 | Administrar sitios/dominios | PARCIAL | Tabla soporta múltiples filas, UX/GET operan primer sitio. Dominio es string libre; resolver exacto normalizado con fallback, sin verificación/unique/TLS. |

## 3. Diagnóstico de atlas-web-builder y actualización npm

**Conservar por defecto; no hay evidencia para una sustitución completa.**

| Fuente | Versión / revisión | Qué demuestra |
|---|---|---|
| `apps/desktop/package.json:40` | `@raulbellosom/atlas-web-builder: ^0.2.0` | Rango declarado; no significa que se use latest. |
| `pnpm-lock.yaml:308`, `:2959` e instalación local | **0.2.0** | Dependencia realmente resuelta. Carga CommonJS y round-trip mínimo comprobados; serializePage devuelve string y parsePage lo reabre. |
| Metadata npm consultada el 2026-11-02 | **latest 0.2.4**, gitHead `598795cd135620baa546cac1459a983ad633e065` | Versión pública disponible. Consulta `npm view @raulbellosom/atlas-web-builder version dist-tags time.modified --json` y `npm view @raulbellosom/atlas-web-builder@0.2.4 gitHead dist.integrity exports --json`. |
| Checkout externo | **0.2.4**, HEAD `424de9f169690399947142b749efa0aadfd9d51f` | Dos commits posteriores al gitHead npm: CTA secundario legible y centrado vertical del hero. No vienen garantizados por instalar npm 0.2.4. |
| Suite del checkout externo | **20 archivos / 114 pruebas correctas** | Persistencia, renderer, bloques, árbol/store, assets, recursos, temas, sanitización rich text, responsive y edición. Prueba código local, no certifica el tarball publicado ni su integración ERP. |

Paquete exporta editor/provider/renderer, baseBlocks, serialize/parse, themes y CSS. `src/editor/AtlasWebBuilderEditor.jsx:36` usa dnd-kit, store Zustand y undo/redo; responsive de paneles, preview y callbacks `onSaveDraft/onPublish`. `src/persistence/serializePage.js:174` valida, limpia bloques huérfanos y emite JSON string; parse migra/valida. `src/schema/migrate.js:9`: schema actual 1, registry vacío; schema futuro produce warning y se devuelve, no hay política estricta de rechazo. `src/renderer/SafeRichText.jsx:43` usa DOMPurify en navegador y texto en SSR; esto **no** es un sanitizer general de ZIP ni prueba seguridad de URLs en todos los bloques.

Cadena activa: editor local → serializePage → alias draft → Json Prisma (puede contener string JSON) → publishPage copia borrador → resolver devuelve publishedBuilderData → parsePage → AtlasWebRenderer. PageEditor y BlogEditor duplican integración/assets; renderer comparte el paquete y bloques Runly. No se encontró un editor Puck activo en esa cadena; el resumen del manifiesto es deuda documental.

**Actualización diferida por el alcance de Fase 0:** no se cambió package.json/lock, no se publicó paquete externo. En reparación autorizada: probar tarball 0.2.4 con corpus sintético e histórico y bloques Runly; si se necesitan los dos fixes locales, publicar primero una versión nueva desde el repositorio externo con tests/build/inspección del tarball y permiso explícito de publicación. Después actualizar desde registry con el gestor del monorepo (`pnpm --filter @runly/desktop update @raulbellosom/atlas-web-builder@<version-validada>`), revisar lock y regresión. La distribución es npm; usar npm install en este monorepo introduciría un segundo lock innecesario. No publicar 0.2.4 nuevamente.

## 4. Catálogo ↔ Website y Commerce

**CONFIRMADO-CÓDIGO:** campo web real `catalog_product.published`; API administrativa `publishProduct` (`catalog-product-service.js:444`). El contrato Commerce recuperado conserva `pos_enabled`, disponibilidad por sucursal y baseline/config POS separados (`docs/superpowers/plans/2026-11-01-commerce-phase2-results.md:16`). Ningún cambio a estos campos se hizo en Fase 0.

`catalog-public-service.js:9` lista productos con `company_id`, `enabled=true`, `published=true`, búsqueda y categoría; count aplica igual filtro. Ficha por slug **o id** (`:51`) repite esos filtros; variantes filtran company/product/enabled y heredan precio cuando corresponde. Categorías filtran empresa/habilitado y cuentan productos publicados; no ocultan automáticamente categorías vacías. No hay filtro de stock en la lista pública: agotado sigue visible. Disponibilidad para venta/checkout requiere su propio contrato Commerce, no se infiere de esta consulta.

Los bloques llaman `catalogPublicClient.js:15` con `X-Runly-Company`, configuración RUNLY_CONFIG y fallback ATLAS_CONFIG. `public-website.js:219` prioriza ese selector público sobre Host; sirve catálogos públicos de la empresa elegida, **no es una credencial**. No clasificar esta selección como fuga cross-tenant por sí sola. Sí requiere aclarar la política de empresas deshabilitadas en esa ruta y site status: el lookup por slug usa findUnique sin filtro enabled; no se certificó protección externa. Proyección contiene stock/track_stock/attributes según ruta; comentario de privacidad y proyección no coinciden enteramente, requiere decisión de campos públicos, no se declara filtración de secretos demostrada.

Resolución de imágenes reutiliza Files/Catálogo: permanentes para PUBLIC y firmadas para históricos privados; revisar caducidad en piloto. No se hornean precios en release: fetch en cliente. No se probó refresco de una pestaña ya abierta tras despublicar ni todas las capas cache/CDN.

| Caso | Evidencia y resultado |
|---|---|
| Web oculto y POS activo | SQL público lo excluye por published, independientemente de POS; contrato confirmado por código; E2E pendiente. |
| Web activo y POS inactivo | Query pública no consulta pos_enabled: visible web; no habilita POS. |
| Empresa distinta | Queries vinculan producto/categoría/variante a companyId; 8 pruebas de tenant/proyección pasan; no sustituyen DB/RLS. |
| Agotado | Visible por consulta actual; criterio UX/checkout pendiente. |
| Precio/variante/imagen | Campos y herencia localizados; cobertura parcial, no validación visual ni stock real. |

**Conservar** catálogo público, semántica published, IDs/slugs, aliases y contratos SDK/MCP. No añadir un segundo campo de publicación ni otro maestro de inventario.

## 5. Formularios, captura y respuestas

Definición `WebsiteForm`/fields/submissions (`schema.prisma:1532`). `forms-service.js:33` filtra listados por empresa/sitio y `:139` respuestas por empresa/formulario. Asignación valida membership activa. Permisos se reutilizan de páginas; lectura de respuestas no tiene permiso independiente. Delete de respuesta es físico, y deleteSite elimina forms con cascade: conservar históricos antes de cambiar esa política.

API preferida `/public/storefront/v1/forms/:formId` y `/submissions`: metadata pública allowlist, JSON hasta 64 KiB, limiter en memoria, `Idempotency-Key`, validación de campos, honeypot y Turnstile configurable. `storefront-capture-service.js:375`, `:510` hacen scope, deduplicación y transacción submission/lead/activity; email/notification best effort. Tests prueban campos requeridos/tipos, origen inválido, DNT/consentimiento analítico, reintentos y fallo SMTP sin perder respuesta. No equivalen a entrega de correo real.

El adaptador legacy `/public/website/forms/:formId/submit` (`forms-public-routes.js:34`) delega al mismo servicio y anuncia successor/Sunset ya pasado; si no recibe clave genera una aleatoria, por lo que no deduplica reintentos del cliente. Tiene limiter propio; no usa el mismo lector de cuerpo limitado del v1. Compatibilidad a mantener temporalmente y medir antes de retirar.

**WR-16 es bloqueante funcional:** `resolveSite` retorna GrowthProperty; `getPublicForm` compara WebsiteForm.siteId contra GrowthProperty.id, aunque el vínculo real está en websiteSiteId. El mirror crea ID distinto por defecto. Suite anterior usa ambos IDs iguales; el nuevo probe usa IDs distintos y obtiene 404 reproducible. `getPublicConfig` puede crear ese espejo al consultar: no ejecutar su GET contra servicios compartidos durante auditoría.

No hay pipeline de adjuntos en esta cadena pública ni se certifica exportación/retención/consentimiento para datos de formulario. ContactFormBlock pide ID manual; ContactFormRenderer monta `RunlyERP.renderForm`; UX pendiente de captura de pantalla por Claude. Los controles de consentimiento analítico no deben presentarse como política completa de privacidad de respuestas.

## 6. ZIP/frameworks: capacidad comprobada y límites

**Soporte real: archivos estáticos; nunca npm install/build ni proceso SSR.** Se usa JSZip 3.10.x, sin extracción al filesystem. No afirmar Zip Slip en disco: el probe `../outside.txt` demuestra que JSZip normaliza a `outside.txt`; la aplicación acepta el contenido normalizado en lugar de rechazar el archivo original inseguro. Entrada marcada symlink se sube como bytes, **no se crea un enlace del sistema**.

Límite de archivo comprimido 100 MiB (`dist-upload-service.js:2`); ruta parsea/mantiene el upload completo antes de comprobarlo. No hay control de suma descomprimida, cantidad de entradas o ratio en el loop. Probe acotado de 1 MiB repetido supera 500:1 y se acepta; no se ejecutó bomba grande ni se agotó memoria.

| Entrada | Resultado local | Certificación de framework |
|---|---|---|
| HTML/CSS/JS | Layout sintético aceptado; index guardado en Storage doble | Navegador/publicación HTTP pendiente |
| React/Vite | `dist/index.html` + assets aceptados | No se compiló ni ejecutó una app React real |
| Vue | index + assets aceptados | Build/router/chunks en navegador no probados |
| Angular | `browser/index.html` + main.js aceptados | Output `output/browser` con dos wrappers no cumple detector; deep links no probados |
| Astro static | index + `_astro` + about/index aceptados | Reescritura/importmap existen; hidratación/transiciones no probadas |
| Next export | index + `_next/static` + about.html aceptados | Solo shape estático; RSC/client navigation/assets no certificados |
| Fuente/SSR sin index | Rechazo 422 comprobado | No soportado como runtime |
| Fuente/servidor **con index** | Aceptado como bytes, no se ejecuta server.js | Falta rechazo explícito; no equivale a soporte SSR |
| Env/symlink/ratio alto | Aceptados en dobles | Defensas incompletas WR-09 |

Los seis fixtures son **layouts sintéticos generados en memoria, no builds auténticos**. Mantener todos los frameworks en `NO PROBADO E2E`; logos en DistUploadPanel no constituyen soporte certificado. Aceptación de artefacto no prueba que sus imports absolutos/relativos funcionen.

`findRootPrefix` permite raíz o un wrapper. No se limita el loop a ese wrapper: `outside.txt` termina como `de.txt` si el prefijo mide cinco caracteres (WR-08). MIME por extensión, fallback octet-stream; `.map` permitido, sin inspección de contenido sensible. Bucket público aloja originales `builds/*.zip`: acceso directo de esos objetos se rige por Storage, no por site status. URLs de builds usan SUPABASE_URL interno en vez del resolver público (WR-10).

Hosting busca `ruta/index.html`, `ruta.html`, después index raíz; es fallback SPA indiscriminado, no catálogo de rutas válidas. Reescritura HTML trabaja sobre atributos con comillas dobles; no reescribe universalmente CSS, srcset, módulos anidados o fetch. Se inyectan importmaps para `_astro`/`_next`, configuración/SDK/badge. Pendientes: assets con base diferente, URLs relativas, MIME del gateway, redirects/CORS y rutas que chocan con `/app`, `/p`, `/public` o assets reservados por Nginx.

## 7. Publicación, hosting, dominios e instalaciones

**Existente:** bucket público `runly-website`; API arranca asegurando configuración pública y allowedMimeTypes null (`index.js:727`, `:741`). Upload sobrescribe `dist/<companySlug>/...` con upsert y actualiza metadata del sitio al final; guardar ZIP original no verifica todos los errores de Storage devueltos como `{error}`. No se limpia automáticamente un asset eliminado del nuevo manifiesto. DeleteDist elimina el manifiesto actual, no toda la historia ni todos los huérfanos. DeleteSite tampoco retira objetos dist en su función.

HTML cache en memoria por `(companyId,urlPath)`, TTL cinco minutos; no incluye siteId/host/release. Cache de dominios/primaria sesenta segundos; invalidación local al proceso en cambio de source/site/upload, no entre réplicas ni purge del navegador/CDN. Un cache hit retorna antes de fijar la cabecera Cache-Control de la ruta cold. No hay publicación atómica, rollback de release ni job dedicado demostrado. `WebsitePublishedRender` registra referencias, no artefacto HTML real utilizado por resolver.

Resolver normaliza dominio (minúsculas, elimina protocolo/puerto/www), compara exacto, confía primero en X-Forwarded-Host y luego cae a primary_company_id/company_id. No hay rechazo por hostname desconocido, allowlist de proxies, ownership challenge ni colisión protegida en DB. Nginx local es `server_name _`, pasa Host y no demuestra saneamiento del X-Forwarded-Host recibido. La infraestructura de edge real no fue inspeccionada, por lo que no se afirma explotabilidad pública confirmada.

**Instalador external:** `infra/installer/docker-compose.yml:27` API y worker leen `.env.external`; web usa API/Supabase configurados. El perfil external **no implica base aislada**. No se leyó ningún valor secreto ni se certificó qué instancia comparten los servicios actuales. Antes de E2E crear configuración/base/bucket exclusivos, impedir boot que apunte a instancias conocidas y verificar destinos sin registrarlos en este expediente.

### Alternativas y fuentes oficiales verificadas

- `slug.sites.example.com` es viable conceptualmente con wildcard DNS + TLS específico + resolver seguro. Para la marca se evalúa el namespace `*.sites.runly.mx`; **no está aprovisionado por este trabajo**. Universal SSL en zona full cubre apex/primer nivel, no ese nivel profundo; CNAME setup tiene reglas distintas. [Limitaciones de Universal SSL](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/).
- Wildcard DNS está disponible en los planes de Cloudflare, pero no crea la asignación tenant/sitio ni garantiza TLS. [Wildcard DNS](https://developers.cloudflare.com/dns/manage-dns-records/reference/wildcard-dns-records/).
- Para edge profundo se puede evaluar Advanced Certificate Manager/Total TLS, o wildcard en origen con DNS-01. DNS-01 permite wildcard; no se solicitaron certificados. [Advanced Certificates](https://developers.cloudflare.com/ssl/edge-certificates/advanced-certificate-manager/), [Let's Encrypt DNS-01](https://letsencrypt.org/docs/challenge-types/).
- Dominios propios requieren propietario/normalización/unique/verification/TLS/renovación/reasignación. Cloudflare for SaaS lista 100 hostnames incluidos y USD 0.10 por adicional en Free/Pro/Business; wildcard custom hostname no incluido en esos planes. No confundir wildcard de plataforma con wildcard custom hostname de un cliente. [Planes SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/).
- El borrador citaba ACM USD 10/mes: **no revalidado en la página técnica consultada**; mantener como estimación pendiente de cotización, no costo confirmado. Hosting, CDN, almacenamiento, tráfico, operación y registro de dominio siguen sin presupuesto. No se adoptó tipo de cambio.

**Recomendación condicionada:** hostname por sitio con unique global y resolución estricta; separar origen administrativo. Para ZIP con JS arbitrario preferir otro dominio registrable, y aun así no entregar tokens ERP a ese origen. `sites.example.com/slug` comparte origen entre sitios y rompe bases absolutas, por lo que no se recomienda para imports arbitrarios. `*.sites.runly.mx` comparte sitio registrable con el ERP; SameSite no basta como aislamiento. Revisar storage de tokens, CORS, CSP, CSRF, SW y autenticación antes de decidir. Fallback legacy solo en hosts explícitos de compatibilidad, nunca para cualquier Host.

## 8. Hallazgos confirmados y riesgos separados

Baseline común: SHA ERP de §0; fixtures sintéticos, sin empresas ni servicios reales. P0 = aislamiento/autoridad, P1 = publicación/integridad/función principal, P2 = integración/UX. Responsables de backend: Codex; cierre con test de aceptación futuro, no con los probes observacionales actuales.

| ID | Clasificación / prioridad | Fuente y observado frente a esperado | Impacto, reproducción y corrección propuesta |
|---|---|---|---|
| WR-01 | CONFIRMADO-PRUEBA / P1 | `public-website.js:41`, `dist-serve-service.js:267,288`: status del sitio no condiciona lectura. Probe draft devuelve página publicada. | Un sitio en draft/maintenance puede seguir exponiendo páginas/ZIP; sourceType none es control distinto. Definir lifecycle único y test A08 para las dos fuentes. |
| WR-02 | CONFIRMADO-PRUEBA / P1; abuso externo RIESGO P0 | `dist-serve-service.js:308` y Nginx: host desconocido cae a primaria; forwarded-host prevalece. | Routing de tenants no es estricto. Probe con headers sintéticos; no prueba edge real. Rechazar desconocidos, confiar solo proxy explícito; probar A22 y compatibilidad single-tenant. |
| WR-03 | CONFIRMADO-PRUEBA / P1 | Editor `WebsitePageEditorScreen.jsx:148` envía nuevo contenido; `pages-routes.js:163` no lee body; servicio `:314` copia borrador persistido. | Publica versión anterior sin advertir. En probe old/new se publica old. Contrato save+publish atómico o revisión de borrador guardado; test guardar/editar/publicar sin guardado intermedio y concurrencia. |
| WR-04 | CONFIRMADO-PRUEBA / P0 | `validators.js:20`, `pages-routes.js:92`: PATCH status published solo requiere pages.update. | Un editor sin publish puede reactivar contenido ya publicado y archivado/draft. Probe registra permiso usado. Separar transición y exigir publish en servidor; probar A28. No se afirma publicación de borrador nuevo por esta vía. |
| WR-05 | CONFIRMADO-PRUEBA en límite de servicio / P0 | `website-service.js:193`, `forms-service.js:50`, themes `:526`: siteId no valida pertenencia al crear. | Page/form probe acepta siteId ajeno y company propia; persistencia real/constraints pendientes. Validar padres y referencias theme/homepage/menu/categoría en alcance empresa/sitio; A02/A11/A16. No se demostró lectura de registros privados de otro tenant. |
| WR-06 | CONFIRMADO-PRUEBA / P1 | `dist-upload-service.js:50`, `dist-serve-service.js:191`: namespace y cache por empresa. | Dos sitios de una empresa sobrescriben index; historial compartido. Probe sube A/B y queda B. Namespace site/release + tests multisite; requiere adaptador de URLs históricas. |
| WR-07 | CONFIRMADO-PRUEBA / P1 | `dist-upload-service.js:53` uploads secuenciales públicos antes de UPDATE. | Fallo del segundo asset deja index nuevo con metadata vieja. Probe inyecta error; DB doble no se actualiza. Staging, manifest/hash, promoción atómica y rollback, A07. Assets viejos/ZIP originales también necesitan política. |
| WR-08 | CONFIRMADO-PRUEBA / P1 | `dist-upload-service.js:55` slice sin startsWith(rootPrefix). | ZIP wrapper con archivo exterior produce nombre truncado. Probe outside.txt → de.txt. Rechazar entradas externas/duplicadas y validar manifiesto antes de escribir, A18. |
| WR-09 | CONFIRMADO-PRUEBA / P1; fuga/DoS real RIESGO P0 | Upload `:34-69`: solo límite comprimido; acepta .env sintético, server.js, symlink marcado y ratio >500:1. | Bytes se suben a bucket público previsto; no se ejecutan scripts ni symlink del OS. No se probó agotamiento real. Límites descomprimidos/cantidad, deny de privados, rutas originales, tipos y presupuesto; A18/A20/A21. |
| WR-10 | CONFIRMADO-PRUEBA / P2 | `dist-upload-service.js:126`: historial construye URL con SUPABASE_URL. | Self-hosted con origen interno distinto entrega URL no navegable. Probe usa dominios `.test`/`.example`. Reutilizar resolvePublicSupabaseUrl, test modo external/local. |
| WR-11 | CONFIRMADO-PRUEBA / P2 | `validators.js:22`, editor `:139`, alias draft `pages-routes.js:142`: string serializado vs record. | Dos contratos de guardado incompatibles; alias activo evita el rechazo record. No declarar que guardar en editor siempre falla. Normalizar un DTO con adaptador legacy y validación real del documento. |
| WR-12 | CONFIRMADO-CÓDIGO / P1 | Wizard `:130` crea tema pero no asocia themeId; servicio `upsertTheme:526` tampoco. Público `public-website.js:70` carga solo themeId; editor `getActiveTheme:519` elige por empresa. | En sitio nuevo sin themeId, tema del editor no llega por resolver. Reproducción UI pendiente; vincular tema por sitio, probar paridad preview/público y múltiples sitios. |
| WR-13 | CONFIRMADO-CÓDIGO / P1 | `website-service.js:648` publica WebsiteBlogPost; `public-website.js:140` lista WebsitePage page_type blog_post; createPageSchema ni admite blog_post. `blogIndexBlock.jsx:16` es placeholder. | Blog administrativo y salida pública no comparten fuente; no prometer blog funcional. Unificar mediante adaptador de históricos, test crear/guardar/listar/ficha pública; no borrar ninguna tabla. |
| WR-14 | RIESGO / P0 | `infra/nginx/spa.conf` sirve sitio en raíz y ERP en /app; `dist-serve-service.js:85,139` badge lee storage y publica nombre de clave auth. | JS arbitrario servido en el mismo origen puede alcanzar sesión local; no se ejecutó exfiltración ni se probó el despliegue real. Origen aislado y estrategia auth, A21. No basta esconder el badge ni cambiar ruta. |
| WR-15 | CONFIRMADO-PRUEBA en límite de persistencia / P0 | `blog-routes.js:44` body JSON sin esquema; `website-service.js:572` pasa data íntegro a update. | Propietario con pages.update puede enviar companyId/siteId nuevos; probe demuestra llegada al update, DB real no mutada. Allowlist de campos y pertenencia inmutable; A02/A28 con dos empresas. |
| WR-16 | CONFIRMADO-PRUEBA / P1 | `storefront-capture-service.js:375`, `growth-property-service.js:12,56`: usa property.id como WebsiteForm.siteId. | Formulario existente devuelve 404 cuando IDs difieren; suite anterior iguala IDs. Corregir límite de identidad websiteSiteId/propertyId y probar lectura/envío v1+legacy, E2E y analytics sin romper Growth. |
| WR-17 | CONFIRMADO-PRUEBA / P2 (deuda de tests) | `routes/__tests__/public-website-capture-config.test.js:7` stub no tiene company.findUnique, requerido por resolver. | 1/77 falla por doble obsoleto; no demuestra caída de producción. Actualizar fixture y agregar los casos negativos, conservando protección de campos. |

**Otros riesgos que no se elevan a bug reproducido:** publicación sin transacción y maxVersion concurrente; guardados last-write-wins; cache entre réplicas/orígenes; dominios duplicados sin unique ni challenge; recursos huérfanos tras delete; diferencias React 19 host/React 18 tests builder; memoria de rate limiter por proceso; bypass del tamaño global en legacy; direct Storage URL todavía accesible tras despublicar; políticas RLS/Storage reales desconocidas. Son entradas de pruebas/contratos posteriores, no hechos de un incidente real.

## 9. Evidencias ejecutadas y reproducción

Artefacto ejecutable: `docs/superpowers/evidence/2026-11-02-website-recovery/probes.mjs`. No importa index.js ni dotenv, inyecta DB/Storage en memoria y bloquea fetch; usa JSZip instalado sin ejecutar contenido. **23/23 observaciones reproducidas**. Incluye los casos WR-01..11, WR-15/16, traversal normalizado, fuente sin/con index y seis shapes estáticos. WR-12/13 son evidencia de código; WR-14 conserva categoría de riesgo.

```powershell
node --test --test-reporter=spec docs/superpowers/evidence/2026-11-02-website-recovery/probes.mjs
node --test apps/api/src/services/__tests__/dist-upload-service.test.js apps/api/src/services/__tests__/dist-serve-service.test.js apps/api/src/services/__tests__/forms-service.test.js apps/api/src/services/__tests__/storefront-capture-service.test.js apps/api/src/routes/storefront/__tests__/storefront-capture-routes.test.js apps/api/src/routes/__tests__/public-website-capture-config.test.js apps/api/src/routes/website/__tests__/website-capture-settings.test.js packages/sdk/src/__tests__/sdk-website-domain.test.js
node --test apps/api/src/routes/catalog/__tests__/catalog-tenant.test.js
```

Resultados: suite ERP seleccionada **77 pruebas: 76 correctas, 1 falla WR-17**, sin omitidas; catálogo **8/8**. Builder: desde su checkout externo `pnpm exec vitest run`, **114/114 en 20 archivos**. Versión instalada ERP 0.2.0: carga y round-trip mínimo manual correctos. Ninguna suite se presenta como DB/Storage real, tarball npm 0.2.4 probado, ni corpus histórico de clientes validado.

Verificación documental: `node --check` del probe y revisión de whitespace correctas. `pnpm check:privacy` revisó 6562 archivos y **falló con 67 hallazgos preexistentes fuera de estos tres entregables** (Notes, Automation, Studio, licencia de fuente y documento previo). No se corrigieron archivos ajenos para forzar un resultado global verde. La inspección individual mediante `inspectFile` del mismo verificador revisó los **3 entregables con 0 hallazgos**; la limitación de baseline global permanece registrada.

## 10. Arquitectura objetivo recomendada — propuesta, no implementación

Conservar tablas/IDs/URLs/aliases, bloques y paquete builder. Evolucionar por contratos y adaptadores:

1. **Sitio:** identidad siteId explícita en UI/API, empresa validada en todos los padres; GET/listado de varios sitios; estados definidos con una sola autoridad; slug/hostname únicos por namespace.
2. **Documento:** DTO normalizado, schemaVersion, compatibilidad string/objeto histórica, validación servidor y revisión esperada para conflicto. Theme y recursos vinculados al sitio; no reescribir páginas existentes automáticamente.
3. **Release:** validar documento/ZIP → staging privado → manifiesto inmutable con hashes → puntero publicado atómico. Assets por siteId/releaseId, reversión y retirada de acceso público coherentes. No convertir WebsitePublishedRender en una promesa de SSR que hoy no existe.
4. **Catálogo:** mantener fachada de lectura con published y companyId, proyección acordada y stock explícito; POS sigue independiente. Site de contenido no requiere tienda.
5. **Forms:** identidad WebsiteSite separada de GrowthProperty, DTO público/privado, validación y transacción existentes conservadas; permisos de respuestas y retención; legacy adaptado al mismo límite seguro, rate limit distribuido si se escala.
6. **Dominios/gateway:** hostname normalizado unique, ownership/TLS/estado, proxy confiable, rechazo de desconocidos, aislamiento de origen para scripts no confiables. Hosts legacy allowlist + redirecciones solo tras propiedad confirmada.
7. **Instalaciones:** nuevas estructuras aditivas solo en fase autorizada; matriz local/external y test de upgrade con backups, sin alterar configuraciones existentes durante esta auditoría.

**Contratos existentes a preservar:** `runly.website`, permisos website.*, tabla/columnas, JSON schema1, endpoints singular/plural y draft aliases, `RUNLY_CONFIG/ATLAS_CONFIG`, `/public/site/runly-sdk.js` y alias atlas-sdk, SDK administrativo, MCP prepare/revision, catálogo `published`, captura v1/legacy. Contratos faltantes: Website-Site multisitio, Builder revisionado, Release, Import security, Domain verification/TLS, Forms websiteSiteId↔propertyId y política de datos públicos. Congelarlos en Fase 1 antes de pantallas definitivas.

## 11. Aceptación pendiente y transferencia

| Casos heredados | Estado de Fase 0 / condición mínima |
|---|---|
| A01–A03 sitio sin tienda, multisite, colisiones | Código sin dependencia comercial; E2E pendiente y colisiones/namespace sin cerrar. |
| A04–A06 histórico, concurrencia, preview | Round-trip mínimo y tests paquete; corpus histórico/concurrencia/origen aislado pendientes. |
| A07–A08 publish/rollback/unpublish | No aceptados por WR-01/03/06/07. |
| A09–A13 web/POS, tenant, variantes/stock | Contrato y queries localizados; 8 pruebas relacionadas; matriz E2E y cache pendientes. |
| A14–A17 formularios/abuso/respuestas | Unidades útiles, WR-16 bloquea extremo a extremo; permisos/retención y carga real pendientes. |
| A18–A21 ZIP, frameworks, SSR, sesión | Probes detectan controles faltantes; build/browser/origen seguros no certificados. |
| A22–A24 Host/TLS/domain ownership | Fallback reproducido; sin laboratorio DNS/TLS ni ownership implementado en cadena auditada. |
| A25–A26 histórico/external | Instalador identificado; upgrade y separación de destinos no probados. |
| A27 responsive/a11y | Reservado a auditoría UX con pantallas/capturas; sin aprobación visual. |
| A28 permisos | Pages.publish bypass y categoría mass assignment no aceptados. |

**Decisiones para revisión del responsable:** aprobar alcance de Fase 1; escoger aislamiento de ZIP (dominio registrable separado recomendado); definir multisite y política de hosts legacy; conservar/adaptar builder y elegir versión publicada frente a futuros fixes; diferir dominios propios; definir campos públicos/stock y retención de respuestas. Ninguna decisión se tomó como permiso de implementación/publicación.

**Codex después de autorización:** contratos y plan de cambios, reparación de authority/tenant, identidad forms/Growth, publish/ZIP/release/cache, pruebas aisladas y compatibilidad; actualización del paquete vía npm registry después de validar la versión. **Claude después del gate:** capturar y auditar UX de wizard/admin/editor/forms; diseñar estados reales, fallos parciales, guardado vs publicación y selector de sitios, reemplazar IDs manuales de forms/productos donde el contrato lo permita. Debe usar @runly/ui y recibir DTO/errores/permiso/estado soportados; no implementar React todavía.

**Cierre:** expediente estático y pruebas aisladas entregados. Hay código aprovechable y funciones con unidades correctas; Website completo **no está validado ni recuperado**. Pendientes concretos: stack desechable DB/Storage + navegador, corpus histórico, builds auténticos por framework, TLS/DNS de laboratorio y política de origen/sesión. No se hizo SSH, push, deploy, DNS, certificados, migraciones ni cambio funcional. Plan revisado en `docs/superpowers/plans/2026-11-02-website-recovery.md`.

## 12. Fase 1: arquitectura recomendada y contratos preparados

El encargo posterior autorizó contratos, arquitectura y pruebas de investigación no destructivas; no cambió la autorización de implementación. Se mantiene main y el repositorio externo sin modificación. [Contratos v1](2026-11-02-website-recovery-contracts-v1.md) concreta W1–W10, modelos/constraints, estados, DTO, operaciones, permisos, errores, idempotencia, migración y límites para Claude.

Decisiones recomendadas:

- Conservar Website oficial, builder, tablas/IDs/URLs y aliases; evolución aditiva, sin reescritura general. Pertenencia de tenant y recurso se valida tanto en API como en servicios/MCP.
- Un borrador revisionado por página/sitio y un release inmutable con snapshot de rutas/documentos/tema/menús/runtime/medios; Catálogo y Forms continúan vivos con política de exposición actualizada. Un puntero por sitio se cambia por CAS en transacción breve con evento/recibo idempotente.
- Preparar y validar objetos privados antes de activar; bucket privado nuevo, sin convertir el bucket público compartido histórico. Sin upsert del contenido activo. Gateway consulta estado/puntero vigente por petición; no sirve una copia antigua ante fallo.
- Sitios/URLs estables con hostname exacto y default legacy explícito. Namespace compartido de plataforma requiere **registro global entre instalaciones**: unique local no garantiza unicidad bajo `*.sites.runly.mx`. Ese servicio no está demostrado en el checkout y no puede prometerse como operativo.
- ZIP de estáticos compilados, límites/descompresión por streaming con dependencia existente, preview aislado y sin credenciales ERP. Assets inmutables por path/hash para no mezclar versiones; cambios de bytes en mismo path exigen nuevo nombre. SSR/procesos Node fuera de alcance.
- Origen público sin ERP; para ZIP arbitrario se recomienda dominio registrable separado. Namespace de marca para ZIP queda sujeto al gate de cookies/CSRF/CORS/almacenamiento y aprobación del riesgo. No se hizo DNS/TLS real.
- Formularios con propietario tipado y mapa aditivo Website/Growth, sin renumerar formularios/respuestas. Publicación web `published` y POS siguen independientes.

Los contratos administrativos propuestos cubren setup atómico de borrador, multisitio, páginas/tema/menús, previews, imports/releases/activation/rollback/unpublish, formularios/respuestas y dominios. Incluyen SiteDTO/PageDTO, revisiones, capabilities por servidor, errores 409 recuperables y grants nuevos sujetos a revisión. Los endpoints legacy tendrán adaptadores seguros; ninguna compatibilidad conserva un bypass de autoridad.

## 13. Aclaración de compatibilidad Website/Growth

La investigación dirigida encontró una distinción necesaria para reparar WR-16: `apps/api/src/routes/growth/growth-form-routes.js:47` crea formularios pasando propertyId como siteId; Website usa WebsiteSite.id en el mismo campo. El fixture adicional reproduce esa creación con IDs distintos. Por eso **no** se propone reemplazar todas las referencias históricas por websiteSiteId ni consultar cualquiera de ambas con un OR.

Se propone WebsiteFormScope con owner Website o Growth, analyticsPropertyId separado y legacySiteId conservado. External SDK sin WebsiteSite mantiene formularios. El backfill clasifica ambiguos/huérfanos/cross-tenant y bloquea cutover de esos contextos hasta revisión, sin borrar respuestas ni reasignar su ownership. IDs de visitantes/sesiones/leads e idempotencia permanecen. Config/GET dejan de crear espejos; los comandos/backfill los provisionan explícitamente. Detalle en contratos §8 y §11.

## 14. Builder candidato y regresión 76/77 investigados

**Artefacto npm real 0.2.4:** descargado con `npm pack --ignore-scripts` a docs/private ignorado, integridad SHA-512 coincidente con registry; no instalado en el ERP. `phase1-builder-candidate.mjs` dio **10/10**: mismas 79 exportaciones y tipos, dependencias/peers sin cambios frente a 0.2.0, CSS/ESM presentes y transformación ESM por esbuild instalado, 18 bloques base, 27 documentos de las seis plantillas multipágina actuales y registro de bloques Runly, serialize/parse en ambos sentidos y render público SSR determinista con React 19.3.1.

El tarball corresponde a `598795cd135620baa546cac1459a983ad633e065`. El checkout externo `424de9f169690399947142b749efa0aadfd9d51f` contiene dos fixes hero posteriores. **0.2.4 es candidata exacta de laboratorio**, no aprobación de adopción productiva; navegador/DnD/CSS/hidratación/sanitización DOM, lock nuevo y corpus histórico siguen pendientes. Si se necesitan los dos fixes locales, primero preparar/publicar una nueva versión en una acción autorizada separada. No se inventó un número disponible ni se actualizó manifest/lock.

**WR-17 causal, no descartado:** `phase1-resolver-research.mjs` ejecuta el test original sin modificarlo y reproduce falta de company.findUnique y 500 frente a 200. Solo la sustitución en memoria de la firma/respuesta de ese stub hace pasar **las mismas aserciones originales**; no cambia router/servicio. Casos adicionales: empresa deshabilitada sin sitio, tenant predicates/proyección pública, error DB real conserva 500 y creación Growth con propertyId histórico. **6/6** pruebas dirigidas correctas. Corrección propuesta para implementación: actualizar fixture en su archivo original y mantener negativos; no añadir fallback findFirst a producción. La suite original sigue pendiente de esa reparación, no se declara 77/77 real.

Total Fase 1: **16/16 investigaciones**, sin DB, Storage real, servicios o mutaciones de datos. No son pruebas del publisher nuevo ni certificación E2E. Scripts reproducibles y comandos en el plan.

## 15. Secuencia, responsables y decisiones de aprobación

El plan de implementación define pasos S1–S7 con dependencia y cierre: autoridad/fixtures → mapeo Forms/defaults/contratos → releases/gateway/migración segura → import/preview y versión builder → diseño definitivo de Claude → frontend e integración → matriz local final/piloto propuesto. Preparar infraestructura pública, dominios propios y publicar paquetes son acciones diferidas. No se abre una cadena de fases artificiales ni se pide implementar otra UI provisional.

Codex: backend/contratos/persistencia/mapping/gateway/public runtime glue/SDK de dominio y pruebas; Claude: auditoría con capturas y diseño/React de setup/admin/editor/forms/versions/domains después de estabilizar contratos y autorizar su trabajo. Ownership por rutas actuales y archivos propuestos está en el plan; no se lanzó otro agente ni se solicitó implementación a Claude.

Revisión requerida antes del bloque funcional: aceptar contratos W1–W10, política de origen/namespace para ZIP, grants de nuevos permisos, límites iniciales y retención, tratamiento de dominios/refs ambiguos y política de originales públicos históricos. Recomendar 0.2.4 como candidata no autoriza instalarla ni publicar fixes. Cualquier cambio a Commerce queda para aprobación aparte; ninguno se identificó como imprescindible para el contrato de lectura recuperado.

## 16. Cierre de Fase 1

Entregado: especificación [Contratos v1](2026-11-02-website-recovery-contracts-v1.md), maestro y plan actualizados, dos scripts de investigación. Las limitaciones de Fase 0 se mantienen; se resolvieron documentalmente las decisiones de identidad, publicación, compatibilidad y autoridad, con dependencias operativas explícitas en lugar de promesas de capacidades inexistentes.

Verificación de Fase 1: 16/16 investigaciones y sintaxis de los dos scripts correctas; whitespace correcto. `pnpm check:privacy` revisó 6565 archivos y mantiene 67 alertas preexistentes ajenas a este cambio. Los **5 archivos de esta fase** pasaron el mismo `inspectFile` individualmente con **0 hallazgos**. No se corrigieron archivos ajenos para alterar el baseline global. Tarball privado ignorado y checkout externo sin cambios.

El estado correcto es **Fase 1 documental terminada para revisión; correcciones propuestas, ninguna implementada; Website NO APTO E2E**. Detener trabajo después de este expediente. Sin SSH, push, deploy, DNS/TLS, cambios de datos, migraciones, nuevas dependencias o Fase 2.
