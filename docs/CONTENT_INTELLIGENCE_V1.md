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

## API y contratos internos

Todas las rutas de usuario reciben la empresa activa mediante el middleware
habitual. Las respuestas son privadas (`Cache-Control: no-store`).

| Método y ruta | Uso |
|---|---|
| GET `/content/search?q=SERIE&searchIn=content` | Búsqueda con cursor; `all`, `content`, `ocr` |
| GET `/content/files/:id` | Estado y páginas autorizadas |
| POST `/content/files/:id/process` | `{ quality, reprocess }` |
| POST `/content/files/:id/cancel` | Cancelar con permisos actuales |
| GET/PUT `/content/admin/instance` | Estado/política global |
| GET/PUT `/content/admin/company` | Estado/política de empresa activa |
| POST `/content/admin/backfill` | `{ action: start/pause/resume/cancel, filters }` |
| POST `/content/admin/purge` | `{ confirm: "PURGAR" }` |
| POST `/content/admin/retry` | Recorrido filtrado, fallidos por defecto |

El worker usa exclusivamente `/content/worker/heartbeat`, `/claim` y
`/jobs/:id/source`, `/heartbeat`, `/checkpoint`, `/result`, con Bearer operativo y
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

## Dependencias y seguridad

Sin nuevas dependencias npm. Se reutilizan Hono, Zod, Prisma/pg, Storage y UI.
El worker añade Python/Pillow, Tesseract y Poppler sobre Alpine 3.24. Versiones
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
