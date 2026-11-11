# Website Marketplace W1 — contrato, aceptación y continuidad

Fecha: 2026-11-11. Referencia histórica: [auditoría Elevate](elevate-wellness-website-template-audit.md). Alcance: contrato compartido, exportación/inspección segura, adaptación de documentos Atlas y preparación de bindings. No incluye editor Hub, instalador Marketplace, publicación ni despliegue.

## Decisión de formato

Se evoluciona **el mismo** `runly.website-template`, con el mismo MIME `application/vnd.runly.website-template+zip` y el mismo lector ZIP endurecido. No se introduce un formato HTML ni un segundo constructor.

| Paquete | Lector W1 | Lector anterior |
|---|---|---|
| v1, sin imágenes | Aceptado con el catálogo correcto | Aceptado |
| v1, imágenes por opt-in experimental | Rechazado: `asset_limit` incluso con límites elevados | Solo algunas llamadas experimentales podían abrirlo |
| v2, `minReaderVersion: 2`, `assetPolicy: packaged-raster-v1` | Imágenes PNG/JPEG/WebP dentro de límites; licencias e inventario verificados | Rechazo `format_unsupported`, comprobado con el lector E1b real |
| v2 sin política conocida / versión futura | Rechazado | Rechazado |

`WEBSITE_TEMPLATE.formatVersion` y `minReaderVersion` pasan a 2; `WEBSITE_MANIFEST_READERS` conserva el esquema v1. `websiteManifestSchema` discrimina por versión. `WEBSITE_LIMITS_VERSION = 2`; `WEBSITE_ASSET_POLICY = { name: 'packaged-raster-v1', version: 1 }`. Un manifiesto v2 no se consigue renombrando un ZIP estático: siguen siendo obligatorios `mimetype` primero y sin comprimir, manifiesto, páginas declarativas e inventario completo.

El catálogo sigue siendo **Atlas 0.3.5**, 148 bloques, digest canónico `0e6f77787d7351448f05dc87af8b1f2bb701170a1077eacc76633d548216d248`. No se modificaron ni reemplazaron sus bloques, campos, defaults, slots o renderers. `builder.min` sigue siendo una búsqueda exacta del snapshot, no un rango semver.

## Imágenes y licencias

Los topes se conservan: ZIP 25 MiB, expansión 128 MiB, entrada 10 MiB, 100 assets / 64 MiB agregados, lado 8192 y hasta 25 millones de píxeles por imagen. Se reutiliza `validateImage`: firma real PNG/JPEG/WebP, MIME coincidente, decodificación completa con sharp, dimensiones, orientación y ausencia de múltiples frames. El lector ZIP aplica tamaño real, CRC, relación de compresión, límites de entradas y carpetas, y rechaza traversal, symlinks, cifrado y estructuras no admitidas. SVG, HTML, JS y CSS arbitrario siguen fuera del paquete.

Cada activo tiene identidad `asset-<sha256>`, ruta `assets/<sha256>.<png|jpg|webp>`, bytes, MIME, dimensiones y `license`. La prop de imagen usa `asset:<sha256>`. Se cotejan las declaraciones del activo, el inventario y los bytes reales, no solo dos campos proporcionados por el autor. IDs, rutas y hashes de assets son únicos. Referencias ausentes fallan; archivos adicionales se rechazan; imágenes no utilizadas generan aviso y no se borran automáticamente.

En v2, `asset.license` referencia el **id** de una entrada de `manifest.licenses`, no un SPDX suelto sin aviso. La entrada declara `path` y `redistribution: allowed|unknown|forbidden`; su texto UTF-8 inventariado debe ser no vacío y de hasta 32000 bytes. Licencias ausentes o prohibidas bloquean. `unknown` conserva una advertencia `license_unknown` y queda visible en el reporte/riesgo del Hub: validación técnica no verifica titularidad ni autoriza redistribución comercial. Esta decisión conserva el patrón de revisión humana de Studio, sin cambiar H7.

La validación no ejecuta contenido ni consulta red. El inspector puro solo devuelve páginas, tema y bytes de imágenes tras un resultado válido. `validateWebsiteTemplate` sigue devolviendo evidencia sin contenido ni bytes; `inspectWebsiteTemplate` añade `content` exclusivamente para consumidores de preparación autorizados.

## APIs compartidas nuevas

- `@runly/studio-interchange/website-write`: `exportWebsiteTemplate({ title, summary, locale, siteKind, pages, theme, assets, licenses, catalog, builderVersion })`. Calcula dimensiones, hashes, rutas e inventario, usa `writePackageZip` existente y valida los bytes finales. Devuelve `{ bytes, validation }`; no guarda ni publica.
- `pages`: `{ path, title, isHome, sections }[]`; `assets`: `{ data, mime, license }[]`; `licenses`: `{ id, notice, redistribution }[]`. El exportador escribe v2 y deriva los marcadores de formularios del árbol.
- `@runly/studio-interchange/website-document`: `sectionsToAtlasPage`, `atlasPageToSections`, `mapWebsiteImages`, `websiteThemeToAtlasTokens`. Funciones de datos; no incluyen React, renderers ni código del ZIP.

La adaptación crea `Page` schema 1 con `regions.main`, `blocks`, IDs internos deterministas y los mismos props/slots. El camino inverso rechaza ciclos, referencias repetidas, huérfanos, regiones adicionales, metadatos de bloque no portables y SEO no representable, en lugar de descartarlos silenciosamente. Los cambios de props siguen pasando por el validador de exportación; `parsePage` no lo sustituye. El round-trip se comprobó con el paquete Atlas instalado, no con una imitación de su parser.

El tema portable se conserva completo en `portableTheme`. Los colores se adaptan a `tokens.color`, cuerpo a `font.sans`, radio a `sm/md/lg` y espaciado a la escala de pasos. Una fuente distinta para encabezados se conserva como dato, pero no se afirma que el renderer actual la use: se devuelve `heading-font-rendering` como capacidad pendiente. W2 debe comprobar fuentes y fidelidad efectivas. No se introducen fuentes ni CSS externos en el ZIP.

## Preparación ERP y persistencia futura (W3)

`createWebsiteTemplatePreparationService({ prisma, files, readFile, builderCatalogs }).prepare(...)` no tiene rutas ni escrituras. Exige un contexto emitido de autorización, `website.pages.create` y un sitio de la misma compañía antes de inspeccionar. Devuelve validación, páginas normalizadas, tema, assets requeridos, revisión del sitio y bloqueos. Un paquete inválido no produce documentos consumibles.

Un binding de preparación es `{ [sha256]: fileId }`. Solo se aceptan registros Files habilitados, `moduleKey: runly.website`, pertenecientes al **sitio destino**, con acceso comprobado, MIME/tamaño/checksum coincidentes, bytes reales leídos y verificados y una revisión/clave/checksum que no haya cambiado durante la lectura. No se aceptan IDs de otro sitio ni una declaración de hash sin comprobar el contenido. El resultado conserva `assetBindings` con la revisión para revalidarla al aplicar en W3.

Se remapean solo campos imagen del catálogo y fondos de imagen, nunca textos por coincidencia accidental. Un asset no materializado conserva su referencia portable y aparece en `missingAssets`; `readyForDraft` permanece falso. No se emiten URLs de buckets ni enlaces firmados. Los bindings normales usan **`file:<id>`**, que el servicio existente `website-release-service.js` sabe comprobar y copiar a un asset inmutable de release al publicar. El límite de publicación existente de 8 MiB por imagen sigue vigente: preparación no lo amplía a los 10 MiB del contenedor.

Límites expresos que impiden afirmar integración completa:

- W1 **no crea** archivos ni guarda páginas. W3 debe usar Files y el servicio de borradores existentes, no introducir otro almacenamiento de imágenes.
- `file:<id>` necesita resolución autenticada de preview en el editor futuro. No es una URL que un `<img>` actual pueda abrir directamente.
- El visitante de publicación actual no resuelve `background.url` como un campo `src`. Preparación devuelve `background-file-binding` y no declara listo ese borrador. W3 debe ampliar y probar ese punto antes de habilitarlo, sin publicar `file:` sin resolver.
- `@contact`/`@newsletter` necesitan el binding transaccional de formularios ya existente; se devuelven en `requiredForms` y también impiden `readyForDraft`. No se elimina el formulario ni se simula una reserva.

Secuencia obligatoria W3: verificar release y bytes → autorización/sitio → inspección compartida → persistir assets privados mediante Files (IDs generados por DB, metadata de procedencia/licencia, deduplicación por sitio/hash y clave idempotente) → preparación con los bindings → resolver capacidades/formularios → bajo el bloqueo del sitio y revisión esperada, revalidar revisiones de archivos y aplicar por el servicio de borradores/receipts. Coordinar rollback/limpieza de uploads huérfanos y mantener cuotas. No cambiar el sitio público al guardar el borrador. La publicación existente genera sus copias inmutables; revocación, permisos y cambios de archivo deben comprobarse nuevamente allí.

`SUPPORTED_FORMAT_VERSIONS.website_template = 2` solo permite reconocer e inspeccionar el recurso en el catálogo E2. **No habilita un instalador** ni una publicación institucional.

## Hub y distribución pendiente

`WEBSITE_VALIDATION_LIMITS` admite 100 imágenes; el child exige que el paquete instalado declare la política W1 y soporte v2 antes de darle esos límites. Un paquete antiguo no recibe simplemente `assets: 100`: falla cerrado. La evidencia recoge versión del formato, política de assets y límites; el riesgo conserva licencias sin copiar sus textos. El catálogo sigue verificado por digest.

El `shared-packages.lock.json` del Hub **no se cambió ni se falsificó**. Los tests nuevos usan una copia temporal del código W1 con dependencias locales en el runner real (`node-permission-process`, ambiente vacío, sin red ni escrituras). Esto demuestra la integración local, no una distribución productiva instalada o firmada. Las pruebas H6a conservan explícitamente `assets: 0` para reproducir su corpus v1 histórico; las pruebas W1 sí usan los límites nuevos y los 16 assets de Elevate.

Antes de desplegar habrá que publicar/adoptar, con autorización separada, los paquetes compartidos de una revisión coherente, actualizar el lock mediante el flujo existente, preparar un root verificable y comprobar `validatorId`/inventarios. El ID Website depende del contenido del paquete y del catálogo; no se reutiliza evidencia antigua para certificar W1. No modificar el lock a mano, sustituir archivos dentro del root productivo ni relajar el control de distribución. No se cambiaron firmador, dominios criptográficos, autoridades oficiales ni gates H7.

## Aceptación Elevate

Generación local reproducible:

```powershell
node scripts/prepare-elevate-website-w1.mjs --source <carpeta-de-la-entrega-preservada>
```

La carpeta contiene `prototype/` y `audit/` de la entrega anterior. El script lee JSON, verifica hashes originales y no ejecuta `content.js`. Usa los 14 WebP originales y dos derivados PNG de marca/favicon. La conversión de los dos SVG originales es local y limitada a sus formas simples, nunca una capacidad SVG del importador. Los originales permanecen intactos en el prototipo. Una repetición verifica igualdad y no reemplaza un ZIP con otros bytes.

Resultado: `.artifacts/website-w1/final/website.elevate-wellness-w1.zip`, **552572 bytes**, una página `/`, **133 bloques**, **16 assets**. SHA-256 `9bb0b5d97464ccd059621a59770da512715416a0a6d83b4e5e8134cfcc12afe0`. El inspector ERP y el proceso aislado del Hub devuelven `ok: true` para esos mismos bytes y el mismo catálogo. Atlas 0.3.5 completa el round-trip sin cambiar el árbol. Todos los textos escalares EN del original están conservados como bloques editables; fechas y testimonios permanecen en la composición. La propuesta ES y sus assets se conservan en el prototipo, sin fingir un selector bilingüe nativo.

Advertencias: una licencia con derechos `unknown` y tres assets sin uso (referencia conceptual, portada y favicon raster). No se eliminaron para conseguir el pase. La licencia procede de la declaración original suministrada; no se afirmó autorización independiente ni procedencia «Oficial de Runly».

La aceptación de W1 es **técnica y de preservación de datos**. No certifica fidelidad visual completa: hero con progreso flotante, tarjetas fotográficas, checklist, agenda, carrusel, teléfono y modal requieren las variantes/contratos enumerados en la auditoría. Sus textos se conservan, pero los labels del modal son copy estático hasta W2/W3. No se crearon nombres de bloques sin implementación, no se aplanó la landing como una imagen y no se publicó el candidato.

Evidencia local ignorada: `acceptance.json`, `hub-acceptance.json` y `legacy-reader.json`, junto al ZIP. No se versionan fotografías ni datos del propietario dentro del repositorio público.

## Pruebas y siguiente fase

Pruebas dirigidas aprobadas: validación compartida/corpus histórico; cinco pruebas W1 de formato, imágenes, licencias, malicia ZIP, límites y round-trip Atlas; tres de preparación ERP (acceso, sitio, integridad, carrera y background pendiente); 25 del consumidor de catálogo; tres del Hub W1 con ejecución aislada y Elevate real; tres de límites/corpus Website H6a/catálogos fijados. Los fallos iniciales de expectativa y preparación de fixtures se corrigieron y se repitieron sus casos afectados. Lint dirigido y comprobación de whitespace completados.

`pnpm check:privacy` sigue fallando con 72 hallazgos previos en archivos ajenos. No se ampliaron excepciones ni se cambiaron esos archivos. La revisión de los archivos W1 se hace por separado con las mismas reglas. No se ejecutaron suites generales, E2E, certificación de DB/Auth/Storage, edición visual real, instalador ni publicación: no son entregables implementados en esta fase.

W2 debe reutilizar Atlas (sin editor HTML), compartir renderers Runly de confianza y exponer el contrato/catálogos actuales al plugin. Mantener el snapshot 0.3.5; cualquier variante nueva necesita campos/defaults/slots/renderer, pruebas y nueva identidad versionada de catálogo, sin reemplazo silencioso. Implementar preview de assets privados, bindings de navegación/anclas, tema y el diseño original con comparación visual. Leer/exportar siempre por las APIs W1 y validar bytes finales.

W3 debe implementar el flujo anterior de Files/borradores, resolución de preview y background, permisos, idempotencia y compensación; revisar rutas/conflictos y confirmar marcadores con el usuario. Probar aislamiento, fallos parciales y concurrencia antes de declarar importación editable. Bilingüismo, calendario conectado y procedencia institucional siguen siendo contratos separados. No desplegar estos commits aislados suponiendo que el root actual del VPS ya contiene W1.
