# Website Recovery — cierre S4: ZIP, preview y builder

Fecha: 2026-11-02. Base autorizada: `efce9ea5586340a53920f0561b74bc38d0919fab`. Se consultaron maestro, contratos v1, plan y cierre S3, sin reabrir auditorías generales. Trabajo en worktree y rama local `website-s4`, por la instrucción posterior de separar el trabajo simultáneo. No se editó ni incorporó `docs/superpowers/design/`, reservado a Claude.

**S4 APTO en laboratorio para la política estática y los casos descritos. S1/S2/S3 conservados. Website completo sigue NO APTO E2E.** Commit de cierre: el que incorpora esta acta; SHA reproducible con `git log -1 --format=%H -- docs/superpowers/evidence/2026-11-02-website-recovery/import-preview-block-results.md`.

## Implementación y defectos corregidos

| Causa confirmada | Corrección |
|---|---|
| WR-06: namespace de ZIP por empresa, sin separar sitios/versiones | Objetos privados por empresa/sitio/hash; WebsiteImport propio; releases S3 y aliases por sitio. Dos sitios no comparten una key mutable. |
| WR-07: upserts públicos parciales antes de actualizar metadata | Validación privada completa, original conservado, create-only y readback SHA-256. Un import fallido conserva puntero, archivos e historial anteriores. Activación/rollback reutilizan la transacción S3. |
| WR-08: slice de wrapper sin comprobar pertenencia | Nombres originales, root inequívoco/expreso y rechazo de cualquier entrada exterior; no se truncan ni renombran silenciosamente. |
| WR-09: presupuesto solo comprimido, privados/servidores/symlinks aceptados | `yauzl` existente con lectura por streaming, presupuestos declarados y medidos, CRC, estructura local/central, rechazo de solapamientos, cifrado, links y tipos especiales. Deny de fuentes/secretos/SSR y allowlist MIME. |
| WR-14: código no confiable próximo al ERP | Gate de dominio registrable independiente, CSP/sandbox, origen sin API administrativa ni tokens ERP, preview con grant propio efímero y cookie host-only. También se añade CSP al shell builder legacy: sus datos tampoco se consideran confiables. |
| Bypass por cambio de fuente | Builder después de ZIP no hereda sus blobs ejecutables como recursos confiables. Los assets ZIP históricos vuelven a comprobar aislamiento incluso después de un rollback a builder. Regresión específica con hostname de marca rechazado. |
| Defecto descubierto en navegador | El runtime público usaba `credentials:omit` y no podía leer una preview privada. Solo el HTML de preview marca `data-preview=true`; ese runtime envía su cookie del mismo origen. El modo público mantiene omit y nunca recibe sesión ERP. |

Archivos centrales: servicios `website-zip-policy`, `website-import-service`, `website-preview-service`, `website-content-isolation`, `website-static-serving`; integración con `website-release-service`, `website-gateway-service` y `website-publication-context`; rutas `import-routes`, `preview-routes`, adaptador `dist-routes`, gateway público e inicio API. SDK aditivo, runtime técnico y pruebas en sus ubicaciones actuales. Se elimina el uploader inseguro antiguo y sus borrados físicos; sus helpers puros permanecen por compatibilidad, sin autoridad de publicación.

## Política ZIP efectiva

`static-v1`: 100 MiB comprimidos, 400 MiB expandidos, 50 MiB por entrada, 10 000 entradas, ratio máximo 200:1, paths de 512 bytes/32 segmentos y presupuesto de 30 segundos. Lectura de nombres originales antes de normalizar, rechazo de traversal/absolutos/drive/UNC/backslash/porcentajes/controles/dispositivos/segmentos vacíos/dot/trailing dot o espacio, duplicados insensibles a mayúsculas, symlinks y tipos Unix especiales. No hay extracción a filesystem ni ejecución/instalación de proyectos importados.

Se validan EOCD y rangos locales/centrales sin solapamiento, tamaños al inflar, métodos store/deflate y CRC. Configuración de límites solo desde servidor; el body no puede ampliarlos. Root con index en raíz, un wrapper inequívoco o rootDirectory explícito; archivos fuera del root invalidan todo. No se descartan privados para simular un import válido.

Deny de `.env*`, rutas ocultas, node_modules, manifests/locks, fuentes TS/JSX, maps, backups/keys, ZIP anidado y salidas SSR reconocibles. Se revisan referencias estáticas detectables en HTML/CSS/imports JS y recursos faltantes/externos; no se reescribe HTML, JS, CSS ni srcset hacia Storage. MIME/nosniff y CSP se aplican al servir. Una allowlist no convierte JS/SVG en código confiable ni demuestra la semántica completa de JS arbitrario.

**Restricciones explícitas frente al objetivo amplio:** esta versión acepta paths ASCII; no translitera nombres Unicode. ZIP64 y multidisco no se admiten. Base HTML solo `/`; dependencias estáticas externas deben empaquetarse. No se acredita ejecución WASM, librerías que necesiten unsafe-eval, service workers, SSR, Node persistente, funciones de servidor ni cualquier build de cada framework. Referencias construidas dinámicamente requieren la prueba del artefacto concreto. Un fallo conserva originales/drafts y devuelve código recuperable, sin conversión silenciosa.

Máximo dos imports en validación por instalación y uno por sitio, serializados en PostgreSQL. **No hay cola de veinte ni worker de jobs/daemon nuevo:** el parser de referencias usa un worker thread efímero de código del ERP, con heap de 128 MiB y deadline terminable, sin evaluar scripts importados. La saturación devuelve 429 `import_capacity`; se reintenta explícitamente. Un request posterior del propio sitio identifica sus trabajos vencidos tras un proceso caído y los marca failed, sin modificar filas de otra empresa/sitio; la capacidad global cuenta solo trabajos vigentes, sin purgar datos. Timeout de Storage falla cerrado; una respuesta tardía no puede continuar la validación/promotion. Una llamada de red ya iniciada puede terminar su escritura privada; no altera el puntero ni habilita el artefacto. Estas pruebas no certifican capacidad de producción bajo el límite máximo de carga.

## Releases, publicación y retención

La migración aditiva `20261102140000_website_import_preview` crea WebsiteImport, WebsitePublicAssetBinding y WebsitePreviewSession, con UUID PostgreSQL, claves compuestas, índices, RLS backend-only y revocación de grants ordinarios. Import listo/fallido y binding público son inmutables; la identidad de preview no puede cambiar y no se puede desconsumir/revivir un grant. Se conserva todo el modelo e historial S1/S2/S3.

Import produce un manifiesto privado completo con hash/MIME/tamaño por archivo y original ZIP privado. `prepareRelease(kind:dist)` verifica import propio listo y bytes, y crea un candidato sellado en **WebsiteRelease de S3**. Activación conserva CAS del borrador/base/publicación, autorización, recibo, pointer, evento, audit y outbox en la misma transacción. No hay Storage dentro del lock. Rollback no altera borradores. Las proyecciones legacy de fecha/cantidad/prerender se actualizan al activar ZIP; el manifiesto antiguo almacenado no se destruye.

Todo path de asset no HTML queda fijado a su primer hash al activar, atómicamente con el puntero. Cambiar `/main.js`, CSS, JSON o cualquier alias ya publicado a otros bytes da 422 `asset_path_conflict`; exige recompilar/renombrar. Los assets anteriores conservan sus bytes mientras el sitio esté público y su release no esté revocado. HTML/navegación sigue exclusivamente el release activo. Una ruta de directorio sin slash redirige 308 a su forma con slash para preservar recursos relativos, sin reescribir HTML. Para SPA con rutas profundas se requiere base raíz/recursos compatibles; no se certifican variantes de compilación no probadas. SPA fallback exige `routingMode:spa`, navegación HTML y path sin extensión; un chunk inexistente nunca devuelve index. Unpublish bloquea todos los releases del sitio, conservando almacenamiento e historial.

No se aplicó migración a una instalación compartida. No se convirtió el bucket público histórico ni se copiaron objetos de clientes. Sus enlaces Storage preexistentes fuera del gateway **no adquieren revocación retroactiva** por este bloque. Históricos ambiguos y corpus no disponible no se atribuyen a una empresa ni se declaran migrados. El bucket privado S3 existente se exige y verifica, no se crea ni reconfigura automáticamente.

## Aislamiento y preview

El servidor configura `RUNLY_APP_URL`, `RUNLY_WEBSITE_CONTENT_ROOT` y `RUNLY_WEBSITE_PREVIEW_ROOT`. `tldts` 7.4.19, única dependencia funcional nueva, comprueba el dominio registrable con PSL (incluidos sufijos privados). Se rechazan sitios que compartan registrable administrativo y cualquier ejecución ZIP bajo `runly.mx` o sus subdominios. No basta escoger otro hostname. Antes de activar dist se comprueban todos sus bindings públicos listos; gateway y descarga de assets históricos revalidan el aislamiento. Ausencia de configuración/host listo da `isolation_required`, sin fallback ERP.

Preview: sesión de quince minutos, release propio listo o candidato builder preview-only, hostname aleatorio exclusivo y token aleatorio de un solo canje. Solo se guarda hash. URL con **fragmento**, nunca JWT administrativo en query; bootstrap confiable lo elimina con replaceState antes de cargar el documento. Canje exige Origin exacto y emite `__Host-runly-preview`, Secure/HttpOnly/SameSite Strict/Path=/, sin Domain. Cada petición comprueba grant, expiración/revocación, empresa/sitio habilitados, release propio y hash. Revocación del creador es idempotente y auditada. Preview-only nunca puede activarse como publicación.

El origen de preview se intercepta antes de CORS/auth/API; no existe passthrough administrativo. Solo GET de su snapshot/bytes y el canje explícito son admisibles. Capturas/analytics/Calendar y catálogo dinámico quedan deshabilitados en preview, con capabilities false; no se producen respuestas, leads o notificaciones. Para builder se fuerza analytics off y no se entrega Turnstile. No hay canal postMessage ni interfaz provisional. La futura interfaz puede embeber el origen autorizado con sandbox sin navegación superior/popups; frame-ancestors limita al origen administrativo exacto.

CSP del contenido importado: recursos y conexiones del propio origen, scripts inline necesarios para exports estáticos, sin unsafe-eval, object, frames, workers ni formularios; sandbox solo scripts/same-origin. Permisos de cámara/micrófono/geolocalización/pago/USB denegados; referrer no-referrer; CORP same-origin; no-store y nosniff. El contenido sigue siendo arbitrario dentro de su origen. El test local usa localhost/loopback expresamente, sin desactivar comprobaciones de certificados ni seguridad del navegador. **No acredita DNS/TLS públicos, cookies entre dominios reales desplegados o seguridad operativa de una infraestructura que no se ha instalado.**

## Matriz de builds y builder

`scripts/build-website-s4-corpus.mjs` genera proyectos sintéticos y usa toolchains oficiales en un directorio temporal separado, sin modificar dependencias del ERP. Corpus y capturas quedan ignorados en `.artifacts/website-s4/`.

| Artefacto real | Versión probada / modo | Evidencia de navegador |
|---|---|---|
| HTML/CSS/JS estáticos | Fixture MPA | HTML visible, JS ejecutado, cookie privada y chunk 404. |
| React/Vite | React 19.3.1, Vite 8.3.4; SPA | Render ejecutado desde bundle y chunk 404. |
| Vue/Vite | Vue 3.5.44, Vite 8.3.4; SPA | Render ejecutado desde bundle y chunk 404. |
| Angular | Core/compiler 22.2.4, CLI/build 22.2.5; AOT | Bootstrap AOT, root base y asset con hash; chunk 404. |
| Astro | 7.3.0, static | Inicio y ruta About; sin servidor. |
| Next | 16.4.4, Pages, output export, webpack | Inicio, hidratación interactiva del contador y About; no SSR servido. |

**Builder final: npm 0.2.4 exacto**, integridad `sha512-YEg7f9blG0o9Z7gml9EbS1HI4P8iarCmgclc2WSEMlGg72Uo6vuPpWp8qeGblIlU0tWmyQgIcrPJZmqHDqBuSg==`. No se adoptan cambios no publicados del checkout externo. Comparación dirigida: diez pruebas sobre exports (79), peers/deps, CSS/ESM, round-trip de dieciocho bloques base, seis plantillas Runly actuales y extensiones/JSON inválido. Pasaron antes de sustituir el baseline instalado 0.2.0. No se modificó esa evidencia histórica para simular un pase después de cambiar su baseline.

En Chrome visible se comprobó 0.2.0 → edición/guardado revisionado → carga 0.2.4 → edición/guardado/recarga/publicación S3 → reapertura en 0.2.0. Playwright repite guardado/recarga/publicación/reversión y preview del runtime 0.2.4. Documentos se conservan; no hay conversión masiva. El corpus histórico es el sintético/reproducible disponible y el de S1–S3, **no un inventario de documentos de clientes**.

Runtime nuevo registra rendererVersion en el artefacto/manifest junto a hashes. Los bytes de runtimes anteriores permanecen fijados por cada release; instalar 0.2.4 no recompila releases sellados anteriores con latest. Los sitios no gestionados legacy-reference usan el runtime vigente, mantienen sus advertencias y no reciben una promesa de integridad retroactiva. La reversión de contenido usa rollback S3 sin reinstalar npm ni tocar drafts. Volver al editor baseline requiere sus manifests/lock/runtime coherentes, no cambiar solo el número de paquete. El lock del ERP cambia únicamente builder y tldts; no se conservan actualizaciones laterales de resoluciones latest.

## Contratos efectivos para Claude

Las rutas existentes S1/S2/S3 siguen vigentes; estas son adiciones en `/website`, no una API v1 paralela:

| Operación | Entrada / resultado / permiso |
|---|---|
| POST `/sites/:siteId/imports` | Multipart file, routingMode mpa/spa, rootDirectory opcional; Idempotency-Key 16–200; 202 `{data:import}` con `data.id`, phase y reporte. `website.dist.upload`; empresa/sitio backend. No publica. |
| GET `/sites/:siteId/imports/:importId` | Estado/manifest/errorCode privado. Mismo permiso y scope. |
| GET `.../imports/:importId/archive` | Original verificado, descarga attachment privada con autorización. No abrir downloadUrl como un enlace público sin sesión. |
| POST `/sites/:siteId/releases` | Variante `{kind:'dist',importId,expectedDraftRevision,expectedPublicationRevision,baseReleaseId}` con clave; `pages.publish`, `site.read`, `dist.upload`. Candidato S3 listo; activar/rollback dist requieren dist.upload y gate de origen; cambiar fuente requiere site.update. |
| POST `/sites/:siteId/previews` | `{releaseId}` o comando builder con cambios/revisiones/base. `pages.read` y `site.read`; preparar borrador requiere además pages.update. Devuelve id/releaseId/url/expiresAt/readOnly/capabilities. URL es grant privado efímero. |
| DELETE `.../previews/:previewId` | Revoca sesión propia de creador, sin borrar release. Lectura de sitio/páginas y scope; resultado idempotente `{revoked:true}`. |
| POST `/sites/:siteId/dist/upload` legacy | Firma multipart conservada, dist.upload + site.update + pages.publish; requiere host aislado listo. Importa/prepara/activa por el mismo núcleo. Clave opcional: fallback derivado del contenido para clientes antiguos, con replay que no reactiva una publicación retirada; respuesta añade `publication` vigente. Un intento nuevo explícito usa otra clave/comandos modernos. |
| Historial legacy | Lista imports propios por sitio y downloadUrl administrativo autorizado; no enumera el namespace empresarial compartido ni publica Storage URLs. Borrados físicos siguen bloqueados por retención. |

SDK añade `createImport/getImport/createPreview/revokePreview` y conserva las firmas anteriores. MCP conserva sus acciones de diseño/draft/publish e historial/rollback S3; las regresiones lo verifican contra el nuevo runtime. No se inventa una herramienta MCP de subida binaria. La UI de imports/previews sigue pendiente del diseño de Claude; los fixtures de navegador **no son interfaces del producto**.

Errores: 400 multipart inválido, 403 permiso, 404 recurso opaco, 409 import_not_ready/isolation_required/idempotency_conflict/publication_conflict/preview_not_publishable, 413 tamaño/expansión/timeout/reference_budget_exceeded, 422 validación/asset_path_conflict, 429 import_capacity, 503 dependencia/integridad. Los errores no revelan secretos de Storage o nombres de otro tenant. `form_scope_unresolved` y Calendar siguen como restricciones S3, sin backfill ni reasignación de respuestas.

## Pruebas y reproducción

- PostgreSQL **81/81 en 18 y 17**: 29 S2 + 32 S3 + 20 S4. Dos conexiones, transacciones reales, rollback de migración S4 inyectado, pertenencia/RLS, concurrencia/idempotencia, red/Storage detenido y timeout, fallo antes de commit, rollback/unpublish, bindings estables, cambio de fuente sin reclasificar ejecutables y adapters REST/SDK/legacy. Runner propio con tmpfs/puerto loopback y limpieza por label; ninguna base compartida.
- Regresiones seleccionadas **267/267**: las 234 de cierre S3 más 33 casos del lector ZIP. Incluye S1, Files/Forms/capture, MCP, SDK, Catálogo, stock, Commerce guard y POS. No se modifican Commerce ni sus contratos.
- Navegador **8/8**, Playwright/Chromium 153.0.8010.12 nuevo y aislado: seis builds, aislamiento adversarial y editor/reversión/preview. [Resultado sanitizado](s4-browser-results.json). El test comprueba cookie Secure/HttpOnly/Strict host-only, fragmento retirado, ausencia de cookie/storage administrativos sintéticos, CSRF sin petición al backend, SW bloqueado, ausencia de CORS, POST de captura denegado y acceso a otra preview sin grant rechazado. El fallo previo de preview-builder se corrigió y se repitió satisfactoriamente. El control nativo de Chrome tuvo interrupciones de verificación de URL; el responsable autorizó expresamente completar con Playwright.
- Runtime compilado realmente durante cada matriz; React Doctor **100/100** sobre el archivo técnico de runtime cambiado. ESLint de los JS/MJS/JSX del bloque y whitespace satisfactorios. No se ejecutó ni publicó una imagen Docker.
- `pnpm check:privacy` ejecutado: **67 hallazgos preexistentes**, fuera del bloque. Inspección individual de los archivos modificados/nuevos: cero hallazgos; no se presenta el repositorio entero como verde.

Reproducción local (los tarballs y builds no se versionan): generar corpus con `node scripts/build-website-s4-corpus.mjs`; recuperar los tarballs oficiales 0.2.0/0.2.4 con `npm pack --ignore-scripts` en el área ignorada; asignar RUNLY_WEBSITE_BUILDER_TGZ al 0.2.4. Ejecutar `node scripts/test-website-postgres.mjs --browser` y, desde otra terminal, `node --test scripts/test-website-s4-browser.mjs`. El runner imprime la URL efímera y conserva solo su base propia mientras dura el laboratorio. Al terminar se cierra mediante el endpoint de parada del fixture. Las matrices sin navegador se ejecutan con el mismo runner sin `--browser`, añadiendo `--postgres17` para 17. Las regresiones usan la selección S3 más `website-zip-policy.test.js`.

Fuentes primarias consultadas: [yauzl](https://github.com/thejoshwolfe/yauzl), [PSL/tldts](https://github.com/remusao/tldts), [Storage create-only](https://supabase.com/docs/reference/javascript/storage-from-upload), [CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox), [Vite build](https://vite.dev/guide/build), [Angular build](https://angular.dev/cli/build), [Astro build](https://docs.astro.build/en/develop-and-build/), [Next static export](https://nextjs.org/docs/pages/guides/static-exports). Skills: Supabase, Computer Use y React Doctor. No hubo conexión a Supabase compartido; Storage se probó con adaptador/errores y disco privado temporal, no con un bucket desplegado.

## Pendientes y cierre

Pendientes explícitos: FormScope/Calendar/captura completa, preview de integraciones dinámicas, corpus real de clientes, Unicode/ZIP64 y otros artefactos no acreditados, capacidad/cotas operativas de Storage, cola si se autoriza, instalación del bucket/runtime privado, registro global entre instalaciones, DNS/TLS y dominios reales, CDN, diseño/accesibilidad/responsive e integración de frontend. Ninguno queda simulado como operativo por este cierre.

No SSH, push, despliegue, DNS/TLS públicos, compras, migraciones compartidas, edición de instalaciones external, purgas o modificaciones productivas. No se tocaron documentos de diseño de Claude ni se incorporaron sus archivos al commit. El cierre es S4 local; no implementa S5/S6 ni declara Website APTO E2E. El diseño paralelo de Claude conserva su autorización.
