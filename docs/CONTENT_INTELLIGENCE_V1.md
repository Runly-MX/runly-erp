# Procesamiento inteligente de archivos

Consolidación de la segunda etapa. **V1 incompleta; APTO PARA PRUEBAS AISLADAS**.
No se ha publicado una imagen, hecho push, desplegado ni activado OCR en una
instalación operativa. El servicio permanece OFF por defecto.

## Instalación desde fuentes

La API y la web necesitan esta revisión. El worker general permanece independiente.
Usar el procedimiento normal de backup y actualización de la instalación. En un
entorno de pruebas, con las variables privadas de conexión ya configuradas:

```sh
pnpm exec prisma migrate deploy
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content build api web-preview content-worker
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content up -d api web-preview content-worker
```

Antes de Compose, configurar `RUNLY_CONTENT_WORKER_TOKEN` en el entorno privado
de API y worker: secreto aleatorio independiente de al menos 32 caracteres.
No reutilizar claves de Supabase, sesiones de usuario ni tokens de administrador.
No imprimir el secreto. El overlay necesita esa variable incluso al validar su
configuración; el Compose normal no la necesita ni instala OCR.

El worker se construye como usuario no root, sin capacidades, con filesystem de
solo lectura, tmpfs de 256 MiB, 64 PIDs y un hilo interno por proceso nativo.
Los modelos se obtienen y verifican durante build; nunca durante arranque.
La base está fijada por digest y los modelos de alta precisión por commit y SHA256.
La base Alpine recibe correcciones mediante apk. Tesseract y Poppler se compilan
en una etapa separada desde fuentes fijadas por hash; no hay compiladores en el
runtime. Conservar el digest final, `/opt/content-packages.txt`, el SBOM y los
hashes de fuentes/modelos. El inventario de paquetes por sí solo omite componentes compilados.

## Instalador sin fuentes

El overlay `infra/installer/docker-compose.content.yml` usa una imagen suministrada
por infraestructura mediante `RUNLY_CONTENT_WORKER_IMAGE`, preferentemente con
digest. No hay imagen pública de este cambio todavía. Copiar el overlay junto
al Compose del instalador y usar ambos archivos con los perfiles habituales de
la instalación y `--profile content`. Mantener el secreto en el archivo privado
de entorno del API y pasarlo al worker. La URL interna es `http://api:4010`.
El overlay no modifica ni necesita el socket Docker.

## Activación y permisos

En Configuración de la instancia se muestran dos políticas: instancia y empresa
activa. Guardar primero los máximos de instancia y después activar una empresa.
Solo el propietario de plataforma, o el administrador de una instalación de
una empresa según la regla existente, gestiona la instancia. La política de
empresa exige administrador de empresa y `files.assets.update`.

La consulta de texto y búsquedas exige `files.assets.read`; solicitar OCR exige
`files.assets.update`. Cada consulta valida además el archivo vigente mediante
`filesService.getById`, que comprueba empresa, compartición, propietario,
carpetas, permisos de módulo y restricciones de inventario. No hay acceso OCR
por enlaces públicos. Cancelar requiere propietario del archivo o administrador.
No se crean permisos que sustituyan o amplíen los permisos existentes.

| Perfil | Comportamiento |
|---|---|
| OFF | No reclama ni crea trabajos; la búsqueda de resultados previos puede conservarse |
| LIGHT | Texto digital; OCR manual autorizado; concurrencia efectiva máxima uno |
| SMART | Texto y OCR automáticos dentro de los límites |
| DEDICATED | Mismo pipeline, worker aislado; hasta cuatro trabajos globales |
| CUSTOM | Límites específicos dentro de los máximos de instancia |

Cada proceso de worker ejecuta un trabajo. Para paralelismo deben existir varios
workers con `RUNLY_CONTENT_WORKER_ID` distintos, además de autorizar concurrencia
global y empresarial. Seleccionar un perfil no crea contenedores ni aumenta CPU/RAM.
Los límites físicos se cambian desde infraestructura con `RUNLY_CONTENT_CPUS` y
`RUNLY_CONTENT_MEMORY`. El worker informa los límites cgroup v2 observados y
se abstiene de procesar si no los puede determinar. La memoria aplica histéresis:
pausa al 80%, reanuda bajo 65%; también necesita espacio temporal suficiente.
No se afirma que esa telemetría mida la presión de CPU/RAM del host completo.
El worker observa también uso de CPU del cgroup y espacio temporal, con
histéresis. La API suspende claims/backfill si su event loop o RSS están bajo
presión. No observa directamente presión de PostgreSQL ni del host.
El exceso de CPU acumula segundos de espera proporcionales al presupuesto,
con heartbeat durante la espera. La deuda no se descarta a los diez segundos:
un trabajo largo con un presupuesto de 10% mantiene la espera necesaria.

La interfaz permite configurar extracción digital, OCR automático/manual,
imágenes/PDF, MIME permitidos, memoria por trabajo, hilos, presupuesto de CPU,
segundos diarios, retención y ventanas por día/hora/zona. Los máximos de empresa
se intersectan con instancia. El presupuesto de CPU regula admisión media; el
límite duro sigue siendo el cgroup. Cada trabajo recibe el mínimo entre memoria
autorizada y 85% del límite físico del worker, y un límite RLIMIT_AS heredado por
parsers. Alta precisión exige al menos 384 MiB efectivos. Un único trabajo puede
rebasar el saldo diario restante hasta su timeout; no es una cuota de facturación.

La calidad es independiente del perfil: rápido hace una pasada; equilibrado
añade orientación, deskew acotado y segunda pasada selectiva; alta precisión usa
`tessdata_best` y variantes controladas. No garantiza mayor exactitud en cada caso.
Los códigos iniciales son `spa` y `eng`. Los modelos adicionales deben incluirse
en una imagen administrada; alta precisión exige también su modelo `best`.

## Archivos nuevos, histórico y recuperación

El trigger de archivos añade trabajos en la misma transacción que registra un
original nuevo o cambiado, solo con políticas activas y heartbeat compatible reciente.
Una pausa temporal por recursos permite encolar dentro del máximo autorizado;
solo un worker listo puede reclamar. La pausa administrativa de la política sí
impide nuevas admisiones. Así no se retrasa una carga hasta el siguiente barrido
solo porque el worker estaba enfriando su consumo de CPU.
No invoca parsers ni red. Sin worker no se acumula una cola ilimitada.
Los límites máximos son 4,000 trabajos activos globales y el máximo por empresa
(100 por defecto, configurable hasta 1,000). Se usan leases de 90 segundos,
heartbeat cada 15 segundos, reintentos limitados y backoff exponencial.
Un token de lease antiguo no puede publicar un resultado; se almacena su hash.

La indexación histórica exige autorización en ambas políticas y una acción
explícita de inicio. Recorre `file_asset` por cursor, hasta diez registros por
lote, sin enumerar buckets. Admite carpeta, prefijo MIME y fechas mediante API.
Los filtros también incluyen nunca procesados, fallidos, confianza mínima,
versión del motor y calidad del recorrido. El cursor y el estado persisten. Pausar deja terminar el trabajo activo; cancelar
invalida también los trabajos históricos en cola/en proceso. Reanudar conserva
el cursor. Iniciar otra vez restablece el recorrido, sin repetir revisiones ya
registradas. El recorrido de archivos nuevos permite reconciliar eventos
perdidos con barridos acotados de modificaciones posteriores a la activación.

Las páginas se guardan mediante checkpoints idempotentes; después de perder un
lease se omiten las unidades ya guardadas si coinciden motor/modelos/calidad y
opciones del pipeline. Cambiar ese fingerprint invalida los checkpoints. Un
resultado interrumpido puede conservar texto parcial. El padre del proceso posee
los temporales y los elimina aun cuando un hijo termine por SIGKILL.

La prioridad envejece con el tiempo para permitir progreso del histórico. Los
archivos modificados invalidan el índice anterior de inmediato; cambios de
permisos se consultan en vivo. Deshabilitar o eliminar el original borra sus
derivados mediante trigger o cascada. Restaurar puede encolar nuevamente.

## Formatos admitidos

El formato se decide por el contenido real del archivo, no por la extensión ni por el
tipo declarado. Un tipo incorrecto (por ejemplo una fotografía de iPhone subida como
`application/octet-stream`) no oculta un formato soportado, pero el archivo solo entra en
la cola si su tipo declarado figura en la lista de admisión.

| Formato | Tratamiento | Límites y notas |
|---|---|---|
| JPEG, PNG, WebP, TIFF | OCR local con coordenadas | EXIF aplicado antes del OCR; el lienzo guardado es la imagen ya orientada |
| HEIC / HEIF (HEVC) | OCR local con coordenadas. **Capacidad explícita, apagada por defecto** (`RUNLY_CONTENT_HEIC=on` en el worker; apagada, las bibliotecas nativas ni se cargan y el archivo termina `unsupported`) | Imagen principal únicamente, ya girada por el contenedor (`irot`/`imir`), 8 bits RGB. Si el archivo trae más imágenes de primer nivel (ráfagas, colecciones) se marca como parcial. Miniaturas, mapas de profundidad y auxiliares nunca se decodifican. El límite de píxeles se comprueba en la cabecera, antes de decodificar. Archivos dañados terminan en `PARSER`. AVIF y HEIF con otros códecs se rechazan como no compatibles |
| PDF | Texto digital página por página; OCR solo en páginas sin texto | Hasta `maxPages`; rotación `/Rotate` aplicada por el rasterizador |
| DOCX | Cuerpo (tablas como filas `celda \| celda`), encabezados y pies de página como referencias propias | Sin coordenadas visuales; sin macros |
| XLSX | Una referencia por hoja con su nombre real, celdas `A1: valor` | Solo el valor almacenado: las fórmulas nunca se evalúan; las celdas de error se omiten; las hojas se ordenan numéricamente |
| PPTX | Una referencia por diapositiva (cuadros de texto y tablas) | Sin notas del orador ni coordenadas |
| Texto, JSON, XML, SVG | Texto digital | SVG solo como texto, nunca renderizado |

El visor muestra las fotografías HEIC en cualquier navegador pidiendo la variante `content` (1600 px) del servicio de transformación de imágenes que ya usa
el resto del producto; el original no cambia y se descarga tal cual, y las coordenadas escalan sobre la misma proporción. Verificado en Chromium y Firefox.
Si la instalación no tiene ese servicio, la foto no se muestra pero el texto reconocido se busca, lee y copia desde el panel.
El histórico descubre selectivamente los HEIC omitidos antes de este soporte (filtro `mime`
del recorrido); no reindexa el resto de archivos.

## PDF buscables

Acción opcional «Generar PDF buscable» en el panel de texto de un PDF ya reconocido. Es
asíncrona y produce una **copia independiente**; el original nunca se modifica.

- Las páginas escaneadas se vuelven a rasterizar (máximo 2400 px de lado largo, JPEG 78) y
  reciben una capa de texto invisible (modo de render 3, Helvetica estándar) alineada
  palabra por palabra con las coordenadas del OCR ya guardado. No se reconoce de nuevo.
- Las páginas con texto digital se copian sin cambios (`pdfseparate`/`pdfunite`): nunca se duplica
  una capa de texto. Un PDF sin páginas reconocidas por OCR termina en `NOT_NEEDED`.
- Los PDF cifrados se rechazan (`ENCRYPTED`); no se elude ninguna restricción. Un PDF con firma
  digital se copia, pero la copia **no conserva la validez de la firma** y el panel lo avisa.
- La capa de texto conserva Unicode exacto: cada página usa una tabla de códigos de un byte (hasta unos 190 símbolos distintos, además del ASCII) declarada en un
  `ToUnicode`, de modo que un lector extrae el texto reconocido tal cual (acentos, €, £, ¿, ★). Lo que no cabe en una página se cuenta (`droppedCharacters`) y nunca se sustituye.
- Las páginas escaneadas con texto girado reciben la capa con la misma orientación (el worker guarda `analysis.orientation`); un resultado anterior a 4D sin ese dato se trata como horizontal: reprocesar para corregirlo.
- PDF cifrado o con contraseña: `ENCRYPTED` (copia) o `unsupported` (lectura). Nunca se elude. El CropBox del PDF se respeta al rasterizar (`pdftoppm -cropbox`), igual que el visor.
- Límites: máximo 5 copias en preparación por empresa, mismo `maxFileBytes`, `maxPages`, memoria,
  CPU, programación y tiempo máximo que el resto del procesamiento; resultado de hasta 64 MiB.
  Una sola copia por archivo y revisión (`runly_content.derivative`, único por archivo/revisión);
  repetir la acción devuelve la existente.
- Se guarda en el mismo bucket privado bajo `content-derivatives/<empresa>/<archivo>/<revisión>.pdf`
  y solo se entrega con URL firmada de 60 s tras la misma autorización que el original. Desactivar
  el procesamiento impide generar copias nuevas; las existentes siguen disponibles mientras el original
  exista. Una revisión nueva del archivo, la depuración explícita de la empresa o la eliminación definitiva del archivo eliminan la copia (fila y objeto).
  Un archivo simplemente desactivado la conserva, sin servirla, y la vuelve a servir si se restaura con la misma revisión. Desactivar el procesamiento o la búsqueda **no** borra copias ni texto.
  Todo borrado de fila registra su objeto en `runly_content.derivative_orphan` (trigger) y se drena aparte: nunca se borra por prefijo.

## Aislamiento de red del worker

Las composiciones (`infra/docker/content.compose.yml`, `infra/installer/docker-compose.content.yml`) colocan al worker en una red Docker `content-private`
marcada `internal: true` donde solo está la API: sin base de datos, sin Storage, sin internet. La API se une a esa red además de la predeterminada.
El resto de banderas (usuario 10001, `cap_drop: ALL`, `no-new-privileges`, solo lectura, `pids_limit`, `/tmp` sin ejecución) se verificó en un contenedor real.

## API y contratos internos

Todas las rutas de usuario reciben la empresa activa mediante el middleware
habitual. Las respuestas son privadas (`Cache-Control: no-store`).

| Método y ruta | Uso |
|---|---|
| GET `/content/search?q=SERIE&searchIn=content` | Búsqueda con cursor; `all`, `content`, `ocr` |
| GET `/content/files/:id[?unit=N]` | Estado, páginas autorizadas y `searchablePdf`. Coordenadas hasta un presupuesto acumulado de 1500 palabras; el resto de páginas indica `wordCount`/`wordsOmitted` y se pide con `?unit=N` |
| POST `/content/files/:id/process` | `{ quality, reprocess }` |
| POST `/content/files/:id/cancel` | Cancelar con permisos actuales |
| POST `/content/files/:id/searchable-pdf` | Solicita la copia con texto reconocido (202); devuelve la existente si ya hay una |
| GET `/content/files/:id/searchable-pdf` | `{ url, name, expiresInSeconds }` firmada, solo si la copia está lista |
| GET/PUT `/content/admin/instance` | Estado/política global |
| GET/PUT `/content/admin/company` | Estado/política de empresa activa |
| POST `/content/admin/backfill` | `{ action: start/pause/resume/cancel, filters }` |
| POST `/content/admin/purge` | `{ confirm: "PURGAR" }` |
| POST `/content/admin/retry` | Recorrido filtrado, fallidos por defecto |

El worker usa exclusivamente `/content/worker/heartbeat`, `/claim`, `/derivative/claim`,
`/jobs/:id/source`, `/heartbeat`, `/checkpoint`, `/result` y, para copias,
`/derivatives/:id/source`, `/pages`, `/heartbeat`, `/file` (PUT, hasta 64 MiB) y `/result`, con Bearer operativo y
`X-Content-Lease` en cada operación del trabajo. No recibe acceso a base de datos,
Storage, rutas administrativas o identificadores arbitrarios de archivos.
Las respuestas y los tamaños están acotados. TLS y una red privada son
obligatorios para usar el mismo contrato fuera del host. No hay descubrimiento,
aprovisionamiento remoto ni política de firewall automática.
El protocolo actual es 2. La API deja pasar exclusivamente el prefijo operativo
del worker por el filtro de dominios web; su autenticación dedicada sigue
siendo obligatoria. Para leer originales en backend se revierte la URL pública
de Storage al origen interno configurado; no se entrega esa URL al worker.

Los servicios de plataforma pueden inyectar `createContentIntelligence` y llamar
`request`, `result` o `search`, pasando un `activeContext` autenticado y autorizado.
No construir ese contexto a partir de datos enviados por el cliente. Inventarios,
Compras y Aprendizaje pueden consumir el texto; ningún resultado escribe series,
importes u otros datos empresariales automáticamente.

## Datos y búsqueda

La migración `20270115000000_content_intelligence` crea el esquema privado
`runly_content`: políticas, workers, trabajos, páginas y recorridos. No modifica
Prisma para tablas RME3. Incluye RLS sin políticas para roles públicos y revoca
PUBLIC; el propietario de conexión del backend realiza las operaciones.
No exponer este esquema en PostgREST ni concederlo a `anon`/`authenticated`.
La migración aditiva `20270116000000_content_intelligence_consolidation` agrega
checkpoints, intentos, tiempos, totales mantenidos por trigger y mantenimiento
de retención. No cambia la migración entregada ni inicia un histórico.

Cada página conserva texto original, texto normalizado, fuente digital/OCR,
referencia, palabras/coordenadas, confianza heurística y motor/modelo. Los índices
GIN actúan sobre `tsvector` simple, sin convertir identificadores ambiguos.
La búsqueda soporta acentos, mayúsculas, palabras, prefijos y frases entre
comillas. Prioriza identificadores exactos y admite hasta ocho variantes de un
solo carácter O/0, I/1 o B/8 para identificadores mixtos de 6–32 caracteres.
No cambia el texto guardado. La coincidencia aproximada se indica en el snippet.
El cursor cifra ID/rango, se limita al usuario/empresa/consulta, expira a los 15
minutos y debe reiniciarse al reiniciar la API. No es compartible entre réplicas.
Los snippets se consultan en lote; la autorización vigente de cada archivo
sigue usando el servicio central, con consultas por candidato (lote máximo 50).
No hay búsqueda arbitraria por subcadena ni pg_trgm adicional.

El visor de Archivos ofrece texto seleccionable, copia/descarga, búsqueda y
navegación de palabras OCR con overlays SVG en el mismo contenedor transformado
de la imagen. Las coordenadas se remontan a la imagen tras EXIF. PDF usa el
visor React al optar por overlays y comparte rotación con la capa raster; sus
coordenadas no se anuncian como puntos PDF. El texto digital sin coordenadas
se muestra en el panel/capa de texto, sin rectángulos inventados. TIFF multipágina
solo muestra la primera imagen en el visor actual.

Las coordenadas de una palabra son un rectángulo `{x,y,width,height}` en el lienzo guardado y,
cuando la lectura se hizo sobre una imagen rectificada por perspectiva, además `polygon`
(ocho números: las cuatro esquinas reales, en el mismo lienzo). El visor dibuja el polígono
si existe. El modo de texto admite clic, doble clic (línea), arrastre del ratón entre palabras
(solo ratón: el toque conserva sus gestos y selecciona palabra a palabra), Ctrl/Cmd+C,
Ctrl/Cmd+A y Escape, con alternativas accesibles en el panel. Las solicitudes de coordenadas
son por página, se cancelan al cambiar de archivo y su clave de caché incluye usuario, empresa,
archivo y revisión (sin retención al desmontar).

## Dependencias y seguridad

Sin nuevas dependencias npm. Se reutilizan Hono, Zod, Prisma/pg, Storage y UI.
El worker añade Python/Pillow, Tesseract y Poppler sobre Alpine 3.24, más `pillow-heif` 1.9.0 (BSD-3, rueda con hash fijado para x86_64/aarch64) para HEIC/HEIF. Su rueda incluye libheif 1.23.7 y libde265 1.1.3 (LGPL-3, decodificación) y x265 (GPL-2, codificador que el worker nunca invoca): conservar sus avisos al distribuir la imagen. Sin AVIF, sin red, sin código ejecutable. La imagen pasa de 337 MB a 377 MB. Versiones, hashes y evaluación de CVE de las bibliotecas nativas: `CONTENT_INTELLIGENCE_V1_SECURITY_REVIEW.md` §3. Versiones
observadas: Python 3.13.18, Pillow 13.0.0, Tesseract 5.5.4 y
Poppler 26.11.0. Sus licencias son respectivamente PSF,
HPND, Apache-2.0 y GPL-2.0-or-later; conservar avisos/licencias al distribuir la imagen.
Los modelos best usan el commit `e2aad9b983032bb1beff9133104a67cdbb87ca4d`;
fast usa `65727574dfcd264acbb0c3e07860e4e9e9b22185`. Se retiró SQLite y pip del
runtime; no se añadió OpenCV ni dependencias npm de producción.

Se consultaron [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security),
[índices FTS de PostgreSQL](https://www.postgresql.org/docs/current/textsearch-indexes.html),
[calidad de Tesseract](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) y
[modelos oficiales](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html).
El [tracker de Tesseract](https://security-tracker.debian.org/tracker/source-package/tesseract)
y el [tracker de Pillow](https://security-tracker.debian.org/tracker/source-package/pillow)
registran incidencias para versiones de distribución. Esto impide declarar
la imagen apta para producción sin resolver/evaluar los hallazgos aplicables.
Comparativa, CVE por paquete y cobertura real del escáner:
[informe de seguridad](audits/content-intelligence-stage2/SECURITY.md).

## Verificación y limitaciones

Las pruebas están en `apps/api/src/services/content-intelligence/*.test.js` y
`apps/content-worker/test_worker.py`. La integración exige una base local vacía
llamada `content_intelligence_test`, indicada por `CI_CONTENT_DATABASE_URL`.
La fixture destruye únicamente sus tablas en esa base y rechaza otros nombres/hosts.
No usa el `.env` operativo. `CI_CONTENT_DOCKER=1` activa la prueba real de worker;
`CI_CONTENT_BENCH=1` añade el lote de 1,000 TXT sintéticos, sin OCR.
`CI_CONTENT_WORKER_IMAGE` selecciona explícitamente la imagen que se prueba.
`benchmark_corpus.py` mide 36 combinaciones sintéticas y
`generate_test_files.py` produce doce archivos mixtos para Storage del ERP aislado.
Los scripts `content-intelligence-e2e.mjs` y `content-intelligence-erp-bench.mjs`
exigen URLs loopback, credenciales sintéticas y contenedores de laboratorio
explícitos. El benchmark cambia límites y políticas de ese laboratorio: nunca
ejecutarlo sobre una instancia operativa.

```sh
node --test apps/api/src/services/content-intelligence/*.test.js
docker build -f infra/docker/content-worker.Dockerfile -t runly-content:validated .
docker run --rm --network none --cpus 0.5 --memory 1g --read-only --tmpfs /tmp:size=268435456,mode=1777 --mount type=bind,source="$PWD/apps/content-worker",target=/tests,readonly --workdir /tests runly-content:validated python3 test_worker.py
pnpm check:privacy
```

Para ejecutar el corpus, la imagen debe incluir solo `worker.py` en `/app`; el
montaje aporta pruebas y generadores sintéticos, nunca archivos operativos.
Resultados y estado por fase: `CONTENT_INTELLIGENCE_V1_RESULTS.md`.

Los pendientes y la evidencia se mantienen en la
[matriz de consolidación](CONTENT_INTELLIGENCE_STAGE2_MATRIX.md) y
[resultados](CONTENT_INTELLIGENCE_V1_RESULTS.md). Continúan pendientes la
certificación de rendimiento <10% en una instalación representativa, pruebas
prolongadas, corpus fotográfico autorizado, perspectiva/regiones avanzadas,
HEIC, subcadenas generales, etiquetas, búsqueda global y PDFs buscables.
No se ofrece reconocimiento fiable de manuscritos o fotografías ilegibles.

## Operación, actualización y rollback

Guardar el perfil OFF en instancia antes de actualizar o retirar el worker.
Para pausa temporal conservar la configuración y usar `paused`. Los activos
interrumpidos vuelven a pendientes al vencer lease y reintentan de forma limitada.
Para desactivar solo búsqueda, guardar `searchEnabled: false` en instancia o empresa.
Para borrar texto, usar la purga independiente de la empresa, con confirmación.
La auditoría existente recibe cambios de política, solicitudes, backfill y purga.

Si el worker aparece desconectado, comprobar secreto coincidente, red API, imagen,
idiomas instalados y límites cgroup. No imprimir cuerpos de documentos, tokens ni
URLs firmadas. Un resultado `partial` no equivale a éxito completo; ampliar límites
autorizados y reprocesar cuando corresponda. `unsupported` es terminal; `LIMIT`
requiere modificar el presupuesto o el documento, no reintentar sin cambios.

El rollback conservador verificado es guardar OFF, detener `content-worker` y
conservar API/web actuales y las tablas; búsqueda puede mantenerse o desactivarse.
Desde fuentes, detener solo el servicio opcional:

```sh
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content stop content-worker
```

Respaldar las políticas y definiciones SQL antes de actualizar. Una reversión
binaria a la primera etapa exige además restaurar políticas compatibles (su
validador rechaza las claves nuevas) y la función de admisión de esa revisión
(el trigger actual exige protocolo 2). No basta cambiar la imagen del worker.
Esa reversión binaria completa no está verificada; ensayarla con el backup en
una copia aislada antes de aplicarla. No restaurar toda la base operativa para
revertir solo OCR. La migración es aditiva; mantener sus tablas permite recuperación.
Para retirarla definitivamente, con
backup y servicio detenido, eliminar primero `content_file_queue` y
`content_file_invalidation` de `file_asset`, y después el esquema privado
`runly_content`. No tocar `file_asset`, versiones ni objetos originales.
