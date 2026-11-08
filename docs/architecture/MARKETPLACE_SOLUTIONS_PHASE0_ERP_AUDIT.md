# Runly Marketplace & Solutions — Fase 0-B: auditoría de integración ERP

**Fecha:** 2026-11-07 · **Repositorio:** `runly-erp`, rama `main` @ `ce7409943` · **Alcance:** solo lectura de `runly-erp`.
**Estado:** propuesta para revisión. No se modificó código, no se crearon migraciones, no se tocó infraestructura, no se publicó ni se hizo push. No se ejecutó ninguna suite (el único cambio es este documento).
**Contexto obligatorio:** `MARKETPLACE_SOLUTIONS_PHASE0_AUDIT.md` (Fase 0-A, Developer Hub). Sus decisiones C-1..C-10 no se reabren; no hay conflicto técnico con ellas.

**Límites.** No se inspeccionó `runly-developer-hub` ni `runly-web`. Lo que se sabe del Hub proviene de lo que el ERP vendoriza o espeja (`website-registry-contract.js`, `catalog-v2-contract.js`) y de los runbooks de este repo. No se verificó producción. Los puntos que dependen del Hub se marcan **[verificar Hub]**.

---

## 1. Resumen ejecutivo

El ERP ya tiene casi todas las piezas de seguridad necesarias, pero **ninguno de los tres formatos de contenido está listo para consumirse desde el Marketplace tal cual**:

| Recurso | Formato y validador | Instalación desde un paquete externo | Veredicto |
|---|---|---|---|
| Studio `.runlystudio` | Maduro, cerrado, con prepare/confirm por digest, journal y cuotas | Solo por HTTP multipart autenticado de una persona; el servicio ya acepta bytes en memoria | **Casi listo.** Falta el origen Marketplace, el registro de procedencia y un ledger de instalación. El códec **no** es extraíble hoy |
| Automatización `.runly-automation.json` | Existe solo como código **de navegador** (`apps/desktop/.../automationFile.js`); la validación fuerte vive en el servidor al guardar | No hay endpoint de importación; la pausa (`enabled:false`) y la retirada de personas las hace el cliente | **Requiere servicio de importación en el servidor** y un informe de riesgos (correos externos, llamadas HTTP) |
| Website | Las plantillas son **código empaquetado en el cliente** (`apps/desktop/src/website/runlyTemplates`), no datos; no hay formato portable | El servicio de aplicar plantilla es sólido (borrador, CAS, idempotencia, release sin cambios) | **Contrato nuevo.** El ZIP estático existente NO sirve (admite JS) y no debe reutilizarse para esto |
| Módulos (catálogo v1/v2) | Estricto, firmado, con anti-rollback y revocaciones | Instalación de instancia con `core.modules.manage` | **Intacto. El feed de recursos debe ser paralelo** (confirmado E-2) |

Tres conclusiones que cambian el plan:

1. **El canal firmado Ed25519 no debe usarse para revocación ni para descarga pública.** El catálogo firmado ya lleva revocaciones dentro del snapshot con anti-rollback y caducidad. Si el feed de recursos hace lo mismo, el ERP verifica todo offline. El canal firmado queda solo para (a) descargas autorizadas de artefactos no públicos y (b) recibos opt-in. Eso minimiza lo que una clave filtrada puede hacer (§5).
2. **La clave de confianza del feed de recursos debe viajar en una versión del ERP.** Los pines de clave oficial/comunidad están compilados en el ERP y un administrador solo puede *revocar* localmente, nunca añadir (`catalog-trust-store.js`). Además la clave comunitaria de producción **todavía no existe** (`COMMUNITY_CATALOG_PUBLIC_KEYS = []`). Es un bloqueo duro para publicar recursos firmados (§4.4, §10).
3. **No existe coordinador de instalación.** Hay buenos ladrillos (recibos idempotentes, journal con *lease*, fases de instalación de módulos) pero ningún estado persistente de "instalación de kit". Se propone uno nuevo, con operaciones compensables solo para lo que el propio coordinador creó (§6).

**Ruta del documento:** `docs/architecture/MARKETPLACE_SOLUTIONS_PHASE0_ERP_AUDIT.md`.

---

## 2. Estado real y evidencia del código

### 2.1 Studio

| Tema | Evidencia | Hallazgo |
|---|---|---|
| Contrato | `docs/developers/studio-template-package.md`, `docs/developers/studio-template-package-v1.schema.json`, `apps/api/src/routes/studio/interchange/package.js` (`manifestSchema`) | ZIP + `manifest.json` + `document.json` (schema v7), objetos JSON **cerrados**: campo desconocido bloquea. Autor/procedencia/licencia son declaraciones **no verificadas**; los SHA-256 detectan corrupción, no autoría |
| ZIP | `zip.js` (yauzl + JSZip) | `mimetype` primero STORED; sin ZIP64, cifrado, data descriptors, comentario, enlaces; nunca se extrae a disco |
| Límites reales | `PACKAGE_LIMITS` (`zip.js`), doc | ZIP 64 MiB, suma descomprimida 128 MiB, entrada 10 MiB, 256 entradas, expansión 200:1, 100 recursos / 64 MiB de imágenes, imagen 8192 px y 25 MP, 24 páginas, 500 objetos/página, 2000 totales |
| Permisos | `router.js`, `service.js` (`authorize`) | `studio.view` + permiso del destino (`design` → `studio.create`, `personal` → `studio.templates.manage`, `company` → `studio.templates.publish`); imágenes exigen `files.assets.create` al importar y `files.assets.read` al exportar |
| Pipeline | `router.js` | `inspect` (sin escrituras) → `imports` (prepara, 30 min de vida) → `confirm` con `digest` + `acceptWarnings` → `DELETE` cancela. Encabezado `X-Runly-Studio-Protocol: 3`. Journal SQL `studio_interchange_job` filtrado por `company_id` **y** `actor_id` |
| Transacción | doc §"Transacción, recuperación y cuotas" | Claves de Storage registradas **antes** de escribir; confirmación crea FileAssets + destino en una transacción PostgreSQL; compensación solo de claves del journal no confirmado; confirmado nunca se compensa. 2 jobs activos/actor, 4/empresa, 128 MiB reservados/empresa, 20 preparaciones/hora/actor |
| Reglas de dominio | doc | Fuentes **no** se empaquetan: familia desconocida bloquea. IDs de páginas/objetos se regeneran. "Un paquete no actualiza ni sobrescribe registros existentes por su `packageId`" |
| Dependencias de runtime | imports de `package.js`, `zip.js`, `svg.js`, `service.js` | `sharp` (nativo), `yauzl`, `jszip`, `zod`, `fast-xml-parser` y **`apps/shared/studio/*`** (`document.js`, `pages.js`, `fonts.js`, `licenses.js`, `shape-properties.js`, `svg-geometry.js`, `gradient.js`, `abort.js`). `service.js` además depende de `../studio-document-data.js`, Prisma y el hook de Files |

### 2.2 Automatizaciones

| Tema | Evidencia | Hallazgo |
|---|---|---|
| Formato | `apps/desktop/src/modules/runly.automations/lib/automationFile.js` | `{format:"runly.automation", version:1, exportedAt, automation:{label, trigger, steps, …, enabled:false}}`; máx. 200 KiB; rechaza versión mayor |
| Dónde corre | `AutomationsList.jsx:123` | `parseFile` y `withoutPeople` son **JavaScript de navegador**. No hay ruta de importación en `apps/api/src/routes/automations-routes.js` |
| Validación fuerte | `packages/module-compiler/src/automations.js` (`validateSystemAutomation`), `POST/PUT /automations` | Se valida **al guardar**, igual que cualquier automatización; "Guardar autoriza los servicios que usa para esa empresa" (`docs/developers/automatizaciones.md`). Límite de 50 por empresa |
| Seguridad del archivo | `automationFile.js` | Sin ids, sin URL secreta de webhook (se genera al guardar), sin historial; siempre pausada; quita `approvers` y `userIds/attendeeIds` con `from:"value"` |
| Conexiones | doc, `GET/PUT /automations/http-hosts`, `/webhook-origins` | Listas **de instancia** (destinos HTTP permitidos y orígenes de webhook). Una automatización importada **no** puede alterarlas; una llamada HTTP a un host no listado falla |
| Huecos | análisis del código | (1) `enabled:false` y retirada de personas son del cliente: un instalador del servidor debe reimponerlos. (2) Solo se quitan personas; **no** se tocan correos externos (hasta 20 en `email.send`), nombres de canal de chat, ids de archivo adjunto, ids de plantilla de documento ni ids de contacto. (3) No hay hash ni procedencia |
| Dependencias | `automationFile.js` importa `keyFromName` de `runly.core/lib/automationStarters.js` (módulo de escritorio) | El archivo no es extraíble tal cual; la lógica pura debe moverse |

### 2.3 Website

| Tema | Evidencia | Hallazgo |
|---|---|---|
| Plantillas | `apps/api/src/services/website-template-service.js:1` importa `../../../desktop/src/website/runlyTemplates/index.js` (`allTemplates`: negocio, restaurante, …) | Son **código** del cliente consumido por el API (acoplamiento API→desktop). No son datos instalables |
| Aplicar plantilla | `website-template-service.js` (`apply`) | Exige `website.site.read` + `website.pages.create` (+ `website.site.update`/`website.theme.update` si trae tema, `website.pages.delete` si reemplaza, `website.forms.create` para formularios). Clave de idempotencia 16–200, `expectedRevision` (CAS), transacción con bloqueo del sitio, crea **páginas borrador**, auditoría `template.apply`, devuelve `publicReleaseUnchanged:true` |
| Documento | `website-draft-service.js` (`normalizeWebsiteDocument`) | `schemaVersion:1`, ≤2 MiB, ≤1000 bloques, ≤50 de profundidad, árbol sin huérfanos. **Preserva tipos de bloque desconocidos** ("never repair/drop") |
| Tema | `mergeTemplateTokens`, `defineTheme` de `@raulbellosom/atlas-web-builder` | Una plantilla puede sobrescribir grupos de tokens, nunca la escala |
| Formularios | `website-template-forms.js` | Marcadores `@contact`, `@newsletter` en `ContactFormBlock.props.formId`; el *apply* los enlaza con un formulario del sitio (crea o reutiliza); sin permiso se elimina el bloque |
| Marca | `website-template-branding.js`, `website-template-conform.js` | Logo por `fileId` de la empresa/sitio con MIME de imagen validado |
| Releases | `prisma/schema.prisma` `WebsiteRelease` (≈l.6741), `website-release-service.js` | Inmutables: `manifest`, `manifestHash`, `draftRevision`, `publicationRevision`, estados. Publicar es acción aparte |
| ZIP estático | `website-zip-policy.js` (`STATIC_ZIP_POLICY`), `website-import-service.js` | Importa **sitios estáticos**: acepta `html/css/js/mjs/wasm/…` hasta 100 MiB comprimido. Es contenido **ejecutable**, aislado por origen (`website-content-isolation.js`). **No es un formato de plantilla y no debe usarse para el Marketplace** |
| Activos | búsqueda en `templateNegocio.js` | Las plantillas integradas no incorporan imágenes propias: **no existe** modelo de activos de plantilla |

### 2.4 Módulos Community y catálogos

| Tema | Evidencia | Hallazgo |
|---|---|---|
| Consumidor v2 | `catalog-v2-contract.js`, `catalog-v2-service.js` | Validación **estricta por clave exacta** (`exact(...)`) en entrada (`ENTRY_KEYS`, 24 claves), snapshot (11), envelope (2), clave de confianza, publicador y revocación. **Cualquier campo desconocido invalida todo el snapshot** → E-2 confirmado |
| Dominios de firma | `RELEASE_DOMAIN`, `SNAPSHOT_DOMAIN`, `OFFICIAL_SNAPSHOT_DOMAIN`; `catalog-official-contract.js` comprueba que son distintos | Separación de dominio ya aplicada; un tercer dominio de recursos encaja |
| Confianza | `catalog-trust-store.js`, `catalog-public-key.js` | Categorías `official` / `community` / `managed`, nunca mezcladas; pines con ciclo `active/retiring/revoked`; **pines compilados en el ERP**; el admin solo revoca localmente. `role` de la clave en v2 debe ser `community` (validado) |
| Anti-rollback | `catalog-sequence.js` (`createHighWaterStore`, `domainKey`, `sequenceDecision`) | Secuencia + `previous.sha256` encadenado por dominio; caducidad `validUntil` (7 días) |
| Frescura | `DEFAULT_POLICY` en `catalog-v2-service.js` | Vista en caché hasta 30 días; para **instalar**: fresco ≤24 h, máximo 72 h; si el catálogo no responde exige confirmación explícita (`catalog_stale_confirmation_required`) |
| Revocación | `revocationFor`, `revokedInstalled` | Tipos `release`/`publisher`/`key` en comunidad; por `key+version+sha256` en oficial. Una versión revocada **no se instala**; una ya instalada **no se desinstala ni se borran datos**: se muestra advertencia con reemplazo recomendado |
| Dependencias | `dependencyPlan` | Solo declaradas; "nothing hidden is installed". Plataforma satisfecha o no; el usuario instala antes |
| Descarga | `catalog-download.js` (`readCatalogBytes`) | Anti-SSRF: resuelve DNS, rechaza IPs privadas, fija la IP validada en la conexión (incluye redirecciones), cuenta bytes sin `arrayBuffer()`, límite por defecto 25 MiB (parametrizable) |
| Instalación | `apply()` en `catalog-v2-service.js` | Resolver y verificar → consentimiento → `packageSvc.publishZip` (staging, preflight de esquema, respaldos, intercambio) → `lifecycleSvc.installModule` → grants → registra `catalog.installed.<key>` (origen, confianza, versión, sha256, secuencia). Rutas bajo `core.modules.manage` + `requireInstanceAuthority` |
| Fuentes | `SOURCE_MODES` | `runly` / `custom` / `disabled`; URL oficial fijada en `RUNLY_CATALOG_SOURCE` |

### 2.5 Integración firmada con el Hub

| Tema | Evidencia | Hallazgo |
|---|---|---|
| Implementación | `apps/api/src/services/website-registry-client.js`, `website-registry-contract.js` | Cliente Ed25519: firma `método\nruta+consulta\nmarca de tiempo\nnonce\nSHA-256(cuerpo)\nIdempotency-Key`; encabezados `x-runly-installation/-timestamp/-nonce/-signature`, `idempotency-key`; tolerancia ±300 s. El contrato **está vendorizado** del Hub ("the signature vector test pins both copies") |
| Alcance actual | cliente | Solo métodos de **nombres de subdominio**: `availability`, `status`, `list`, `claim`, `keys`, `rotateKey`, `revokeKey`, `activate`, `release`, `rename`. `call()` es genérico pero no exportado |
| Referencias opacas | `ref(kind,id)` | `sha256(installationId:kind:id)`: el Hub nunca ve ids de empresa/sitio. Es el patrón correcto para recibos |
| Custodia | `createRegistryClientFromEnv`, `.env.*.example` | Una clave por **instalación** (no por empresa). Semilla Ed25519 en `RUNLY_INSTALLATION_PRIVATE_KEY` o archivo `…_FILE` (0600). El instalador añade las variables en blanco y no las sobrescribe. Si falta configuración: cliente `null` (el ERP arranca; los subdominios de plataforma quedan deshabilitados) |
| Alta | `scripts/registry-installation-key.mjs`, `docs/deployment/website-staging-runbook.md` §3 | Se genera la clave localmente (la privada no se imprime), un **administrador de plataforma del Hub** enrola `{label, publicKey, originUrl}` y devuelve el `installationId` |
| Rotación / revocación | mismo script | `--rotate` (la anterior vale 24 h por defecto), reinicio, `--revoke-previous`. Compromiso: revocación inmediata por operador del Hub. Escritura atómica del archivo |
| Estado | `docs/deployment/website-subdomain-registry-proposal.md` | Registro e integración **probados en laboratorio**; despliegue real no autorizado |

### 2.6 Seguridad y almacenamiento del lado ERP

- Archivos de empresa: `FileAsset` (metadatos en Prisma, binario en Storage privado `runly-files`), acceso siempre vía API (`docs/05_supabase_prisma_strategy.md`). Studio crea FileAssets dentro de la transacción de confirmación; el Website valida `fileId` contra `entityId ∈ {companyId, siteId}`.
- Aislamiento por empresa: todos los journals filtran por `company_id` y `actor_id`; los servicios Website reciben `access` y validan `assertWebsiteAccess(access, companyId, permiso)`.
- Contenido ejecutable de Website: aislado en un origen independiente de `*.runly.mx` (`website-content-isolation.js`).
- **No hay ninguna credencial ni cliente del Storage del Hub en el ERP**, ni existe código que lea buckets del Hub. Esta propuesta lo mantiene así (§5, §8).

---

## 3. Matriz existe / reutilizable / falta

| Capacidad | Existe | Reutilizable | Falta |
|---|---|---|---|
| Validar `.runlystudio` | `interchange/package.js` | Sí, con refactor | Paquete compartido; ejecución en worker del Hub sin red |
| Importar Studio con consentimiento | `service.js` prepare/confirm | **Sí, tal cual** como servicio (acepta `bytes`) | Origen Marketplace (descarga verificada → `prepare`), procedencia firmada, ledger |
| Exportar Studio | `exportNativePackage` | Sí | Aviso de licencias/datos personales ya existe; falta flujo "publicar al Hub" |
| Archivo de automatización | `automationFile.js` | Lógica pura sí; archivo no | Servicio servidor de *import*, informe de riesgos, forzar `enabled:false`, limpieza ampliada, hash/procedencia |
| Validar automatización | `validateSystemAutomation` (module-compiler, **ya compartido**) | Sí | Exponerlo para validación previa sin guardar |
| Plantillas Website | Código en desktop | Servicio `apply` sí | Formato **de datos**, validador de bloques permitidos, modelo de activos, import de borrador desde paquete |
| Releases Website inmutables | `WebsiteRelease` | Sí (sin tocar) | Nada: la plantilla nunca publica |
| Consumo de catálogo firmado | v1 oficial + v2 comunidad | Patrón completo (secuencia, caducidad, revocación) | Dominio nuevo `resources`, clave pineada, rol de clave, fuente `resources` |
| Descarga segura | `readCatalogBytes` | Sí | Límite 64 MiB por tipo |
| Canal firmado con el Hub | cliente de registro | Firma, nonce, idempotencia, rotación | Métodos nuevos, alcance por instalación, clave/propósito |
| Recibos idempotentes | `drafts.receipt` (Website), `catalog.installed.*` | Patrón | Ledger unificado |
| Coordinador multi-recurso | — | Journal con lease (Studio), fases (módulos) | **Todo**: estados persistentes, DAG, sagas, reintentos |
| Dry-run | `inspect` (Studio), `preflight` (módulos) | Patrón | Dry-run de kit y de Website/Automatización |
| Paquetes compartidos | 6 (`shared-packages.release.json`) | Mecanismo de publicación | Nuevos paquetes (§7) |

---

## 4. Respuestas E-1 … E-6

### E-1 — ¿Los códecs/validadores son extraíbles como paquete `@runly-mx/*` sin dependencias del runtime ERP?

**Studio: sí, con refactor acotado; no hoy.** No hay dependencia de Prisma en el *códec* (`package.js`, `zip.js`, `svg.js`), pero sí de `apps/shared/studio/*`, que está fuera de `packages/`, no pertenece a la lista de paquetes compartidos y arrastra el catálogo de fuentes y la normalización del documento v7. `service.js` (journal, Storage, permisos) debe **quedarse** en el ERP. `sharp` es un binario nativo: el worker del Hub necesita imagen compatible (el Hub ya ejecuta `packages/validation` en contenedor aislado). Recomendación: paquete `studio-interchange` = `apps/shared/studio` + `zip.js` + `package.js` + `svg.js`, sin `service.js`/`router.js`.

**Automatizaciones: sí, es lo más fácil.** `validateSystemAutomation` ya vive en `@runly/module-compiler` (compartido). Falta mover `parseFile`/`withoutPeople`/`exportFile` a un módulo puro (hoy dependen de `keyFromName` del escritorio) y ampliar la limpieza de datos de empresa. Puede residir **dentro de `module-compiler`** (subruta `./automation-file`) para no multiplicar paquetes.

**Website: no existe validador portable.** El único validador de documentos es `normalizeWebsiteDocument` (estructura de árbol, sin lista de tipos de bloque) dentro de un servicio con Prisma. Hay que escribir el contrato (§6.4) y extraer una función pura.

### E-2 — ¿El consumidor rechaza campos desconocidos?

**Sí, en todos los niveles** (`exact(value, keys)` exige igualdad de conjunto de claves). Un campo nuevo en una entrada, snapshot, envelope, clave o revocación lanza `CATALOG_V2_INVALID` y se descarta el snapshot completo. Además la clave de confianza exige `role === 'community'` y la entrada exige `MODULE_KEY = ^custom\.…`. **El feed de recursos debe ser paralelo** (otra URL, otro dominio de firma, otra clave de secuencia en `domainKey`), exactamente como propone el Hub (C-5). Añadir `resources` al feed v2 rompería **todas** las instalaciones existentes.

### E-3 — ¿La clave de instalación es reutilizable y cómo se custodia/rota?

**Reutilizable técnicamente, no recomendable sin acotar su alcance.** Es una sola clave Ed25519 por instalación, en variable de entorno o archivo 0600, rotación con ventana de gracia, revocación inmediata por el operador del Hub. Hoy autoriza únicamente nombres de subdominio. Si se reutiliza sin más, una filtración del archivo permitiría además pedir descargas autorizadas y emitir recibos. Propuesta (§5): **mismo mecanismo y misma clave de instalación**, pero el Hub enrola por instalación una lista de *capacidades* (`registry:names`, `marketplace:download`, `marketplace:receipt`) que el operador concede explícitamente; la ausencia de capacidad responde 403 aunque la firma sea válida. Decisión de producto D-E1.

### E-4 — Contrato de instalación por tipo

| Tipo | Alcance | Permisos requeridos (verificados) | Dry-run | Idempotencia | Recibo/resultado |
|---|---|---|---|---|---|
| `module` | Instancia | `core.modules.manage` + autoridad de instancia | `preflight` existente | `expect:'install'` → 409 si ya instalado | `catalog.installed.<key>` (versión, sha256, secuencia, origen, confianza) |
| `studio_template` | Empresa o usuario | `studio.view` + `studio.templates.manage`/`.publish` o `studio.create`; `files.assets.create` si hay imágenes | `inspect` (sin escrituras) + reporte de `prepare` | Job por actor + `digest`; confirmar dos veces devuelve lo mismo | Destino creado + `packageId` (no autoritativo) |
| `automation` | Empresa | `automations.manage` | **Falta** (validar sin guardar) | **Falta** (hoy 409 por `key`) | Automatización pausada; servicios autorizados al guardar |
| `website_template` | Sitio | ver §2.3 | **Falta** | `Idempotency-Key` + `expectedRevision` | `{pages, replaced, draftRevision, publicReleaseUnchanged}` |
| `solution` | Compuesto | unión de lo anterior, comprobada **por componente** | Falta | Falta (coordinador) | Ledger local (§6) |

### E-5 — Contrato portable de Website y de Documentos

**Website:** inexistente; propuesta en §6.4. **Documentos:** no se auditó a fondo (fuera del alcance numerado); lo que consta es que `runly.documents:documents.generate` usa plantillas de la empresa. No hay formato portable; queda **sin soporte** y no debe anunciarse hasta tener contrato (alineado con el plan v1, tipos `project_template`/`dashboard`).

### E-6 — Tamaños reales de `.runlystudio`

**Límites declarados:** 64 MiB ZIP / 128 MiB descomprimido / 25 MP por imagen / 100 recursos. **Tamaños reales de plantillas de comunidad: no medidos** (no hay corpus). Evidencia indirecta: el *job* reserva 128 MiB por empresa y hay un máximo de 2 por actor, de modo que 64 MiB sostenidos son viables solo en cantidades pequeñas. El Hub corta hoy en 25 MiB (§2.3 de la Fase 0-A). Recomendación: **MVP ≤25 MiB**, que casi con certeza cubre plantillas sin fotografías pesadas, y medir con las primeras plantillas reales antes de abrir 64 MiB (D-5 del Hub). `readCatalogBytes` ya acepta `maxBytes`, así que el cambio en el ERP es un parámetro por tipo, no código nuevo.

---

## 5. Propuesta de contratos de integración

### 5.1 Principios

1. **El Marketplace es un *origen* de bytes; la instalación sigue siendo el servicio propietario del recurso.** Ningún componente del Hub escribe en el ERP.
2. **Dos canales separados.** (a) *Feed firmado de recursos*: público, verificable offline, lleva revocaciones. (b) *Canal de instalación firmado* (Ed25519 ya existente): solo descargas no públicas y recibos.
3. **Nada de credenciales cruzadas.** El ERP nunca recibe ni usa claves de Storage del Hub; el Hub nunca recibe claves de `runly-files`. Las descargas privadas se entregan por la API del Hub tras comprobar firma de instalación, capacidad y estado vigente del release; el ERP verifica **SHA-256 y firma del feed** de los bytes recibidos antes de pasarlos a un servicio.
4. **El ERP no persiste confianza que el Hub pueda cambiar en caliente.** La clave que firma el feed está pineada en una versión del ERP.

### 5.2 Feed de recursos (consumidor ERP)

- Nueva función `createResourceCatalogService` análoga a `loadCommunity`: mismas reglas de secuencia, `previous`, `validUntil` ≤7 días, frescura 24/72 h, vista en caché 30 días, revocaciones por `release`/`publisher`/`key`.
- Dominio de firma propio (p. ej. `runly.catalog.resources.v1.release\n` y `…snapshot\n`), añadido a la comprobación de colisión de `catalog-official-contract.js` (hoy exige 3 dominios distintos; pasaría a 4).
- Clave de confianza `role:'resource'`, nueva categoría en `catalog-trust-store.js` que no puede solaparse con las existentes. Pin en el ERP; revocación local permitida, promoción no.
- Entrada de recurso (cerrada, `exact`): `type`, `resourceKey`, `version`, `releaseId`, `sha256`, `size`, `packageUrl` (`packages/<sha256>` relativo, nunca absoluto), `publisher`, `status`, `publishedAt`, `title`, `description`, `license`, `compatibility` (`runly` min/max + contratos del tipo), `requirements` (módulos, fuentes, permisos), `provenance`, `signature`, `keyId`. **[verificar Hub]** nombres finales; el ERP valida lo que el Hub emita, pero un solo lado debe poseer el esquema (propuesta: Hub produce, ERP vendoriza con *vector test*, como `registry`).
- `compatibility.contracts.<tipo>` = versión del *formato* que el ERP sabe leer (`studio: 1`, `automation: 1`, `website: 1`). Un recurso con formato mayor aparece como "requiere actualizar Runly", nunca se intenta.

### 5.3 Canal de instalación firmado (extensión de `website-registry-client`)

Reutilizar `signingString`, `HEADERS`, nonce, ±300 s e idempotencia **sin cambios**. Añadir un cliente hermano `createMarketplaceInstallClient` que comparta la clave y la función `call` (hoy privada: exportarla o extraerla) con métodos:

| Operación | Firma | Propósito |
|---|---|---|
| `GET /installations/v1/downloads/:releaseId` | Sí | Autoriza y entrega un artefacto **no público**; el Hub comprueba que el release esté vigente y no revocado |
| `POST /installations/v1/receipts` (`Idempotency-Key`) | Sí | Recibo opt-in, sin datos de empresa (§6.6) |
| (no se añade) revocaciones | — | Viajan en el feed firmado, no por este canal |

Salvaguardas para no ampliar permisos por accidente: capacidades por instalación en el Hub (E-3), prefijo de ruta propio (`/installations/v1`, nunca `/registry/v1`), pruebas negativas (una firma válida sin capacidad responde 403) y alertas de uso anómalo. La ausencia de configuración deja el cliente en `null`: **el Marketplace público funciona sin clave de instalación**.

### 5.4 Studio

Flujo en el ERP: lista del feed → descarga con `readCatalogBytes(maxBytes por tipo)` → verificar SHA-256 y firma del feed → `interchange.inspect(bytes)` → mostrar reporte (páginas, fuentes con `available:false`, licencias, advertencias) más la **procedencia firmada del feed** → destino elegido por la persona → `interchange.prepare(companyId, actorId, bytes, PACKAGE_MIME, {target,name}, …)` → `confirm(digest, acceptWarnings)`.

Cambios mínimos: (1) ruta nueva `POST /studio/interchange/marketplace/:releaseId/prepare` que descargue y verifique en el servidor (el navegador **no** debe subir bytes que dice haber obtenido del Marketplace); (2) guardar en `studio_interchange_job` un `source` (`marketplace` + `releaseId` + `sha256`) para trazabilidad; (3) el aviso de licencias `redistribution:'forbidden'` ya bloquea; el Hub debe repetirlo en su revisión; (4) las fuentes desconocidas **bloquean**: el feed debe declarar `requirements.fonts` para que la ficha lo muestre antes de instalar.

### 5.5 Automatizaciones

Servicio nuevo `automationImport` (servidor):

1. `inspect(bytes)`: parsea con la función pura compartida, valida con `validateSystemAutomation`, **no guarda**.
2. Informe de riesgos obligatorio, mostrado antes de confirmar: servicios que se autorizarán (`automationConsumes`), llamadas HTTP y si su host está permitido, correos con direcciones externas, destinatarios, canal de chat, adjuntos, documentos y reportes, y bloques de aprobación.
3. `confirm`: guarda siempre con `enabled:false` (reimpuesto en servidor), sin personas, sin ids de archivo/contacto/plantilla de otra empresa, con `key` libre; autoriza servicios **solo con consentimiento explícito de la persona**; escribe auditoría con `releaseId` y `sha256`.
4. Activarla es una acción separada ("no activar automatizaciones por defecto", plan §7.7).

Decisión técnica: eliminar de la importación de Marketplace los destinos de correo **externos** y exigir que la persona los vuelva a elegir (como ya ocurre con las personas), o mostrarlos como "incluidos por el autor" con confirmación individual (D-E4).

### 5.6 Contrato portable de Website (nuevo, propuesta)

Paquete declarativo **JSON o ZIP sin código**, `format:"runly.website-template"`, `formatVersion:1`:

- `manifest`: título, autor, procedencia (no verificada), `builderVersion` mínima de `@raulbellosom/atlas-web-builder`, `locales`, `requirements` (formularios, módulos opcionales), licencias.
- `pages[]`: `{id, label, routePath, document}` donde `document` es el documento del builder con `schemaVersion:1`; **lista cerrada de tipos de bloque** por versión de builder (a diferencia de `normalizeWebsiteDocument`, que preserva desconocidos).
- `theme`: `tokens` por grupo; nunca la escala (regla actual de `mergeTemplateTokens`).
- `forms[]`: solo marcadores (`@contact`, `@newsletter`) o definiciones declarativas; el *apply* los enlaza como hoy. Sin ids, sin destinatarios, sin integraciones.
- `assets[]`: imágenes optimizadas por hash, con los mismos controles de Studio (MIME real, 25 MP, sin animación); se materializan como `FileAsset` del **sitio** dentro de la transacción de aplicar, con journal como Studio. Las referencias del documento son `asset:<sha256>`, nunca URLs.
- **Prohibido:** JS, HTML crudo, CSS arbitrario, SVG activo, `iframe`, URLs externas de scripts/estilos, `wasm`, fuentes remotas. Enlaces y medios externos como **datos** que el reporte lista.

Instalación = el servicio `apply` existente con un origen distinto de `allTemplates`: crea **borradores**, `publicReleaseUnchanged:true`, auditoría, sin publicar. Reutilizable: idempotencia, CAS, conflictos de ruta (`route_conflict`), reemplazo con permiso, tema, marcadores de formulario, marca. Nuevo: validador puro, lista de bloques, activos, informe, origen, extracción de `allTemplates` a datos (y, de paso, quitar el import `API → desktop`).

---

## 6. Runly Solutions: contrato de instalación

### 6.1 Manifiesto (lado Hub; lectura en ERP)

Cada componente referencia **`releaseId + sha256`**, no solo semver: `{id, resourceKey, releaseId, sha256, type, scope, required, dependsOn[], parameters{}}`. Los parámetros son datos neutrales (`business_name`, `site_ref`) y **nunca** ids de empresa. El ERP rechaza un manifiesto cuyos hashes no coincidan con el feed firmado.

### 6.2 Alcance de instalación

| Alcance | Tipos | Selección | Autorización |
|---|---|---|---|
| Instancia | `module` | Administrador de instancia | `core.modules.manage` + autoridad de instancia (flujo de módulos existente) |
| Empresa | `studio_template`(company), `automation`, documentos | Empresa activa | Permisos del módulo propietario (§5.4–5.5) |
| Usuario | `studio_template`(personal), `design` | La persona que instala | `studio.templates.manage` / `studio.create` |
| Sitio | `website_template` | Sitio elegido (parámetro `site_reference`) | Permisos Website del §2.3 |

Regla: **el coordinador nunca eleva privilegios.** Ejecuta cada componente con la identidad y el contexto activo de la persona; si falta un permiso, el componente queda `blocked` y se aplica la regla obligatorio/opcional.

### 6.3 Resolución y dry-run

1. Recuperar manifiesto + feed (verificado, fresco). 2. Resolver el DAG por `dependsOn`; ciclos → rechazo. 3. Por componente: compatibilidad (`runly`, contratos, fuentes, módulos requeridos), revocación, licencia, formato soportado, permisos. 4. Simular con `inspect`/`preflight` de cada servicio (sin escrituras). 5. Mostrar plan: qué se crea, dónde, qué se omite, qué advertencias requieren aceptación individual y los efectos externos (correos, HTTP, publicación = **ninguno por defecto**). Un componente opcional con problema se marca `skipped_recommended`; uno obligatorio detiene la instalación **antes** de escribir nada.

### 6.4 Coordinador persistente (no transaccional)

No existe una transacción posible entre módulos, Storage y Website. Se propone una máquina de estados guardada en PostgreSQL con dos tablas del núcleo del ERP (Prisma, migración **hacia adelante**, no RME3): `marketplace_installation` y `marketplace_installation_step`.

```
installation: planned → approved → running → completed
                                     ├→ partial          (opcionales fallidos; obligatorios aplicados)
                                     ├→ failed           (obligatorio falló; compensado lo compensable)
                                     └→ cancelled
step:         pending → prepared → applied
                          ├→ failed → compensated | needs_attention
                          └→ skipped | blocked
```

- **Idempotencia:** clave por `(instalación, componente, releaseId)` + `Idempotency-Key` hacia cada servicio. Reintentar reanuda desde el primer paso no aplicado. Una segunda instalación del mismo `releaseId` en el mismo destino exige confirmación explícita (hoy un paquete Studio repetido crea un duplicado; no hay deduplicación por `packageId`).
- **Concurrencia:** *advisory lock* por instalación/sitio (patrón `drafts.lockSite`), 1 instalación activa por destino, *lease* con caducidad para recuperar tras un fallo del proceso (patrón `studio_interchange_job`).
- **Instalación parcial y recuperación:** cada paso se registra *antes* de ejecutarse (intención) y *después* (resultado con los ids creados). Reanudable tras reinicio. El estado `partial` es válido y visible, no un error silencioso.
- **Compensación segura:** solo para lo que **este coordinador** creó y que nadie ha tocado: páginas borrador del sitio (soft-delete con `enabled:false`, como ya hace el reemplazo de plantillas), diseño/plantilla Studio creado y sin ediciones (soft-delete), automatización pausada creada. **Nunca** se desinstala un módulo, nunca se borran datos de la empresa, nunca se compensa un destino editado después. Lo que no se puede deshacer pasa a `needs_attention` con instrucciones.
- **Orden recomendado:** módulos (instancia) → Studio → documentos → Website (borrador) → automatizaciones (pausadas). Los módulos son lo menos reversible y lo único con efecto de instancia: se piden primero y con su propio consentimiento.

### 6.5 Opcionales vs obligatorios

`required:true` falla → la instalación termina `failed` y compensa lo compensable. `required:false` falla → `partial`, se informa y puede reintentarse sin tocar lo ya aplicado. Un opcional cuya dependencia obligatoria no se aplicó se omite.

### 6.6 Recibos

- **Ledger local** (completo, solo en el ERP): ids de destino, nombres, estados, errores. Sirve para actualizar, advertir por revocación y soporte. Nunca sale de la instalación.
- **Recibo al Hub** (opt-in, mínimo): `{installationRef, solutionReleaseId, componentReleaseIds+sha256, estado por componente, timestamps, código de error}` con `installationRef = sha256(installationId:marketplace:…)` (patrón `ref()`). Sin empresa, sitio, nombres, conteos de registros, ni IP/UA. La clave de idempotencia evita duplicados.

### 6.7 Actualización y revocación

- **Actualizar** = nuevo plan que compara el `releaseId` instalado (ledger) con el publicado. Studio/Website/automatizaciones **no sobrescriben**: se crean nuevas copias en borrador y la anterior queda marcada como reemplazada (consistente con "un paquete no actualiza registros existentes"). Módulos usan el flujo `update` existente.
- **Revocación** (por feed): bloquea nuevas instalaciones y reaplicación; el ledger marca "instalado con advertencia" y recomienda reemplazo, igual que `installedWarning` en módulos. **Nada se elimina a distancia.** Una automatización procedente de un release revocado muestra advertencia antes de activarse. La frescura exigida para instalar reutiliza 24/72 h.

---

## 7. Paquetes compartidos `@runly-mx/*`

Hoy (`shared-packages.release.json`): `core`, `module-engine`, `module-compiler`, `ui`, `sdk`, `preview-runtime`; esquema de versión `<base>-source.<sha completo>`, registro GitHub Packages restringido; verificados por consumidor aislado (`2026-10-12-shared-consumer-verification.md`; scripts `shared-package-release.mjs`, `verify-shared-consumer.mjs`). Los paquetes son **código fuente JS**, sin paso de compilación propio.

| Candidato | Dónde | Dependencias | Esfuerzo | Nota |
|---|---|---|---|---|
| `automation-file` | Subruta de `module-compiler` | `module-compiler` (existente) | Bajo | Mover lógica pura; el escritorio y el servidor la importan |
| `studio-interchange` | **Paquete nuevo** (séptimo) | `sharp`, `yauzl`, `jszip`, `zod`, `fast-xml-parser` + `apps/shared/studio` reubicado | Medio | Requiere mover `apps/shared/studio` a `packages/`; el catálogo de fuentes viaja con él; el Hub necesita imagen con `sharp` |
| `website-template` | Paquete nuevo o subruta de un paquete de website | `@raulbellosom/atlas-web-builder` (lista de bloques) | Medio | Contrato nuevo; versión del builder en compatibilidad |
| Contratos de cable (`registry`, catálogo, recursos) | **Se quedan en el Hub** y el ERP los vendoriza con vectores | — | — | Mantener el patrón actual; evita dependencia circular (el Hub ya consume paquetes del ERP) |

Reglas: el Hub **no** reescribe validadores; los consume del mismo paquete que usa el ERP. Cualquier cambio de formato incrementa `formatVersion` y conserva el lector anterior. La publicación no se hace en esta fase.

---

## 8. Riesgos

| # | Riesgo | Sev. | Mitigación |
|---|---|---|---|
| R1 | Añadir campos al feed v2 inutiliza **todas** las instalaciones (`exact`) | Alta | Feed paralelo; prueba con el consumidor real |
| R2 | La clave del feed de recursos va pineada: sin release del ERP no hay confianza, y la clave comunitaria de producción aún no existe | Alta | Planificar ceremonia de claves y release del ERP antes de publicar; probar con claves inyectadas |
| R3 | Reutilizar la clave de instalación amplía su poder (descargas, recibos) | Media-Alta | Capacidades por instalación en el Hub, rutas propias, pruebas 403, canal opcional |
| R4 | Importar Website por el camino de ZIP estático introduce JS/WASM | Alta | Contrato declarativo, lista cerrada de bloques, prohibiciones explícitas (§5.6) |
| R5 | `normalizeWebsiteDocument` preserva bloques desconocidos | Media | Validador estricto solo para paquetes externos |
| R6 | Automatización con correos externos o HTTP activada sin revisión | Alta | Informe obligatorio, forzar pausa en servidor, activación separada |
| R7 | Guardar una automatización autoriza servicios para la empresa | Media | Consentimiento explícito por servicio; mostrar `automationConsumes` |
| R8 | Studio descarga fuentes/íconos con licencia desconocida | Media | `redistribution:'forbidden'` bloquea; el Hub revisa; `unknown` exige advertencia aceptada |
| R9 | Subir desde el navegador "bytes del Marketplace" sin verificación | Media | Descarga y verificación siempre en el servidor del ERP |
| R10 | Doble instalación y duplicados (sin deduplicación por `packageId`) | Media | Ledger + confirmación + bloqueo por destino |
| R11 | Tamaño de 64 MiB frente a 25 MiB del Hub | Media | MVP 25 MiB, `maxBytes` por tipo |
| R12 | Divergencia de las copias vendorizadas del contrato | Baja-Media | Vectores de prueba en ambos repos (ya es la práctica) |
| R13 | Acoplamiento `API → desktop` en plantillas Website | Baja | Resolverlo al convertir plantillas en datos |
| R14 | Telemetría de recibos revela clientes | Media | Opt-in, `installationRef` hash, sin datos de empresa, retención definida |

---

## 9. Dependencias del Developer Hub

1. Esquema y dominio de firma del feed de recursos; emisión de revocaciones; política de caducidad (≤7 días).
2. Ceremonia de claves y entrega de la clave pública para el pin del ERP.
3. Capacidades por instalación en `registry_installations` y endpoints `/installations/v1/{downloads,receipts}`.
4. Validación de los tres formatos con **los mismos paquetes compartidos** del ERP (§7); imagen del worker con `sharp`.
5. Límite de tamaño por tipo (D-5 del Hub) y ruta de descarga autenticada para artefactos >25 MiB si se decide.
6. Procedencia y licencias en la entrada firmada (el ERP no puede verificarlas desde el paquete).
7. Manifiesto `runly.solution` con `releaseId+sha256`.
8. Estado real de producción de claves/flags **[verificar Hub]**.

## 10. Decisiones pendientes del propietario del producto

| ID | Pregunta | Recomendación |
|---|---|---|
| D-E1 | ¿Capacidades por instalación o una segunda clave para el Marketplace? | Capacidades; segunda clave solo si se exige separar la custodia |
| D-E2 | ¿El Marketplace público puede funcionar sin clave de instalación? | Sí (feed público + verificación local); la clave habilita privados y recibos |
| D-E3 | ¿Recibos al Hub: apagados, opt-in por instancia u obligatorios? | Opt-in por instancia, apagado por defecto |
| D-E4 | Correos externos en automatizaciones importadas: ¿se descartan o se confirman uno a uno? | Descartar por defecto; mostrar como sugerencia |
| D-E5 | ¿Website admite imágenes embebidas en el MVP? | Sí con los controles de Studio; si no, plantillas sin imágenes propias y marcadores |
| D-E6 | ¿Qué hace "actualizar" un recurso ya instalado? | Nueva copia en borrador + marcar anterior como reemplazada; sin sobrescritura |
| D-E7 | ¿Extraer `apps/shared/studio` a `packages/` ahora o esperar a la Fase 3? | Antes de que el Hub valide Studio (Fase 2 del Hub) |
| D-E8 | ¿Documentos portables en el primer kit? | No; sin contrato, no se anuncia |
| D-E9 | Un solo paquete `studio-interchange` o dos (formato / servicio) | Un paquete de formato; el servicio se queda en el ERP |

## 11. Fases recomendadas (ERP)

| Fase | Contenido | Depende de |
|---|---|---|
| **E0** (esta) | Auditoría | — |
| **E1 — Contratos y paquetes** | Cerrar esquema del feed de recursos y vectores; extraer `automation-file` y `studio-interchange`; definir `website-template` v1 (solo especificación y validador) | Hub 0.5 |
| **E2 — Consumidor de recursos** | `createResourceCatalogService` (secuencia, caducidad, revocación), categoría de clave `resource`, descarga acotada, pruebas con claves inyectadas; **sin pin de producción** | E1 |
| **E3 — Instaladores individuales** | Studio desde Marketplace (servidor), servicio de importación de automatizaciones con informe, Website `apply` desde datos | E2 |
| **E4 — Canal de instalación** | Cliente hermano, capacidades, descarga privada y recibos opt-in | Hub: capacidades |
| **E5 — Coordinador de Solutions** | Tablas, DAG, dry-run, sagas, reanudación, UI de asistente | E3 |
| **E6 — Producción** | Pin de clave real en un release del ERP, gate integral | Ceremonia de claves |

Cada fase se entrega con un solo expediente de verificación (SHA, pruebas dirigidas, riesgos residuales). Nada de lo anterior incluye migraciones ni despliegues sin autorización posterior.

## 12. Pruebas necesarias (sin baterías redundantes)

Una vez por fase, en su expediente:

- **Contratos (E1/E2):** vectores de firma y de snapshot compartidos con el Hub; rechazo de campos desconocidos en cada nivel; colisión de dominios (4); anti-rollback, caducidad y revocación del feed de recursos; el consumidor v1/v2 sigue pasando intacto (`catalog-v2.test.js`, `catalog-marketplace.test.js`, `catalog-security.test.js`).
- **Studio (E3):** paquete hostil (zip bomb, MIME falso, recurso faltante, fuente desconocida, licencia `forbidden`), dos empresas / dos actores (un job ajeno responde 404), cuota y expiración, confirmar dos veces.
- **Automatizaciones (E3):** importar siempre pausada, con personas y ids ajenos retirados, host HTTP no permitido, correo externo, versión futura, 200 KiB+, límite de 50.
- **Website (E3):** bloque desconocido rechazado, JS/HTML/URL externa rechazados, conflicto de ruta, reemplazo sin permiso, idempotencia, `expectedRevision` obsoleto, `publicReleaseUnchanged`.
- **Canal firmado (E4):** firma válida sin capacidad → 403, repetición de nonce, deriva de reloj, rotación y revocación de clave.
- **Solutions (E5):** ciclos, componente revocado, permiso insuficiente, fallo a mitad, reanudación tras reinicio simulado, compensación que no toca datos editados, dos instalaciones concurrentes sobre el mismo sitio, recibo sin identificadores de empresa.
- **E2E de navegador:** solo en el gate previo a producción o si cambian auth/ruteo/sandbox. No se ejecutó ninguna en esta auditoría.

---

## 13. Anexo: evidencia consultada

`docs/developers/studio-template-package.md` · `apps/api/src/routes/studio/interchange/{router,service,package,zip,svg}.js` · `apps/shared/studio/*` · `packages/sdk/src/domains/studio.js` · `apps/desktop/src/modules/runly.automations/lib/automationFile.js` · `apps/desktop/src/modules/runly.automations/screens/AutomationsList.jsx` · `apps/api/src/routes/automations-routes.js` · `packages/module-compiler/src/automations.js` · `docs/developers/automatizaciones.md` · `apps/api/src/services/website-{template,draft,import,release,zip-policy,resource-policy,content-isolation}-service.js` y `website-template-{forms,branding,conform}.js` · `prisma/schema.prisma` (`Website*`) · `apps/api/src/services/catalog/{catalog-v2-contract,catalog-v2-service,catalog-official-contract,catalog-trust-store,catalog-public-key,catalog-sequence,catalog-download}.js` · `apps/api/src/routes/catalog-routes.js` · `apps/api/src/services/website-registry-{client,contract}.js` · `scripts/registry-installation-key.mjs` · `docs/deployment/{website-subdomain-registry-proposal,website-staging-runbook}.md` · `infra/installer/.env.{external,local}.example` · `shared-packages.release.json` · `docs/architecture/2026-10-12-shared-consumer-verification.md`.

**No verificado:** estado real de producción del Hub; tamaños reales de plantillas; contrato de Documentos; comportamiento de la UI de Studio/Website al recibir un origen Marketplace (no existe); que las suites actuales pasen (no se ejecutó ninguna); el contenido exacto de `catalog-service.js` v1 más allá de lo citado.
