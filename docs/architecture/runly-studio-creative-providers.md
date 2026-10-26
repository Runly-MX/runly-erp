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
