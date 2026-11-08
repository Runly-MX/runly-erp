# ERP E1b — validadores compartidos de Marketplace

**Fecha:** 2026-11-09. **Alcance:** paquetes y validadores puros para Studio, Automatizaciones y Website. **No** instala nada desde Marketplace (E3), no consume el feed (E2), no publica paquetes.
Especificación de origen: `ERP_E1A_ACK.md` y sus Anexos A y B en `runly-developer-hub/docs/architecture/marketplace-solutions/reviews/` (prevalecen sobre el plan maestro).

## 1. API pública

| Paquete / subruta | Exporta |
|---|---|
| `@runly/studio-interchange/inspect` | `inspectStudioPackage(bytes, { limits, fonts })`, `FORMAT`, `LIMITS_VERSION`, `PACKAGE_LIMITS`, `manifestSchema`, `MANIFEST_READERS`, y la API histórica `inspectNativePackage`, `describePackage`, `validateImage`, `mapReferences`, `renameContent`, `readPackageZip` |
| `@runly/studio-interchange/write` | `exportStudioPackage` (alias `exportNativePackage`), `writePackageZip` |
| `@runly/studio-interchange/website-template` | `validateWebsiteTemplate(bytes, { limits, builderCatalogs })`, `WEBSITE_TEMPLATE`, `WEBSITE_LIMITS`, `resolveWebsiteLimits`, `catalogDigest`, `richTextProblem` |
| `@runly/module-compiler/automation-file` | `parseAutomationFile`, `exportAutomationFile`, `cleanAutomation`, `riskSummary`, `validateAutomationDefinition` (reexporta `validateSystemAutomation`), `AUTOMATION_FILE`, `DEFAULT_CLEANUP`, `definitionOf` |

Convención común: los validadores **no lanzan ante entrada hostil** (`ok:false` + `errors:[{code,message,path?}]`), son deterministas, no leen disco ni red y siempre devuelven `digest` (sha256 de los bytes). Solo lanzan `TypeError` por mal uso (bytes que no son `Uint8Array`, `limits` mal formados, falta `builderCatalogs`).

Códigos estables Studio: `zip_invalid`, `zip_limit_exceeded`, `zip_unsafe_entry`, `manifest_invalid`, `format_unsupported`, `checksum_mismatch`, `undeclared_entry`, `image_invalid`, `image_limit`, `font_unavailable`, `license_forbidden`, `document_invalid`, `page_count_mismatch`. Website añade `builder_unsupported`, `catalog_digest_mismatch`, `block_unknown`, `prop_unknown`, `prop_invalid`, `href_unsafe`, `asset_missing`, `asset_unreferenced` (aviso), `asset_limit`, `rich_text_unsafe`, `form_marker_unknown`, `theme_invalid`, `page_limit`, `home_missing`. Automatización: `file_too_large`, `invalid_json`, `not_automation_file`, `file_version_newer`, `file_version_invalid`, `automation_incomplete`.

## 2. Qué consume ahora el ERP

- **Studio:** `apps/api/src/routes/studio/interchange/{zip,package}.js` son fachadas del paquete (misma superficie e import path; `PACKAGE_LIMITS` conserva sus 7 claves históricas, así que `/schema` no cambia). El código puro de `apps/shared/studio` (document, pages, fonts, licenses, vector, gradient, shape-properties, image-properties, icon-notices) vive en `packages/studio-interchange/src/studio/`; en `apps/shared/studio/` quedan reexportaciones de una línea para que los ~90 consumidores (escritorio, API, worker, tests) no cambien. Se quedan en el ERP: `svg.js`, `service.js`, `router.js`, Prisma, Storage, permisos, journal, cuotas.
- **Automatizaciones:** `apps/desktop/src/modules/runly.automations/lib/automationFile.js` usa `@runly/module-compiler/automation-file`. Conserva sus mensajes y formas; usa limpieza de solo personas (comportamiento previo). Cambios de comportamiento: el tamaño se mide en bytes UTF-8, se rechazan claves de fila (`id`, `key`, `webhookToken`…) que un archivo manipulado pudiera traer, y también se limpian las acciones dentro de un bucle.
- **Website:** el editor y el servicio de publicación no cambian. El validador es nuevo y aún no tiene consumidor en el ERP (E3b).

## 3. Decisiones tomadas en E1b

| Tema | Decisión |
|---|---|
| Dónde vive el validador Website | Subruta de `@runly/studio-interchange`: reutiliza el lector ZIP endurecido (`yauzl`), que `module-compiler` no tiene. El Hub ya necesita ese paquete para Studio |
| Catálogo de bloques | Lo pasa quien llama (`builderCatalogs[<versión del builder>]`); el paquete no importa nada de `apps/api`. `catalogDigest` = sha256 del JSON canónico (claves ordenadas) del catálogo |
| Bloques excluidos | `VideoBlock` (incrustación externa), `CartBlock`, `CartPageBlock`, `AccountPortalBlock` (comercio/cuentas vivas). `formId` solo admite `""`, `@contact`, `@newsletter`; `calendarId` no se admite |
| Texto enriquecido | Lista blanca: `p br strong em u ul ol li h2 h3 h4 blockquote a`, solo `href` en `a` |
| `assets` | Tope 0 por omisión (D-E5 sin resolver); se abre por `limits.assets` (techo 100) sin cambiar el formato |
| Limpieza de automatizaciones | Por omisión limpia personas, correos externos, canales de chat, ids de archivo, de contacto, de plantilla y otros ids de registro (`recordIds` amplía el Anexo A). **D-E4 y D-E6 siguen siendo decisiones de producto**: los valores son la recomendación técnica y cada eje se apaga sin cambiar la API |
| `riskSummary` | Esquema cerrado de `PUBLIC_PROJECTIONS_CONTRACT_V1` §4.2. Describe lo que pide el archivo original; `importsPaused: true` porque todo import por este módulo produce `enabled:false` |
| `personalData` (Studio) | Detecta correo y teléfono en textos; informa tipo y lugar, nunca el valor |

## 4. Lo que Developer Hub necesita en H3

1. Añadir `studio-interchange` a `shared-packages.lock.json` (`PACKAGES` del ERP ya lo lista en `scripts/lib/shared-package-release.mjs` y `shared-packages.release.json`): el lock del Hub pasa de 6 a 7 paquetes, y hay que cambiar la lista exacta de `scripts/prepare-shared-packages.mjs` y las pruebas del consumidor. El ERP **no ha publicado** nada.
2. Dependencias de runtime del worker: `sharp` (binario nativo, misma versión y plataforma), `yauzl`, `zod`; `jszip` solo si escribe paquetes. No hace falta `fast-xml-parser` (SVG se queda en el ERP).
3. Pasar `limits.compressed = 25 MiB` (Studio) y los máximos por tipo del feed; estampar `LIMITS_VERSION` y la versión de `sharp` en la evidencia. `validatorId` se calcula en el Hub desde su lock (Anexo A §3).
4. Para Website: empaquetar los `block-catalog.json` de los builders soportados y pasarlos como `builderCatalogs`; generar `catalogDigest` con la función exportada.
5. Los archivos de `packages/studio-interchange/corpus/` (con `expected.json`) permiten reproducir en el Hub los mismos 30 casos; se regeneran con `node scripts/write-interchange-corpus.mjs`.
6. El Hub no debe reimplementar nada de esto: debe consumir los paquetes.

## 5. Pendiente / fuera de E1b

Consumidor de recursos del feed (E2), planificador e instalación (E3), servicio `apply` de Website (E3b), publicación de paquetes, decisiones D-E4/D-E5/D-E6, y un mapa de qué bloques del catálogo incrustan contenido externo más allá de la lista de exclusión inicial.
