# Studio: biblioteca creativa y licencias

## Contrato y persistencia

La biblioteca vive dentro de `runly.studio`, en el monorepo. No añade un paquete,
módulo custom, tabla, migración ni servicio de producción. Los proveedores se
declaran en `apps/shared/studio/licenses.js`; su implementación está en
`apps/api/src/routes/studio/catalog/`. El SDK conserva autenticación y empresa activa.

| Operación | Iconify | Openverse |
| --- | --- | --- |
| Buscar | Consulta y colección, 32 resultados/página | Consulta, 24 resultados/página |
| Detalles | Autor, licencia, geometría admitida | Autor, licencia, origen, dimensiones |
| Miniatura | PNG generado desde geometría validada | PNG reducido a 256 px |
| Original | Geometría resuelta solo en backend | Descarga limitada solo en backend |
| Importar | Objeto vectorial editable en el documento | Original privado en Files/Storage |
| Atribución | Colección, ID y avisos de licencia | Metadatos conservados en FileAsset |

Los endpoints `/studio/catalog/:provider/search`, `/:id`, `/:id/thumbnail`
y `/:id/import` reciben consultas/IDs; nunca una URL de descarga del cliente.
Importar requiere el ID de un diseño editable. Los resultados de búsqueda no
crean FileAssets. Se admiten capacidades distintas sin fingir un original
fotográfico para los iconos. Los originales no se sirven como proxy abierto.

El documento v3 conserva geometría `{width,height,paths}` e `iconId`, o un
`fileAssetId` para fotografías; nunca depende de un hotlink. Los paths admiten
solo comandos geométricos, números finitos y propiedades de pintura enumeradas.
No se guarda/ejecuta SVG del proveedor. El parser excluye scripts, referencias,
CSS, eventos, entidades, filtros, transforms, aliases y foreignObject.
Iconos que necesiten características excluidas fallan explícitamente.
Color, dimensiones, rotación, orden, bloqueo, clipboard e historial utilizan
las herramientas existentes del editor. El contrato conserva texto regular/400
con familia admitida. La lectura v1/v2 se normaliza a v3; los datos históricos
se mantienen intactos hasta un guardado autorizado. No hay migración SQL.

## Catálogos y licencias

- **Iconify**: Tabler (MIT) y Lucide (ISC, con elementos derivados de Feather/MIT).
  Se consulta metadata únicamente de la colección seleccionada y se comprueba
  el SPDX admitido. Al insertar se vuelve a consultar la licencia vigente.
  Los avisos íntegros de ambas colecciones acompañan los créditos exportados.
- **Openverse**: CC0 1.0, Public Domain Mark 1.0 y CC BY 1.0/2.0/2.5/3.0/4.0.
  Se excluyen NC, ND, SA y licencias desconocidas por defecto. Esto reduce el
  catálogo; no equivale a afirmar que una imagen carece de otros derechos.
  Se admiten originales en Wikimedia y Flickr, y sus miniaturas oficiales
  a través de Openverse. Un origen o una redirección fuera de allowlist falla.
- **Fuentes locales**: Lato (sans), Playfair Display (serif), Bebas Neue (display),
  Pacifico (manuscrita), Oswald (condensada), Space Mono (monoespaciada).
  Se distribuyen sin modificar bajo OFL 1.1. Cada familia conserva su aviso
  original; `public/studio-fonts/sources.json` registra commit público, bytes y
  SHA256. No se requiere clave de Google ni conexión a Google Fonts.
- **Plantillas propias**: composiciones originales de formas y textos, con
  categoría, dimensiones, descripción, creador y versión. No se copiaron
  plantillas de terceros. Cualquier icono incorporado conserva su identificación
  y avisos mediante el mismo contrato; las fuentes conservan sus licencias.

Antes de descargar PNG/JPG o compartir, Studio permite revisar, copiar y
descargar un TXT de créditos. El servidor verifica acceso al diseño y a los
archivos incluidos, incluso para una escena todavía no guardada. Los metadatos
de fotografías provienen de Files, no de afirmaciones enviadas por el cliente.
La exportación raster no incorpora automáticamente los créditos dentro de los
píxeles: quien publica debe acompañarlos según la licencia.

La revisión espera las operaciones pendientes del editor. Exportar comprueba que
la escena todavía coincide con la revisada y congela las mutaciones mientras
valida originales y genera los píxeles. Al terminar conserva cualquier revocación
de permisos recibida durante la operación. El guardado toma su generación después
de vaciar la cola para no marcar como pendiente un cambio que ya se guardó.
Las inserciones y restauraciones asíncronas vuelven a comprobar el modo de
escritura antes de sustituir la escena; una revocación durante la carga conserva
la escena anterior y libera los objetos preparados.

## Límites y aislamiento

- Cache de metadatos: 60 segundos, 96 entradas y 4 MiB por proceso; resultados
  de búsqueda/detalles separados por empresa, actor, proveedor y consulta/ID.
  Los permisos se comprueban también al servir un resultado cacheado.
- Hasta 4 operaciones de catálogo concurrentes, 100 operaciones/minuto/actor
  y empresa, con mapa de cuotas limitado a 512 identidades activas.
  La decodificación de fotografías tiene además un límite separado de 2 tareas.
- HTTPS con allowlist exacta, DNS comprobado y fijado para la conexión TLS;
  se rechazan redes privadas, locales, reservadas y mecanismos IPv6 de transición.
  Cada redirección repite las validaciones; máximo 2 saltos, 8 segundos de timeout.
- JSON externo de hasta 256 KiB; originales de hasta 10 MiB y 25 megapíxeles.
  PNG, JPEG y WebP: se comprueban MIME real, dimensiones y decodificación.
  Se verifica la firma binaria antes de invocar el decodificador automático,
  tanto en importaciones externas como en miniaturas de Files.
  No se importan SVG externos ni imágenes animadas.
- Original seleccionado: licencia resuelta de nuevo, permisos Studio/Files
  y rol del diseño antes y después de descargar y después de subir a Files.
  No se modifica el diseño en el endpoint de importación. Si la autorización
  cambia durante la subida, no se concede el resultado: puede quedar un archivo
  privado del importador en Files, que no queda enlazado al diseño.
- Deduplicación: mismo proveedor/ID, SHA256, empresa y uploader, revalidando
  acceso Files, licencia y bytes reales de Storage; no se confía en un hash
  declarado en metadatos de una subida. Una exclusión local impide importaciones simultáneas del mismo
  recurso/actor; no promete unicidad entre varias réplicas del API.
- Navegador: debounce de 300 ms, páginas acotadas, AbortController, miniaturas
  lazy y una cola compartida con Files de 2 descargas/48 pendientes; los blob URLs
  se liberan. Los errores 404, 429, timeout y desconexión permiten reintento manual;
  no hay bucles automáticos que agoten cuotas.
- FontFace carga cada familia al usarla; no se precarga todo el catálogo de
  fuentes al abrir Runly. Abrir/restaurar texto y exportarlo espera a la fuente.
  Un fallo no sustituye silenciosamente su familia ni genera una exportación.
- Un diseño guardado necesita sus originales Files y fuentes locales, pero
  no depende de consultar Iconify/Openverse para abrirse o editarse.

## Plantillas empresariales y próximos pasos

El catálogo original se pagina en servidor; crear desde una plantilla produce
una copia independiente. El almacenamiento de plantillas privadas por empresa y
usuario queda pendiente: requiere versiones de plantilla, administración,
roles propios y reglas de acceso a los originales compartidos. No se reutiliza
el motor de Documents ni se convierte un diseño privado en una plantilla pública.
La separación entre catálogo y documento permite añadir ese proveedor sin
modificar el renderer. También quedan pendientes fuentes italic/bold, grupos
persistentes, colecciones multicolor y ampliar orígenes tras revisar sus licencias.

## Fuentes primarias

- [Iconify API](https://iconify.design/docs/api/),
  [búsqueda](https://iconify.design/docs/api/search.html),
  [colecciones](https://iconify.design/docs/api/collections.html).
- [Tabler MIT](https://github.com/tabler/tabler-icons/blob/main/LICENSE),
  [Lucide ISC y Feather MIT](https://github.com/lucide-icons/lucide/blob/main/LICENSE).
- [Openverse API](https://api.openverse.org/v1/),
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [Google Fonts, distribución y licencias por familia](https://github.com/google/fonts).

La validación opcional contra las API públicas se limita a consultas de búsqueda,
metadata y una miniatura para confirmar su contrato. Las suites automáticas usan
simuladores Docker locales; no consumen cuotas públicas ni infraestructura Runly
existente. El transporte del simulador exige un identificador aleatorio
`runly-studio-e2e-*` y la marca exacta de la base desechable. Sin ella falla cerrado.

## Actualización 2026-10-28: proveedores aislados, biblioteca local y fuentes nuevas

### Diagnóstico de los 503/504 (contrastado con el código y la red actual)

- `node scripts/diagnose-studio-catalog.mjs` y `curl` desde el mismo equipo dan el
  mismo resultado: Iconify, Wikimedia y Flickr responden en 0,14-0,4 s. Openverse
  completa DNS, TCP y TLS (certificado válido) en unos 150 ms, y `/v1/` y
  `/healthcheck/` responden en ~200 ms, pero `GET /v1/images/?q=...` no envía
  cabeceras en más de 40 s, incluso con `curl` y otro User-Agent. Es una espera de
  cabeceras (`CATALOG_HEADERS_TIMEOUT`) en el buscador del proveedor: no es DNS, ni
  conexión, ni TLS, ni un defecto del cliente de Runly. Un 504 puede tener otra causa
  en otro entorno; el código de etapa del diagnóstico sigue distinguiéndolas.
- Defecto propio que agravaba el efecto: todos los proveedores compartían el mismo
  carril (4 concurrentes) y la misma cuota por usuario. Cuatro búsquedas colgadas de
  Openverse dejaban sin servicio a iconos y miniaturas durante 15 s. Ahora cada
  proveedor tiene sus propios carriles y su interruptor.

### Arquitectura

| Pieza | Archivo | Función |
| --- | --- | --- |
| Biblioteca local | `catalog/icon-library.js` | Tabler 3.50.0 (MIT) y Lucide 1.63.0 (ISC) desde `@tabler/icons` y `lucide-static` con versión exacta. Índice ligero en memoria (id + texto), SVG leído de disco bajo demanda, validado por la gramática estricta y entregado como geometría; el navegador nunca recibe todos los SVG. 32 resultados/página. |
| Exclusiones | `catalog/icon-library.exclusions.json` | Iconos que la gramática no puede representar (hoy 2 de Tabler). Una prueba falla si cambia una versión sin ejecutar `node scripts/generate-studio-icon-exclusions.mjs`. |
| Interruptor | `catalog/health.js` | 3 fallos de transporte/5xx abren 30 s (duplica hasta 5 min); después pasa una sola prueba. Cuota fija por proveedor (Pixabay 90/min). Los 404/licencia/formato no cuentan. |
| Adaptadores | `catalog/providers/*.js` | `openverse`, `wikimedia`, `pixabay`, `packs` con la misma interfaz `search`/`resolve`. |
| Allowlist | `catalog/network.js` | `PROVIDER_HOSTS`: cada proveedor solo alcanza sus hosts, también tras redirecciones. |
| Estado | `GET /studio/catalog/status` | Disponibilidad por proveedor (`available`, `degraded`, `unavailable`, `disabled`) sin contactar a ninguno. SDK: `studio.catalogStatus`. |

Contratos conservados: rutas y SDK existentes, ids `tabler:*`/`lucide:*`, objeto
vectorial del documento, FileAssets privados con `studioSource`, créditos y avisos.
Los resultados nuevos solo añaden campos (`source`, `library`, `availability`).

### Qué cambia por proveedor

- **Iconos**: Tabler y Lucide se sirven de la biblioteca local (sin red). Iconify queda
  como respaldo explícito (`source=iconify`) o si la biblioteca no carga, con los hosts
  oficiales redundantes `api.iconify.design`, `api.simplesvg.com` y `api.unisvg.com`
  en ese orden. Tabler incluye también la variante `-filled`.
- **Openverse**: sin cambios de licencias; un fallo suyo ya no afecta a otros.
- **Wikimedia Commons**: API oficial de MediaWiki (sin scraping), User-Agent
  identificable (`STUDIO_CATALOG_USER_AGENT`), solo CC0, dominio público declarado y
  CC BY 1.0-4.0; se descartan SA, ND, NC, GFDL y términos desconocidos. Autor y URL de
  origen se conservan. Validado contra la API real: búsqueda, miniatura e importación.
  El filtro de licencias reduce los resultados por página.
- **Pixabay**: deshabilitado sin `PIXABAY_API_KEY`. Con clave: respuestas cacheadas 24 h
  (caché del proveedor, acotada, sin datos de empresa), 90 solicitudes/min, miniaturas
  servidas por la API, nunca la URL del CDN al navegador y copia privada a Files solo al
  importar. La clave no aparece en errores, diagnósticos ni respuestas. Licencia propia
  de Pixabay (no es CC0): se registra como `Pixabay-Content-License` con su enlace.
- **Colecciones Runly** (`packs`): infraestructura lista y probada (manifiesto, CC0,
  SHA256, SVG estricto, rasterización a PNG). Sin colecciones instaladas.

### Validación y colecciones reales (2026-10-28, segunda fase)

- **Simulador y E2E aislado**: `scripts/fixtures/studio/catalog-server.mjs` simula ahora
  Wikimedia (licencias CC BY/SA/CC0/PD, atribución en HTML, SVG, redirecciones válidas y
  hostiles, miniaturas en `thumb.wikimedia.org`) y Pixabay (clave falsa inexistente,
  hits válidos y hostiles, cabeceras de cuota), con disparadores `rate-limit` (429),
  `offline` (503), `gateway` (504), `stall` (sin respuesta) y `malformed`.
  `node scripts/verify-studio-catalog-providers.mjs` lo ejecuta en UN contenedor Docker
  desechable (`runly-studio-e2e-<hex12>-sim`, sin volúmenes, raíz de solo lectura, sin
  capacidades, puerto en 127.0.0.1) y comprueba 9 escenarios con el servicio real. Solo
  detiene su propio contenedor por nombre exacto; no usa compose, prune ni borrado de
  volúmenes. No sustituye al stack Supabase completo (`supabase-creative.mjs`), que no se
  reconstruyó en esta fase.
- **Colecciones incluidas** (`catalog/packs/`): Open Doodles (12) y Open Peeps (12) de Pablo
  Stanley, CC0, tomadas de los botones de descarga de sus páginas oficiales con
  `scripts/import-studio-illustration-pack.mjs`. Cada colección conserva manifiesto con
  URL de origen y SHA256 por archivo, la declaración de licencia capturada de la página
  oficial (`PROVENANCE.md`) y el texto legal CC0 (`LICENSE-CC0-1.0.txt`). Se importan
  siempre como PNG (el SVG se rasteriza en el servidor) y el autor se muestra en la tarjeta,
  la vista previa y los créditos exportados.
- **Búsqueda en español**: `catalog/icon-synonyms.js` (≈300 equivalencias es-en, sin acentos,
  singular/plural, sin palabras vacías). El inglés y los nombres originales no cambian.
  Pixabay recibe `lang=es` solo si la consulta parece español; si no, `lang=en`.
- **Pixabay**: caché de 24 h verificada (entre actores y con reloj controlado), mención
  visible "Imágenes de Pixabay" y autor en cada resultado, la clave solo existe en el
  servidor: no aparece en respuestas, diagnósticos, errores, SDK ni frontend.

### Pendiente

- Pixabay no se probó contra la API real: requiere la clave del responsable.
- Importar las ilustraciones como geometría editable no se habilita (degradados y
  transformaciones); se conservan como PNG.
- Una colección mayor de Open Peeps/Open Doodles se amplía ejecutando el script con otro N.
- E2E con el stack Supabase completo y navegador: pendiente de reconstruir las imágenes locales.

### Miniaturas simultáneas y colas de decodificación

El navegador puede pedir hasta 4 miniaturas a la vez, pero el servidor decodifica como máximo 2
imágenes simultáneas. Antes, la tercera simultánea fallaba con `429 «Hay imágenes procesándose»` y
la tarjeta quedaba en «Sin vista previa» (reproducido en el E2E aislado). Ahora las que sobran
esperan en una cola FIFO acotada (32): respeta `AbortSignal`, cancelaciones y el tiempo máximo de
la operación, y libera su lugar al cancelarse. Solo la saturación real de la cola responde 429, con
el código `CATALOG_PROCESSING_BUSY`; las cuotas por usuario y por proveedor no cambian. No hay
reintentos automáticos en el servidor.

### Integridad de las colecciones entre plataformas

Los manifiestos fijan el SHA256 de cada SVG. En Windows (`core.eol` nativo con `* text=auto`) un
checkout o `git archive` los convertía a CRLF y las dos colecciones se rechazaban enteras. Una regla
de `.gitattributes` (`packs/**/assets/*.svg -text`) conserva los bytes; `packs-integrity.test.js`
reproduce un checkout CRLF y verifica los 24 hashes.
