# Procesamiento inteligente de archivos

Primera integración vertical funcional. **V1 incompleta; apta para pruebas aisladas**.
No se ha publicado una imagen, hecho push, desplegado ni activado OCR en una
instalación operativa. El servicio permanece OFF por defecto.

## Instalación desde fuentes

La API y la web necesitan esta revisión. El worker general permanece independiente.
Usar el procedimiento normal de backup y actualización de la instalación. En un
entorno de pruebas, con las variables privadas de conexión ya configuradas:

```sh
pnpm exec prisma migrate deploy
docker build -f infra/docker/content-worker.Dockerfile -t runly-content:validated .
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content build content-worker
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content up -d api content-worker
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
Los paquetes apt reciben correcciones de la distribución: para reproducir
exactamente una entrega conservar el digest final y `/opt/content-packages.txt`.

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

La calidad es independiente del perfil: rápido hace una pasada; equilibrado
añade orientación, deskew acotado y segunda pasada selectiva; alta precisión usa
`tessdata_best` y variantes controladas. No garantiza mayor exactitud en cada caso.
Los códigos iniciales son `spa` y `eng`. Los modelos adicionales deben incluirse
en una imagen administrada; alta precisión exige también su modelo `best`.

## Archivos nuevos, histórico y recuperación

El trigger de archivos añade trabajos en la misma transacción que registra un
original nuevo o cambiado, solo con políticas activas y heartbeat listo reciente.
No invoca parsers ni red. Sin worker no se acumula una cola ilimitada.
Los límites máximos son 4,000 trabajos activos globales y el máximo por empresa
(100 por defecto, configurable hasta 1,000). Se usan leases de 90 segundos,
heartbeat cada 15 segundos, reintentos limitados y backoff exponencial.
Un token de lease antiguo no puede publicar un resultado; se almacena su hash.

La indexación histórica exige autorización en ambas políticas y una acción
explícita de inicio. Recorre `file_asset` por cursor, hasta diez registros por
lote, sin enumerar buckets. Admite carpeta, prefijo MIME y fechas mediante API.
El cursor y el estado persisten. Pausar deja terminar el trabajo activo; cancelar
invalida también los trabajos históricos en cola/en proceso. Reanudar conserva
el cursor. Iniciar otra vez restablece el recorrido, sin repetir revisiones ya
registradas. El recorrido de archivos nuevos permite reconciliar eventos
perdidos con barridos acotados de modificaciones posteriores a la activación.

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

El worker usa exclusivamente `/content/worker/heartbeat`, `/claim` y
`/jobs/:id/source`, `/heartbeat`, `/result`, con Bearer operativo y
`X-Content-Lease` en cada operación del trabajo. No recibe acceso a base de datos,
Storage, rutas administrativas o identificadores arbitrarios de archivos.
Las respuestas y los tamaños están acotados. TLS y una red privada son
obligatorios para usar el mismo contrato fuera del host. No hay descubrimiento,
aprovisionamiento remoto ni política de firewall automática.

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

Cada página conserva texto original, texto normalizado, fuente digital/OCR,
referencia, palabras/coordenadas, confianza heurística y motor/modelo. Los índices
GIN actúan sobre `tsvector` simple, sin convertir identificadores ambiguos.
La búsqueda soporta acentos, mayúsculas, palabras, prefijos y frases entre
comillas. Usa cursor por identificador, sin conteos de candidatos privados.
Las coordenadas de imagen se remontan a la imagen mostrada tras EXIF; aún no hay
overlay del visor. Las coordenadas rasterizadas de PDF no se anuncian como puntos PDF.

## Dependencias y seguridad

Sin nuevas dependencias npm. Se reutilizan Hono, Zod, Prisma/pg, Storage y UI.
El worker añade Python/Pillow, Tesseract y Poppler desde Debian estable. Versiones
observadas: Python 3.13.5, Pillow 11.1.0 con parches Debian, Tesseract 5.5.0 y
Poppler 25.03.0 con parches Debian. Sus licencias son respectivamente PSF,
HPND, Apache-2.0 y GPL-2.0-or-later; conservar avisos/licencias al distribuir la imagen.
Los modelos best usan el commit `e2aad9b983032bb1beff9133104a67cdbb87ca4d`.

Se consultaron [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security),
[índices FTS de PostgreSQL](https://www.postgresql.org/docs/current/textsearch-indexes.html),
[calidad de Tesseract](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html) y
[modelos oficiales](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html).
El [tracker de Tesseract](https://security-tracker.debian.org/tracker/source-package/tesseract)
y el [tracker de Pillow](https://security-tracker.debian.org/tracker/source-package/pillow)
registran incidencias para versiones de distribución. Esto impide declarar
la imagen apta para producción sin resolver/evaluar los hallazgos aplicables.

## Verificación y limitaciones

Las pruebas están en `apps/api/src/services/content-intelligence/*.test.js` y
`apps/content-worker/test_worker.py`. La integración exige una base local vacía
llamada `content_intelligence_test`, indicada por `CI_CONTENT_DATABASE_URL`.
La fixture destruye únicamente sus tablas en esa base y rechaza otros nombres/hosts.
No usa el `.env` operativo. `CI_CONTENT_DOCKER=1` activa la prueba real de worker;
`CI_CONTENT_BENCH=1` añade el lote de 1,000 documentos sintéticos.

```sh
node --test apps/api/src/services/content-intelligence/*.test.js
docker run --rm --network none --cpus 0.5 --memory 1g --read-only --tmpfs /tmp:size=268435456,mode=1777 --mount type=bind,source="$PWD/apps/content-worker",target=/tests,readonly --workdir /tests runly-content:validated python3 test_worker.py
pnpm check:privacy
```

Para ejecutar el corpus, la imagen debe incluir solo `worker.py` en `/app`; el
montaje aporta pruebas y generadores sintéticos, nunca archivos operativos.
Resultados y estado por fase: `CONTENT_INTELLIGENCE_V1_RESULTS.md`.

Pendientes obligatorios de V1: QA visual real en escritorio/móvil/temas/teclado,
capturas de Archivos y administración, overlays y navegación de coincidencias,
benchmark comparativo del ERP completo, horarios de procesamiento, presupuestos
por empresa en tiempo/CPU, checkpoints de páginas reutilizables tras caída,
filtros de reproceso por calidad/motor/fallo y sus estadísticas/ETA. Tampoco están
implementados HEIC, corrección de perspectiva, búsqueda aproximada/subcadenas,
ranking de identificadores, etiquetas ni búsqueda global. No se generan PDFs
buscables. No se ofrece reconocimiento fiable de manuscritos o fotografías ilegibles.

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

Para rollback: guardar OFF, detener `content-worker`, conservar o desactivar
búsqueda y volver a las imágenes anteriores de API/web. La migración es aditiva;
mantener sus tablas permite recuperación. Para retirarla definitivamente, con
backup y servicio detenido, eliminar primero `content_file_queue` y
`content_file_invalidation` de `file_asset`, y después el esquema privado
`runly_content`. No tocar `file_asset`, versiones ni objetos originales.
