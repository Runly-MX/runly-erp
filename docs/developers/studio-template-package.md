---
title: Plantillas portables de Studio
summary: Especificación pública de .runlystudio v1, recursos, validación y pipeline HTTP/SDK para diseños y plantillas independientes.
order: 10.2
---

## Contrato v1

`.runlystudio` es ZIP + JSON declarativo Studio, sin JSON de Fabric ni código.
MIME: `application/vnd.runly.studio+zip`. El endpoint autenticado
`GET /studio/interchange/schema` devuelve el JSON Schema del manifest, límites,
adaptadores y el aviso que debe presentar el cliente antes de exportar.
La fuente del esquema es `manifestSchema` en el codec del API; se genera mediante
`node scripts/generate-studio-interchange-schema.mjs` en
`docs/developers/studio-template-package-v1.schema.json` del repositorio.

El contrato usa objetos JSON cerrados: campos desconocidos bloquean la importación.
No incluir empresa, propietario, permisos, sesiones, claves Storage, URLs privadas
ni credenciales. Autor, procedencia, identificadores y licencias son declaraciones
no verificadas: jamás conceden permisos. Los SHA-256 detectan corrupción; no son
firmas ni acreditan autoría. El texto visible y los originales de imagen pueden
contener información personal: revisar el contenido antes de compartirlo.

| Entrada | Contrato |
| --- | --- |
| `mimetype` | Primera entrada, STORED, sin extra field ni salto de línea; contenido MIME exacto |
| `manifest.json` | UTF-8, manifest v1, máximo 4 000 000 bytes |
| `document.json` | Documento canónico v7, UTF-8, máximo 4 000 000 bytes |
| `assets/<sha256>.png`, `.jpg`, `.webp` | Originales PNG/JPEG/WebP, extensión correspondiente al MIME real |
| `previews/<nombre>.png` | Opcionales; datos PNG validados, nunca contenido activo |
| `licenses/<nombre>.txt` | Opcionales; texto UTF-8 de hasta 32 000 bytes cada uno |

Los nombres de previews/licencias solo usan minúsculas ASCII, números, `_`, `-`.
Los directorios vacíos `assets/`, `previews/`, `licenses/` son opcionales. No hay
archivos ocultos ni entradas auxiliares implícitas. Todo archivo salvo mimetype y
manifest debe estar declarado exactamente una vez en el manifest.

ZIP v2.0, STORE o DEFLATE, sin cifrado, ZIP64, multivolumen, data descriptors,
comentario final, prefijo ejecutable, sufijo ni entradas especiales. Nombre, tamaños,
CRC y compresión del encabezado local deben coincidir con el directorio central.
Rutas relativas ASCII, sin `..`, `\\`, drive, nombres repetidos incluso con diferente
capitalización, enlaces simbólicos o conflictos archivo/directorio. Nunca se extrae
el contenedor al disco. El escritor nativo usa STORE; compresores externos deben
respetar el límite de expansión incluso para JSON repetitivo.

| Límite | Valor |
| --- | --- |
| ZIP completo / suma descomprimida | 64 MiB / 128 MiB |
| Entrada / entradas / expansión por entrada | 10 MiB / 256 / 200:1 |
| Carpetas / profundidad | 32 / 3 componentes |
| Recursos / suma de imágenes para staging o exportación | 100 / 64 MiB |
| Imagen | 8192 px por lado, 25 MP, sin animación ni orientación EXIF pendiente |
| Imágenes decodificadas por página, contando usos repetidos | 25 MP |
| Documento v7 | 24 páginas, 500 objetos/página, 2000 objetos totales |

## Manifest y documento

Campos obligatorios del manifest:

| Campo | Valor o semántica |
| --- | --- |
| `format` | `runly.studio` |
| `formatVersion`, `minReaderVersion` | Ambos `1` |
| `documentSchemaVersion` | `7`, independiente de la versión del contenedor |
| `kind` | `design` o `template`; no determina el destino autorizado |
| `packageId` | SHA-256 no autoritativo; el escritor usa el hash de document.json |
| `title` | 1–160 caracteres |
| `author`, `provenance` | Texto inerte, hasta 2000 caracteres cada uno |
| `pageCount` | Número real de páginas |
| `document` | Descriptor de document.json |
| `resources` | Inventario de imágenes |
| `fonts` | Dependencias únicas `{family, variant}` conocidas por Studio |
| `notices` | Créditos `{subject, license}`; subject es ID de objeto/recurso o `document` |
| `previews`, `licenses` | Listas de descriptores; pueden estar vacías |
| `compatibility` | `{assetReferences: 'package-local-v1', losses: []}` |

Un descriptor contiene `{path, sha256, bytes}`. Un recurso agrega
`{id, mime, width, height, license}`. `id` debe ser `asset-<sha256>` y corresponder
al hash de sus bytes. No se permiten recursos repetidos, faltantes o sin uso.
Las referencias `fileAssetId` de imágenes y pinturas de imagen usan ese ID local,
incluso si el recurso está oculto o recortado. Los demás atributos permanecen en
el contrato canónico v7: páginas, orden de capas, grupos, geometría, texto editable,
altura de caja, máscaras y degradados. No incorporar propiedades internas de Fabric.

Una licencia es `{id, author, notice, redistribution}`, donde redistribution es
`allowed`, `unknown` o `forbidden`. `forbidden` bloquea; las otras siguen siendo
declaraciones que requieren revisión. Se conservan avisos y archivos de licencia.
La deduplicación por bytes no elimina créditos adicionales ni evita una prohibición.
Los avisos referidos a objetos eliminados se descartan al volver a exportar.

No se empaquetan fuentes. El inventario debe coincidir con el texto del documento.
Familia o variante desconocida bloquea y aparece en `fonts` con `available:false`.
No hay sustitución silenciosa. Los clientes presentan todo texto como texto,
nunca como HTML, Markdown ejecutable ni instrucciones.

## Generador mínimo independiente

Este ejemplo Python crea una página vacía válida sin depender del SDK:

```python
import hashlib, json, zipfile
def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
document = encode({'schemaVersion': 7, 'unit': 'px',
    'page': {'id': 'page-1', 'width': 320, 'height': 240, 'background': '#ffffff'},
    'objects': [], 'additionalPages': []})
sha = hashlib.sha256(document).hexdigest()
manifest = {'format': 'runly.studio', 'formatVersion': 1, 'minReaderVersion': 1,
    'documentSchemaVersion': 7, 'kind': 'template', 'packageId': sha,
    'title': 'Mi plantilla', 'author': '', 'provenance': '', 'pageCount': 1,
    'document': {'path': 'document.json', 'sha256': sha, 'bytes': len(document)},
    'resources': [], 'fonts': [], 'notices': [], 'previews': [], 'licenses': [],
    'compatibility': {'assetReferences': 'package-local-v1', 'losses': []}}
with zipfile.ZipFile('plantilla.runlystudio', 'w', compression=zipfile.ZIP_STORED) as z:
    z.writestr('mimetype', b'application/vnd.runly.studio+zip')
    z.writestr('manifest.json', encode(manifest))
    z.writestr('document.json', document)
```

Para añadir contenido, usar los contratos declarativos y catálogo tipográfico de
Studio v7. No adivinar campos: el lector exige la misma normalización canónica del
API. El SDK y el endpoint schema permiten inspeccionar el resultado antes de guardar.

## Pipeline HTTP y SDK

Todas las rutas requieren sesión, empresa activa y `studio.view`. Mutaciones POST
requieren `X-Runly-Studio-Protocol: 3`. El SDK aplica estos encabezados y no encola
operaciones de intercambio para replay offline. Propaga AbortSignal.
Las respuestas JSON usan `{data: ...}`; exportación y preview de imagen son binarias.

| Ruta bajo `/studio/interchange` | Acción |
| --- | --- |
| `GET /schema` | Contrato y capacidades |
| `POST /inspect` | Multipart `file`; valida y devuelve reporte sin escrituras |
| `POST /imports` | Multipart `file`, `options` JSON con `{target, name}`; prepara |
| `GET /imports/:id` | Estado/reporte exclusivo del actor y empresa |
| `GET /imports/:id/assets/:resourceId` | Imagen validada del staging listo; sin URL Storage |
| `POST /imports/:id/confirm` | JSON `{digest, acceptWarnings}`; crea y devuelve destino |
| `DELETE /imports/:id` | Cancela y compensa; nunca elimina un destino confirmado |
| `POST /recover` | Reintenta limpiezas propias pendientes |
| `POST /designs/:id/export`, `/templates/:id/export` | JSON `{acknowledgeImageCopies:true}`; descarga |

`target` debe elegirse expresamente: `design` exige `studio.create`, `personal`
exige `studio.templates.manage`, `company` exige `studio.templates.publish`.
Las imágenes además requieren `files.assets.create` al importar y
`files.assets.read` al exportar. Las plantillas reutilizan la delegación privada
actual; no transfieren permisos de la instalación de origen.

```js
const contract = (await client.studio.packageContract(token, signal)).data
// Presentar contract.exportNotice y recoger la decisión de la persona.
const downloaded = await client.studio.exportPackage('design', designId,
  { acknowledgeImageCopies: true }, token, signal)
const inspection = (await client.studio.inspectPackage(file, token, signal)).data
// Mostrar pages, resources, fonts, notices, warnings y blockingErrors.
// Solo continuar si no hay blockingErrors y la persona eligió el destino.
const prepared = (await client.studio.preparePackageImport(file,
  { target: 'personal', name: 'Plantilla importada' }, token, signal)).data
// Mostrar de nuevo el reporte preparado; revisar advertencias antes de aceptar.
const saved = (await client.studio.confirmPackageImport(prepared.id,
  { digest: prepared.digest, acceptWarnings: true }, token, signal)).data
```

El aviso de exportación explica que salen **copias completas** de todas las
imágenes, también las ocultas/recortadas y sus metadatos. No es una miniatura ni
una versión que elimine contenido sensible. El backend exige el consentimiento
explícito incluso cuando no hay imágenes.

El reporte incluye páginas/dimensiones/recuento de objetos, recursos y licencias,
fuentes, advertencias, errores bloqueantes y preview declarativo de hasta 40 objetos
de la primera página. Ese preview acotado es orientativo. Tras preparar, el cliente
puede mostrar imágenes mediante `packageImportAsset`; nunca cargar URLs del paquete.
La UI puede representar objetos con el renderer Studio, sin insertar SVG/HTML original.
El digest identifica los bytes exactos inspeccionados y debe acompañar la confirmación.
Advertencias presentes requieren `acceptWarnings:true`; preparar no publica nada.

## Transacción, recuperación y cuotas

Preparar vuelve a validar el archivo. Reserva un journal SQL y registra cada clave
privada **antes** de escribir Storage. Aún no existen FileAssets visibles ni destino.
Confirmar revalida permisos, disponibilidad y hashes; crea FileAssets, remapea IDs,
crea el destino y registra el resultado en una sola transacción PostgreSQL. Repetir
la confirmación devuelve el mismo resultado si todavía está autorizado.
Los IDs de DB se generan en PostgreSQL; páginas, objetos y grupos reciben IDs nuevos.
No se deduplica contra archivos de otros usuarios ni empresas.

Storage y SQL no comparten atomicidad. Cancelación/fallo compensan solo claves del
journal no confirmado. Si Storage falla, queda `cleanup` durable y consume cuota
hasta recuperarse. El API revisa cada minuto jobs con lease vencido; los reinicios
no pierden sus intenciones. Preparaciones expiran a los 30 minutos. Tombstones de
cancelación conservan las claves y reintentan un día para cubrir I/O tardío.
Una importación confirmada nunca entra en compensación. Los metadatos conservados
permiten reexportar créditos/procedencia; el journal no tiene acceso Data API y usa RLS.

Límites: 2 jobs activos por actor, 4 por empresa, 128 MiB reservados por empresa,
20 preparaciones/hora por actor y 2 operaciones HTTP simultáneas por proceso API.
No se garantiza reanudar una subida interrumpida: recuperar limpia y se prepara
de nuevo. La persona puede cancelar un job propio tras perder el permiso de destino.
Los errores y el reporte no exponen buckets, claves privadas ni errores internos.

## SVG y evolución

El primer adaptador externo admite SVG UTF-8 de hasta 32 000 bytes. Conserva
rectángulos, círculos/elipses, paths, líneas/polilíneas/polígonos, colores planos,
trazos, grupos planos, `translate` y degradados equivalentes al motor. El viewBox
debe tener el mismo tamaño del viewport; no admite escalado implícito. Los paths
y trazos vectoriales requieren viewport de hasta 1024 px. Los grupos anidados se
aplanan con advertencia; composiciones de opacidad no equivalentes bloquean.
La página utiliza fondo blanco y el reporte advierte que la transparencia exterior
del SVG no se conserva.
Degradados lineales axiales en objectBoundingBox y radiales centrados sobre figuras
cuadradas están soportados; otros se rechazan. No hay texto SVG, transformaciones
distintas de translate, CSS, filtros, clipPaths, imágenes, fuentes o recursos externos.
No se rasteriza silenciosamente. DTD, entidades, scripts, eventos, foreignObject y
atributos desconocidos bloquean. El original permitido se guarda como texto inerte
`licenses/original-svg.txt` al exportar de nuevo; nunca se sirve como SVG activo.

OpenRaster y ODG están evaluados en el spec de diseño, pendientes de adaptadores.
No se anuncian como formatos soportados. Todos los adaptadores futuros deberán
producir el mismo documento canónico/reporte y decisiones explícitas sobre pérdidas.

El lector v1 rechaza versiones futuras. Un cambio incompatible incrementará
formatVersion/minReaderVersion; cada nueva versión tendrá lector explícito y
conservará soporte de v1. Agregar campos requiere revisar el lector, porque v1 es
cerrado. El documento evoluciona por su propio schemaVersion, nunca por Fabric.
Un paquete no actualiza ni sobrescribe registros existentes por su packageId.
