# Content Intelligence: runbook de certificación independiente

Este runbook permite certificar Content Intelligence en un host dedicado, sin
depender de la laptop de desarrollo. Los instrumentos están en
`scripts/content-certification/` y `apps/content-worker/`. Ninguno toca
producción: el laboratorio debe ser loopback y sus contenedores se llaman
`runly-content-*`; el driver se niega a ejecutarse de otro modo.

Estado de los instrumentos: ver "Ejecutado vs preparado" al final. Preparado no
significa superado.

## Recursos mínimos del host

| Perfil | Docker con | Libre en el host | Uso |
|---|---|---|---|
| `2x4` | 4 GB | 2 GB | Corpus Smoke/Standard, A/B pequeño |
| `4x8` | 8 GB | 4 GB | Corpus Standard, A/B, pérdida de worker/Postgres/Storage |
| `8x16` | 16 GB | 8 GB | Corpus Extended, A/B completo, soak, histórico grande |

El driver mide esto antes de cada escenario y registra `skipped` con el motivo
exacto si no se cumple. No se reduce el criterio para "hacerlo pasar".
Recomendado para la certificación formal: un host de 8 vCPU / 16 GB, sin otros
contenedores, con disco SSD y 60 GB libres.

## Preparación del laboratorio

1. Clonar el repositorio en el commit a certificar y construir la imagen del
   worker: `docker build -f infra/docker/content-worker.Dockerfile -t runly-content-cert:candidate .`
2. Levantar el laboratorio aislado con la pila desechable de Supabase y la API
   (los scripts existentes `scripts/content-intelligence-e2e.mjs` documentan las
   variables; el laboratorio usa solo cuentas `*.example.test` y datos sintéticos).
3. Exportar, sin imprimir valores:

```sh
export CI_CONTENT_API_URL=http://127.0.0.1:<puerto-api>
export CI_CONTENT_KONG_URL=http://127.0.0.1:<puerto-kong>
export CI_CONTENT_ENV_FILE=<archivo-env-del-laboratorio>
export CI_CONTENT_API_CONTAINER=runly-content-<api>
export CI_CONTENT_DB_CONTAINER=runly-content-<db>
export CI_CONTENT_STORAGE_CONTAINER=runly-content-<storage>
export CI_CONTENT_SUPPORT_CONTAINERS=<seis-contenedores-de-soporte-separados-por-coma>
export CI_CONTENT_DOCKER_NETWORK=<red-del-laboratorio>
export CI_CONTENT_WORKER_IMAGE=runly-content-cert:candidate
```

## Escenarios

```sh
node scripts/content-certification/run.mjs --list
node scripts/content-certification/run.mjs --only corpus-smoke --profile 2x4
node scripts/content-certification/run.mjs --all --profile 8x16 --out .artifacts/content-intelligence/cert
```

| Escenario | Qué prueba | Verificación posterior (no solo `/health`) |
|---|---|---|
| `corpus-smoke/standard/extended` | CER, WER, identificadores, recall y precisión de búsqueda, tiempo, RSS, pasadas, por modo de calidad | Informe `ocr-<tamaño>-<perfil>.md/json` |
| `erp-ab` | OCR ausente / inactivo / nuevos / histórico / alta precisión / presión, sobre rutas reales del ERP, p50/p95/p99 con IC bootstrap | Objetivo provisional p95 < 10 % |
| `historical` | Backfill mixto | Contadores reales |
| `e2e-browser` | Visor, overlays, cuatro anchos, oscuro | Capturas |
| `worker-restart` | `docker restart` del worker con trabajos activos | Subida nueva, estados terminales, sin duplicados, sin páginas huérfanas, sin leases vencidos, búsqueda |
| `postgres-restart` | Reinicio de PostgreSQL con carga | Consulta autenticada, subida, reclamación, finalización, búsqueda |
| `storage-interrupt` | Storage detenido 45 s | Igual; los trabajos deben recuperarse |
| `backfill-pause-resume` | Pausa sin progreso y reanudación | Sin duplicados al terminar |
| `soak` (`SOAK_MINUTES`) | Operación prolongada | Cola acotada, `/tmp` del worker sin crecimiento |
| `install-upgrade-rollback` | Manual (abajo) | Requiere dos versiones publicadas |

Cada ejecución escribe `cert-<perfil>.json` y `.md` con versiones, host, estado
por escenario (`passed`, `failed`, `error`, `skipped` con motivo). Para repetir
un escenario concreto basta `--only <id>`.

Corpus: `python3 corpus.py OUT --size smoke|standard|extended [--seed N] [--real DIR]`
dentro de la imagen del worker. Es sintético y reproducible (semilla fija); no
se versionan binarios. Fotografías reales autorizadas: colocar `FOTO.jpg` y
`FOTO.txt` (texto verdadero) en un directorio fuera de Git y pasar `--real DIR`.
Limitaciones del corpus sintético: fuentes limpias y uniformes, sin lente, moiré,
desenfoque de movimiento real ni superficies curvas; sobrestima la precisión.

## Pruebas con RLS y Storage reales (pendientes)

Requieren dos usuarios reales en dos empresas del laboratorio, cada uno con un
archivo privado con texto reconocible: verificar que el usuario B recibe 0
resultados en `/content/search`, 403/404 en `/content/files/:id` del archivo de
A, y que ninguna URL firmada de A funciona con la sesión de B. No sustituir por
pruebas unitarias.

## Instalación, estado, actualización y retiro

Instancia con código fuente (comandos del repositorio):

```sh
pnpm exec prisma migrate deploy
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content build api web-preview content-worker
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content up -d api web-preview content-worker
```

Requiere `RUNLY_CONTENT_WORKER_TOKEN` (32+ caracteres) en el entorno privado.
Instalador sin fuentes: `infra/installer/docker-compose.content.yml` con
`RUNLY_CONTENT_WORKER_IMAGE` y `--profile content`.

```sh
# Estado y registros
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content ps content-worker
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content logs --tail 50 content-worker
# Detener / recuperar
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content stop content-worker
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content up -d content-worker
# Desinstalar solo el worker (los resultados derivados se conservan)
docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content rm -sf content-worker
```

Las instancias de infraestructura dedicada solo cambian `RUNLY_CONTENT_CPUS` y
`RUNLY_CONTENT_MEMORY` y usan un perfil más alto desde la aplicación; la
instalación estándar usa el valor por defecto (0.5 CPU / 512 MiB).

### Experiencia esperada de una instancia existente

1. Actualizar Runly normalmente: continúa funcionando; el perfil por defecto es OFF
   y la migración no crea trabajos ni inicia histórico.
2. Instalar el worker opcional (comandos anteriores).
3. En Administración, la tarjeta muestra el estado operativo (Worker no instalado,
   desconectado, Operativo, Desactivado, Pausado manualmente, Pausado por recursos,
   Fuera del horario) y los límites físicos que el worker informa.
4. Elegir un perfil conservador (LIGHT o SMART) y la calidad; activar OCR de
   archivos nuevos.
5. En la empresa, habilitar la indexación histórica y pulsar "Iniciar histórico"
   una vez: el recorrido continúa solo con cursor persistente y cola acotada.
6. Pausar, reanudar o cancelar desde la misma pantalla; el progreso se ve ahí.

### Actualización y rollback

Hacer backup de políticas (`runly_content.policy`) y definiciones SQL antes de
actualizar. Actualizar: `prisma migrate deploy`, reconstruir/tirar la imagen del
API y del worker, `up -d`. Rollback conservador (verificado): guardar OFF, detener
el worker y conservar API/web actuales y las tablas. La reversión binaria a la
primera etapa no está verificada y requiere restaurar políticas compatibles y la
función de admisión de esa revisión; ensayarla en una copia aislada.

Ensayo de instalación nueva / actualización / rollback (manual, aislado): con dos
imágenes publicadas (anterior y candidata) y una base desechable clonada del
backup, aplicar migraciones de la anterior, crear archivos, actualizar a la
candidata, comprobar que `SELECT count(*) FROM runly_content.job` no cambia sin
activar nada, y después ejecutar el rollback conservador.

## Ejecutado vs preparado

Ver la sección "Etapa 3" de `CONTENT_INTELLIGENCE_V1_RESULTS.md`: lo que se
ejecutó en la laptop de desarrollo con su evidencia, y lo que solo está listo
para ejecutarse aquí.

## Etapa 4D: flujos añadidos y matriz de la etapa 5

Flujos de laboratorio nuevos (todos exigen las variables `CI_CONTENT_*` de un laboratorio aislado, contenedores `runly-content-*` y usuarios `*.example.test`):

| Flujo | Qué demuestra |
|---|---|
| `vertical-isolation.mjs` | Usuarios reales de dos empresas, ACL de archivos, invitaciones, reemplazo de versión, borrado/restauración, URL firmadas, cierre de sesión, purga concurrente. Crea y elimina solo sus propios usuarios y empresa (prefijo `iso-`) |
| `vertical-searchable.mjs` | PDF buscable de punta a punta con lector independiente (poppler), original intacto, rotación, ciclo de vida |
| `vertical-geometry.mjs` | Geometría contra verdad independiente, selección por arrastre y táctil, matriz visual |
| `vertical-heic.mjs` | HEIC en Chromium y Firefox con overlay alineado (requiere `RUNLY_CONTENT_HEIC=on` en el worker del laboratorio) |
| `vertical-formats.mjs` | HEIC, HEIC dañado, DOCX/XLSX/PPTX, Archivos sin OCR |

La matriz de certificación de la etapa 5, con comandos y criterios, está en `CONTENT_INTELLIGENCE_V1_RELEASE_CANDIDATE.md` §10.
HEIC permanece apagado en producción hasta cerrar la evaluación de sus bibliotecas nativas (`CONTENT_INTELLIGENCE_V1_SECURITY_REVIEW.md` §3).
