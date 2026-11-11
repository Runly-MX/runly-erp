# Elevate Wellness: auditoría y propuesta de Website Template

Fecha: 2026-11-11. Estado: propuesta técnica; no es un paquete instalable ni una certificación de publicación. No se modificó código productivo, configuración, H7, releases ni datos del Hub.

## Evidencia y alcance de la entrega

- ERP inspeccionado: `9bdaf1c946bab06fb53b2798362c180a0b83dda9`.
- Hub inspeccionado: `f0559dee2ff2c6292ca9a0b6b1ca8d7ce0cd87d3`.
- MCP: existe `website.elevate-wellness`, tipo `website_template`, revisión 1, locale `en`, licencia declarada `MIT`; no tiene archivos, validaciones ni reviews. El validador remoto informa disponibilidad para Website. Esto no identifica el digest del validador remoto ni certifica su despliegue.
- La descripción del recurso habla de una **landing** con hero editorial, servicios, programas, nutrición, agenda de eventos, testimonios y CTA. No demuestra la existencia de otras páginas ni de comportamientos EN/ES.
- Se recuperaron `Elevate-Wellness-Website-Editable.zip` y `Elevate-Wellness-Assets-Runly.zip`, indicados por el propietario. Los 22 archivos del ZIP de assets ya existen idénticos por bytes en el ZIP del sitio. Separarlos era una duplicación de entrega, no una necesidad del formato. Se preservaron ambos originales sin modificarlos.
- Entrega A: se conservó la landing completa con sus fotografías, SVG y estilos; revisión en Chromium a 360, 390, 768 y 1440 px sin desbordamiento horizontal, imágenes rotas, solicitudes externas ni errores JS. En 390 px se comprobaron menú, Escape, cambio EN/ES y formulario offline. Capturas nuevas y resultados estructurados acompañan la entrega unificada. No se equipara esta prueba local con una importación Atlas.
- El editor HTML preexistente se conservó en `historical-editor/`, fuera del prototipo activo. No se creó otro constructor. La entrega reúne `prototype/`, `historical-editor/` y `audit/` en un único ZIP claramente identificado como prototipo y auditoría, no Website Template instalable.
- B y C se basan ahora en el código y capturas originales: una página `/`, ocho secciones principales más cabecera/pie y modal. `audit/declarative-proposal.json` contiene alternativas EN y ES de secciones v1 con referencias de assets reales, y una lista explícita de diferencias que requieren catálogo/bindings. No es un manifiesto válido ni un ZIP nativo: conserva los impedimentos en lugar de ocultarlos.

Las fechas de los nombres de migraciones citadas son identificadores del repositorio; no prueban cuándo se desplegaron.

## Contrato real del ZIP

Fuente normativa: `packages/studio-interchange/src/website-template.js`, export `@runly/studio-interchange/website-template`. `websiteManifestSchema` es cerrado; `validateWebsiteTemplate(bytes, { builderCatalogs, limits })` devuelve `ok`, errores, advertencias, manifiesto, reporte y SHA-256. No ejecuta el paquete.

```text
mimetype                application/vnd.runly.website-template+zip
manifest.json           format: runly.website-template, formatVersion: 1,
                        minReaderVersion: 1
pages/home.json         array de { type, props, children? }
theme.json              opcional: colors, fonts, radius, spacing
assets/<sha256>.webp    estructura prevista, bloqueada por la política actual
licenses/<id>.txt       textos de licencia inventariados
previews/<nombre>.png   capturas; no sustituyen imágenes de las páginas
```

`manifest.builder` exige `name: @raulbellosom/atlas-web-builder`, `min` y `catalogDigest`. Aunque el campo se llama `min`, la implementación busca **exactamente** `builderCatalogs[manifest.builder.min]`; no resuelve rangos semver. El digest es SHA-256 del JSON canónico con claves ordenadas, no del archivo de texto.

`pages` declara `path`, `file`, `title`, `isHome`; exactamente una home en `/`, rutas y archivos únicos. El documento de cada página es un array de secciones, **no** el objeto `Page` que guarda Atlas. Los hijos se asignan por slots declarados: `children: { children: [...] }` en `SectionBlock`, `ContainerBlock` o `GridBlock`. No hay campo libre de CSS, clases, scripts ni HTML completo. `RichTextBlock.html` admite únicamente el subconjunto sanitizado de texto enriquecido del contrato.

`document.files` inventaría todos los archivos salvo `mimetype` y `manifest.json`, con bytes y SHA-256. No se admite ninguna entrada extra. Los activos requieren `id: asset-<sha256>`, ruta por hash, mime PNG/JPEG/WebP, dimensiones, bytes, hash y licencia; la referencia de una prop imagen es `asset:<sha256>`. No se admiten URLs externas como imágenes. SVG, GIF, AVIF, fuentes y vídeo no son activos portables admitidos por v1, aunque otros flujos del ERP puedan admitir algunos de ellos.

Límites actuales: 25 MiB comprimidos, hasta 128 MiB expandidos sujetos también a `PACKAGE_LIMITS`, 256 entradas, 24 páginas, 300 bloques por página, 1500 totales, profundidad de bloques 6, JSON de hasta 4 MiB por archivo. Hasta 6 previews PNG de 1 MiB y lado máximo 1920. El tope efectivo de assets es **0**; el techo técnico configurable es 100 y 64 MiB agregados, no una autorización para abrirlos.

`theme.json` usa tokens de color hex y fuentes de `STUDIO_FONTS`; no es el objeto completo `theme.tokens` de Atlas. La adaptación entre ambos debe ser explícita y verificable. La licencia MIT en los metadatos del recurso no acredita derechos sobre fotografías, logotipos o fuentes originales.

## Inventario de bloques y recursos (B)

El catálogo del ERP `apps/api/src/routes/website/block-catalog.json` y el snapshot del Hub `packages/contracts/website-builder-catalogs/0.3.5.json` coinciden: **148 bloques**, digest `0e6f77787d7351448f05dc87af8b1f2bb701170a1077eacc76633d548216d248`.

No son 148 componentes incluidos en el paquete Atlas. El catálogo combina `baseBlocks` del paquete con los grupos Runly de `apps/desktop/src/website/runlyBlocks/index.js`. Un JSON de catálogo describe props y slots, pero no contiene sus renderers React. Importar únicamente Atlas en el Hub dejaría sin renderizar los bloques Runly.

| Sección descrita | Representación existente | Recursos que conservar | Límite o extensión pendiente |
|---|---|---|---|
| Cabecera | `NavbarBlock`: brand, logoSrc, links, ctaLabel, ctaHref, sticky, mobileBreakpoint | Logo original y enlaces | No hay prop de selector de idioma ni traducciones; comprobar identidad y navegación al ver el original |
| Hero editorial | `HeroBlock` o `ShowcaseHeroBlock`: título, subtítulo, CTA e imagen | Fotografía principal, encuadre y texto | Composición editorial exacta, máscaras o superposiciones requieren comparar el diseño; `SpaHeroBlock` no sustituye una fotografía, dibuja su propia escena |
| Progreso y prueba social | Textos estáticos y `StatsBlock` o composición base | 72 %, 12/16, 480 min, 8.6/10, cuatro métricas y tres retratos | La tarjeta flotante con anillo y barras requiere variante de hero de confianza; no hay datos de usuario conectados |
| Servicios | `ServicesGridBlock`; alternativamente `GridBlock` + bloques base | Textos, iconografía y fotos si existen | `services` es texto estructurado por líneas, no objetos arbitrarios; validar su gramática con el renderer |
| Programas | `SectionBlock` + `GridBlock` + `HeadingBlock`, `TextBlock`, `ImageBlock`, `ButtonBlock`; `PricingBlock` si hay planes | Fotos, nombres, descripciones y precios originales | Las tarjetas complejas podrían requerir variante del catálogo; compra/inscripción no resulta de un enlace decorativo |
| Nutrición | `SplitFeatureBlock`: imageSrc, imageAlt, body, CTA | Imagen original, textos y recorte | Plan nutricional personalizado o captura conectada requieren contrato funcional independiente |
| Agenda visual | `HeadingBlock` + `GridBlock` + `TextBlock` + `ButtonBlock` | Fechas y tarjetas originales, fotos si existen | Solo contenido estático. No hay bloque de eventos portables ni contrato de fuente de agenda en v1 |
| Testimonios | `TestimonialsBlock` o `TestimonialBlock` | Citas, autoría autorizada y retratos | `TestimonialBlock.avatarSrc` sí es imagen; confirmar si la composición original cabe en sus variantes |
| CTA final | `CtaBannerBlock` o `SectionBlock` + `ButtonBlock` | Texto e imagen si existen | Revisar destino real; no simular confirmaciones de reserva |
| Contacto / newsletter, si están en el original | `ContactFormBlock` con `@contact` / `@newsletter` | Diseño, texto legal y consentimiento | Marcadores válidos; no transportan webhook, correo de destino ni ID de formulario |
| Pie | `SiteFooterBlock` o `FooterBlock` | Marca, enlaces legales y redes | Confirmar enlaces y páginas existentes, sin fabricar rutas |

Todos los bloques propuestos arriba pertenecen a `base` o `universal` y pueden entrar en `siteKind: website`. `BookingFormBlock` pertenece a `bookings`; cambiar solo el tipo de sitio no crea calendario ni disponibilidad.

Inventario comprobado: 16 activos originales, 14 WebP y dos SVG (marca/favicon), más tres previews WebP. Doce fotografías/retratos se usan en la página; `catalog-cover.webp` y `concept-reference.webp` son referencias, no secciones que haya que aplanar. Se verificaron los 16 hashes del inventario original. La entrega incluye dimensiones, uso y referencias `asset:<sha256>` calculadas. La procedencia original declara derivados de una imagen generada y retratos sintéticos: es una declaración conservada, no una verificación independiente de derechos. Las citas y cifras son ficticias.

Asignación de imágenes: hero/miniatura del teléfono → `hero-wellness.webp`; servicios → `training.webp`, `nutrition-card.webp`, `recovery.webp`; nutrición → `nutrition-feature.webp`; clases → `yoga.webp`, `stretching.webp`, `strength.webp`, `mobility.webp`; testimonios y avatares del hero → los tres `testimonial-*.webp`. El prototipo usa una pila tipográfica de sistema, sin descargar fuentes externas. Los SVG originales y previews WebP no cumplen sus categorías nativas v1: preservar originales y preparar derivados raster/PNG solo dentro de un flujo autorizado, sin abrir SVG arbitrario en el validador.

No colocar imágenes como URLs dentro de campos de texto para sortear `asset_limit`. Las capturas de preview son otra categoría y no resuelven este bloqueo.

Diferencias visuales comprobadas: el hero tiene tarjeta de progreso flotante, avatares y figura radial; servicios y clases usan tarjetas con fotos y distintivos superpuestos; nutrición superpone una checklist a la foto; la agenda tiene filas de fecha/duración/modalidad; testimonios tienen carrusel; el CTA incluye un teléfono inclinado con miniatura de la misma landing. Los bloques base conservan contenido e imágenes, pero no esa composición exacta. `ServicesGridBlock` ni siquiera declara imágenes por servicio. Añadir variantes de confianza de esos patrones, reutilizando composición base cuando sea fiel, además de anclas explícitas. El contrato actual de `SectionBlock` no tiene `id` de ancla; que `#classes` sea admitido como enlace no crea el destino DOM. Cada extensión vive en el catálogo compartido, nunca como JS dentro de la plantilla.

## Representación declarativa por página (C)

El original confirma una sola landing. Propuesta para `pages/home.json`, ruta `/`, `isHome: true`, locale principal `en`, en el orden original:

```text
NavbarBlock
HeroBlock o ShowcaseHeroBlock
StatsBlock o composición base (cifras ilustrativas)
GridBlock + tarjetas fotográficas de servicios
SplitFeatureBlock o composición de nutrición con checklist
SectionBlock
  children.children: [HeadingBlock, GridBlock]
    GridBlock.children.children: [tarjetas compuestas de programas]
SectionBlock (agenda editorial estática)
  children.children: [HeadingBlock, GridBlock de eventos]
TestimonialsBlock
CtaBannerBlock
ContactFormBlock (@contact), adaptación del modal offline pendiente
SiteFooterBlock
```

Ejemplo de **forma declarativa**, no sustituto del contenido y diseño originales:

```json
[
  {"type":"NavbarBlock","props":{"brand":"Elevate Wellness"}},
  {"type":"SectionBlock","props":{},"children":{"children":[
    {"type":"HeadingBlock","props":{"text":"Programs"}},
    {"type":"GridBlock","props":{},"children":{"children":[
      {"type":"TextBlock","props":{"text":"Original program copy"}}
    ]}}
  ]}},
  {"type":"ContactFormBlock","props":{"formId":"@contact"}}
]
```

Este fragmento ilustra slots y marcador y **no se entrega como Elevate reducido ni como ZIP válido**. La propuesta completa de `audit/declarative-proposal.json` conserva textos EN/ES, cifras, cuatro eventos y testimonios con props `imageSrc`, `src` y `avatarSrc` e inventario de hashes originales. Las alternativas de locale no implementan un selector. La composición base es una propuesta de representación del contenido; sus diferencias visuales se declaran, no se certifica fidelidad Atlas.

El manifiesto candidato usará los literales del contrato, el builder/digest auditados, `siteKind: website`, título original, `locale: en`, la entrada home y los inventarios reales calculados. `forms` declarará solo los marcadores utilizados. Colores originales: tinta `#17243c` y papel `#efebea`; `theme.json` deberá mapearlos a tokens consumidos por los bloques y elegir una fuente de la lista cerrada o un fallback de sistema admitido. No se cambia la paleta ni se crean páginas nuevas.

No hay páginas separadas de servicios, programas, nutrición, agenda o contacto: son anclas de `/` (`#services`, `#classes`, `#nutrition`, `#events`, `#stories`, `#contact`, además de `#top` y el salto `#main`). No convertirlas en rutas nuevas por conveniencia. Si se solicitan páginas después, v1 no tiene parciales compartidos: cabecera/pie se materializan en cada array; no introducir referencias `$ref` no admitidas.

La localización es un único `locale: es|en` en el manifiesto. Dos rutas de texto traducido podrían modelarse manualmente, pero el formato no expresa correspondencias, cambio de idioma, persistencia, fallback ni SEO `hreflang`. Un selector bilingüe completo necesita contrato de páginas/locales y enlaces, extensión de navegación, resolución en el host y pruebas. Conservar su propuesta visual como comportamiento pendiente.

## Bloqueos precisos de validación, publicación e importación (D)

| Bloqueo | Evidencia | Archivos/contratos que deberá alcanzar una implementación autorizada |
|---|---|---|
| No hay paquete nativo asociado al borrador | Original recuperado es estático; recurso MCP sigue sin archivos ni evidencia | Conversión declarativa completa y exportación nativa con inventario real, después de resolver soporte de imágenes |
| ZIP HTML/CSS/JS no es Website Template | v1 solo admite entradas de datos declaradas; no HTML/CSS ejecutables | Exportador declarativo y adaptación Atlas; no cambiar la frontera de confianza para ejecutar el prototipo |
| Imágenes cerradas | `WEBSITE_LIMITS.assets = 0`; Hub vuelve a imponer `assets: 0` | ERP `packages/studio-interchange/src/website-template.js`; Hub `packages/contracts/marketplace-validation.js`; completar decisión D-E5, almacenamiento/resolución/importación y pruebas antes de abrir límites |
| Catálogo exacto y renderers no compartidos | Digest coincidente; muchos bloques viven en `apps/desktop` | `scripts/generate-website-block-catalog.mjs`, registro/renderers Runly, distribución compartida; Hub snapshot `0.3.5.json` y `builder-catalogs.js` |
| Efectos del editor no portables | `_scrollReveal` da `prop_unknown` en ZIP | `website-template.js`, `website-block-effects.js`, `website-template-conform.js`, generador y catálogo; versionar whitelist segura, no aceptar props arbitrarias |
| No hay importador Marketplace Website comprobado | `website-template-service.js` toma `allTemplates` internos; no recibe ZIP/release del catálogo | ERP `apps/api/src/services/website-template-service.js`, `website-draft-service.js`, `apps/api/src/routes/website/dependency-routes.js`, `apps/api/src/services/catalog/resource-catalog-service.js`; nueva frontera de preparación/aplicación y adaptación de secciones a `Page` |
| Importar sitio estático es otro flujo | `website/import-routes.js` + `website-import-service.js` procesan distribución estática | No presentar `/sites/:siteId/imports` como conversión a Atlas ni usarlo para declarar editabilidad |
| Website no tiene autoridad institucional habilitada | API, SQL, publicador y proof limitan a Studio | Hub `marketplace-validation/service.js`, nueva migración posterior a `20261125090000_studio_official_channel.sql`, `apps/catalog-publisher/resources.js`, `packages/contracts/resource-official.js`, UI `ResourceReview.jsx`; ERP `catalog/resource-official-contract.js`; revisar también proyecciones/consumidores web del proof |
| Formulario no equivale a destino conectado | Solo `@contact`, `@newsletter`; IDs ajenos rechazados | Reutilizar `website-template-forms.js` en el futuro importador con permisos y transacción; preview distingue marcador, falta de permiso y conexión real |
| Agenda dinámica no transportable | IDs `calendarId` no predeterminados rechazados; no bindings portables | Contrato de marcador de agenda/servicio, permisos, selección explícita del calendario de la instancia y enlace en apply; integrar runtime de reservas con disponibilidad y estados reales |
| Bilingüismo no automático | `locale` escalar; páginas sin metadatos de localización | Esquema de localización, navegación Atlas y router/SEO del ERP; evolución versionada sin romper lectores existentes |

El paquete contempla assets y permite elevar límites, pero eso solo valida bytes: no almacena ni resuelve `asset:<sha>` al renderizar. Abrir un número no completa D-E5. También deben comprobarse límites de imagen/entrada efectivos, MIME/dimensiones, licencias, deduplicación por tenant, acceso, limpieza ante fallo, cuotas y referencias de borrador/publicación. No hay que borrar fotos, usar URLs externas ni desactivar validación.

Los formularios requieren una distinción concreta: el ERP **ya** tiene `ensureTemplateForm`, `placeholdersIn` y `bindContactForm`. Al aplicar una plantilla interna crea/reutiliza formularios del sitio con `website.forms.create`; sin ese permiso elimina el bloque del documento. Eso no demuestra que una futura importación de ZIP use ese código. El diseño no debe perderse silenciosamente: el flujo de preparación debe advertir y resolver el permiso/binding antes de aplicar.

El catálogo E2 verifica y expone recursos; no prueba instalación. Una ficha visible, un ZIP válido, una firma de integridad y una insignia institucional son cuatro evidencias distintas. No se afirma que todo Website sea imposible de publicar: H6a admite `website_template` por el canal comunitario con sus requisitos; **Elevate con imágenes y destino oficial sigue bloqueado**.

Para «Oficial de Runly» hacen falta tipo habilitado de extremo a extremo, delegación institucional explícita y vigente para publicador/organización/revisor, revisión del archivo y borrador exactos, evidencia del validador vigente, intención de publicación coincidente, H7 activo, firma y snapshot verificados, y prueba institucional que coincida con release/key/tipo/hash/provenance. El nombre del publicador, una licencia MIT o una firma genérica no lo acreditan. La ruta institucional de Studio no debe usarse para Website cambiándole el tipo. La independencia comunitaria y sus recuperaciones quedan intactas; cualquier extensión institucional necesita revisión de seguridad y pruebas de revocación, concurrencia e identidad, sin atajos H7.

## Portal frente a MCP

Los dos ZIP recuperados se enviaron localmente, sin modificarlos, al validador Website con el catálogo auditado: ambos dieron `ok: false`, código `zip_invalid`. No contienen el paquete nativo con `mimetype`/manifiesto/páginas en la estructura exigida. Unirlos resuelve la entrega duplicada del prototipo, pero no los convierte en plantilla nativa.

El portal ya sube bytes: `apps/web/src/marketplace-console/ResourceEditor.jsx`, función `Files.upload`, envía `application/octet-stream` a `POST /creator/publishers/:id/resources/:resourceId/files` bajo `/api/v1`. La ruta está en `apps/api/src/services/marketplace-console/routes.js` y aplica el contexto autenticado, permisos del servicio, cuotas/cuarentena; después existe `.../files/:fileId/validate`.

El MCP disponible lista/crea recursos, actualiza metadatos, lee estado y valida un `fileId` ya subido, pero **no ofrece upload genérico del ZIP Website ni lectura del contenido de ese ZIP**. Los métodos nativos de Studio no son una alternativa: `marketplace-resources/studio.js` exige `STUDIO_ONLY`. La limitación del conector no elimina la carga del portal, y tampoco la carga del portal hace compatible un ZIP estático. No se usa una sesión alternativa ni credenciales para eludir scopes.

Configuración auditada: Hub `marketplace-validation/runner.js` pasa límites y catálogos fijados al proceso aislado; `child.mjs` llama al validador compartido; `identity.js` liga `validatorId` al contenido de paquetes y digest de catálogos. El lock local fija paquetes de la revisión `7d945e3f3fcc720863eb0c2dc158d76870d255fc`. Producción exige distribución publicada y lock coincidente; no basta editar una copia local. Cualquier cambio aprobado exige nueva evidencia sobre el paquete exacto. No se consultaron secretos ni se certificó configuración H7 de producción.

## Integración de Atlas en Developer Hub por fases (E)

1. **Congelar referencia (avance local completado).** Originales conservados, hashes cotejados, página y ocho secciones identificadas, capturas 360/390, 768 y 1440 px e interacciones básicas comprobadas. Completar evaluación humana de teclado/foco, contraste, lector de pantalla y dispositivos reales antes de certificar accesibilidad. El cambio de idioma sí funciona en el prototipo local; agenda, progreso y formulario son simulaciones. Criterio de salida: referencia aprobada para comparar con Atlas, sin rediseño accidental.
2. **Compartir el catálogo ejecutable.** Reutilizar `@raulbellosom/atlas-web-builder@0.3.5` y extraer los renderers Runly requeridos a un paquete compartido de confianza, con peers compatibles de React, estilos y dependencias explícitas. ERP y Hub consumen la misma implementación; no copiar JSX al Hub ni cargar JS del ZIP. Generar catálogo desde ese registro y fijar digest. Si cambian campos/slots/defaults, publicar una identidad de catálogo compatible y conservar el snapshot anterior; no reemplazar silenciosamente el significado de `0.3.5`. La vinculación actual solo por versión de Atlas exige decidir una revisión de catálogo explícita si el registro Runly evoluciona sin cambiar Atlas.
3. **Adaptación portable ↔ Atlas y editor del recurso.** En `ResourceEditor.jsx`, abrir Atlas solo para `website_template`, cargado de forma diferida con sus estilos. `AtlasWebBuilderEditor` reutiliza `initialPage`, `blocks`, `theme`, `assets`, `onSaveDraft`; la acción de publicación del sitio se oculta/deshabilita mediante la API de permisos comprobada del paquete, y no se conecta al endpoint de publicación Marketplace. Guardar/exportar ≠ publicar. Crear adaptadores puros entre arrays de secciones con slots y el `Page` normalizado (`schemaVersion`, `regions`, `blocks`, `seo`) que usa `parsePage`/`serializePage`; no son formatos intercambiables. Round-trip conserva orden, texto, imágenes y jerarquía, y falla visiblemente ante datos no representables. Validar props con la política portable antes de exportar; `parsePage` no sustituye el validador ZIP.
4. **Contrato de borrador Website y assets.** Proponer endpoints autenticados de cargar/guardar documento portable con revisión esperada y adjuntos privados; aún no existen como API nativa Website. Retener conflictos, historial y bloqueo durante revisión. `AssetSource` usa referencias locales por hash con resolución de preview autenticada, sin URLs externas persistidas ni hacer públicos los originales. Implementar D-E5 con cuotas, inspección, licencias y ciclo de vida antes de habilitar exportación con imágenes. El servidor genera `mimetype`, manifiesto, archivos e inventario desde una instantánea consistente; valida bytes finales en el proceso aislado existente y los sube por el servicio de cuarentena actual. Una edición posterior invalida evidencia para revisión.
5. **Importación editable en ERP.** Preparar desde release verificado, comprobar digest/compatibilidad/revocación, resolver imágenes y tema, mostrar páginas y conflictos, seleccionar sitio y bindings por permisos. Aplicar en transacción con revisión esperada e idempotencia, sin sobrescribir publicación pública. Reutilizar servicio de borradores, branding y formularios; no usar importación estática como sustituto. Pruebas: instalación con fotos, recarga y edición Atlas, pérdida de permiso, fallo parcial sin huérfanos, doble apply, conflicto de ruta y aislamiento de tenant. Reservas/localización pueden seguir pendientes sin anunciarse como funcionales.
6. **Autoridad oficial y certificación.** Tras aprobación explícita de producto/seguridad, ampliar Website institucional en API, SQL, proof, firmador/consumidores y UI, manteniendo H7 y el canal comunitario. Actualizar paquete compartido/lock/identidad del validador con el flujo de distribución autorizado. Revalidar el ZIP final, revisar diseño responsivo y edición real, luego pasar por revisión y publicación autorizadas. Una fase de implementación no autoriza despliegue ni emisión de release. Criterio de salida: plantilla oficial con procedencia verificable y edición round-trip real, no una landing estática con etiqueta oficial.

Pruebas de cada fase: unitarias de adaptadores y frontera hostil; integración dirigida de borrador/asset/validación/apply; Chromium del editor y comparación visual, y Firefox/WebKit de rutas con diferencias DOM/iframe/CSS cuando proceda. Publicación solo con sus pruebas de seguridad existentes y regresiones de Website. No repetir suites globales por cambios meramente documentales.

## Comprobaciones realizadas y límites

Diez sondas locales con el validador real y catálogo fijado: ZIP declarativo válido aceptado; assets empaquetados rechazados (`asset_limit`); imagen externa rechazada (`prop_invalid`); bloque desconocido rechazado (`block_unknown`); catálogo distinto rechazado (`catalog_digest_mismatch`); destino de formulario externo rechazado (`prop_invalid`); marcador `@contact` aceptado; ID de calendario rechazado (`prop_invalid`); `_scrollReveal` rechazado (`prop_unknown`); bloque HTML ad hoc rechazado (`block_unknown`). Se compararon los dos catálogos completos por digest. Las sondas son sintéticas y no validan Elevate; se conservaron como evidencia local ignorada, junto con inventario del catálogo.

Se ejecutaron además las seis pruebas dirigidas Website de `interchange.test.js` y trece pruebas existentes de las instrucciones/paquetes OpenAI y Claude: todas pasaron. Se añadió el flujo Website en la Skill fuente del Hub y se sincronizó la copia Claude por su generador: contrato primero, Atlas único, una entrega visual con assets, no borrar imágenes, distinguir portal/MCP y no atribuir oficialidad sin autorización por tipo. No se actualizó la instalación remota ni se publicó una versión del plugin.

La fuente propietaria de la Skill está en `runly-developer-hub/distribution/openai/runly-developer/skills/runly-module-builder/SKILL.md`; la copia Claude se genera con `scripts/package-runly-developer-claude-plugin.mjs --sync`. El repositorio local `runly-plugins` no contiene la implementación. Las instrucciones instaladas visibles en esta sesión corresponden a dev.7/dev.8 y la fuente del Hub a dev.9: editar la fuente no actualiza esas instalaciones. La generación anterior ya advertía que el HTML no era nativo, pero proponía placeholders al mantener D-E5 cerrado y ofrecía un editor propio; el nuevo flujo prohíbe esas salidas para la plantilla final. La documentación MCP consultada no ofreció una referencia Website dedicada: exponer esquema, catálogo y capacidades por un contrato Website de solo lectura es una fase futura, no una tool inventada. Las instrucciones ahora exigen informar ese hueco antes de generar.

El selector local cambia el texto principal; no constituye localización completa de SEO, textos alternativos o todas las etiquetas accesibles. El formulario original pide nombre, correo e interés dentro de un modal; `@contact` crea en el ERP otro conjunto por defecto (nombre, correo, mensaje). Por ello, sustituirlo sin un contrato de campos/acciones perdería comportamiento del diseño. El teléfono es una ilustración estática de la landing, no una app conectada.

El chequeo global `pnpm check:privacy` falló con 72 hallazgos en archivos ajenos; no se ampliaron excepciones ni se corrigió código productivo fuera de alcance. Los tres archivos de documentación modificados pasaron las mismas reglas `inspectFile` sin hallazgos. `--staged` vuelve a recorrer todo el repositorio mediante miles de procesos Git; se detuvo esa repetición y no se presenta como aprobada. `git diff --cached --check` pasó en ambos repositorios.

No se ejecutaron instalación real Atlas, integración con DB/Auth/Storage, certificación del worker/firmador, pruebas en dispositivos físicos ni despliegue. A queda entregado como prototipo local responsivo; Elevate todavía no es un Website Template nativo validado, publicable oficialmente e importable.
