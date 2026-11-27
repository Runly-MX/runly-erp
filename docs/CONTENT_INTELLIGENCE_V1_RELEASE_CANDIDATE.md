# Content Intelligence V1: Release Candidate (etapa 4D)

Estado del alcance: **congelado**. Desde esta etapa solo se admiten seguridad, estabilidad, compatibilidad, privacidad, corrección de defectos y preparación de lanzamiento.
No se incorporó reconocimiento de objetos, QR, códigos de barras, embeddings, modelos generativos, autocompletado de Inventarios ni servicios externos.
Este documento declara un Release Candidate **preparado**, no certificado. La certificación operativa y de rendimiento del ERP es la etapa 5.

## 1. Resumen ejecutivo

Se auditó de forma crítica todo el código de Content Intelligence y se corrigieron dos defectos P1 de corrección de coordenadas (CropBox ignorado; texto girado mal orientado en PDF buscables),
siete P2 (red del worker, 500 en rutas de administración, objetos huérfanos de derivados, errores de parser sin código, PDF cifrados, capa de texto Windows-1252, índice de descubrimiento)
y se reconcilió la política de ciclo de vida de derivados. Se verificó con identidades reales (32/32) que no hay exposición entre empresas ni acceso indebido a derivados.
La imagen del worker, endurecida y sin red salvo la API, mantiene 0 críticas y 1 alta (falso positivo de Scout ya corregido en Alpine 3.24).
**El decodificador HEIC se dejó apagado por defecto** porque sus bibliotecas nativas no están certificadas (CVE-2026-62291 de libheif sin versión corregida, x265 sin evaluar).
HEIC sigue disponible como capacidad explícita; cuando se enciende, la foto se ve en Chromium y Firefox mediante el servicio de transformación de imágenes que ya existía.

## 2. HEAD inicial y final, commits

- HEAD inicial de la etapa: `08ebc346f`.
- Commits de la etapa 4C (cinco, no seis; el sexto referido en el encargo no existe): `324e4721e` (Office), `2434f5af6` (HEIC), `e371a09f6` (PDF buscables, selección, perspectiva), `22c5e23d2` (acciones, polígonos, drag, flujos), `08ebc346f` (resultados 4C).
  Intercalados en `main` hay commits ajenos de otras sesiones (`3ae266cf5`, `0048f394f`, `cccd9ddc8`) que no se tocaron.
- Commits de la etapa 4D: ver §21 (se completa al cerrar).

## 3. Clasificaciones (independientes)

| Dimensión | Estado | Justificación |
|---|---|---|
| Funcional | **Funcionalmente completo en laboratorio** para el alcance congelado | Todas las funciones prometidas existen y están verificadas con flujos reales. Falta certificar con fotografías reales y Extended, que son compuertas de la etapa 5, no funciones |
| Seguridad | **Pendiente de certificación** | Compuertas de seguridad superadas en laboratorio salvo: HEIC sin certificar (apagado por defecto), sin host dedicado, sin RLS directo vía PostgREST con tokens de usuario |
| Operativo | **APTO PARA PRUEBAS AISLADAS** | Sin certificación de rendimiento, instalación/actualización/reversión con dos versiones publicadas, soak ni host dedicado. No eleva a staging |

## 4. Compuertas de salida de la etapa

| Compuerta | Resultado |
|---|---|
| P0/P1 de seguridad sin resolver | Ninguno |
| Exposición cruzada de datos entre empresas | No observada |
| Acceso no autorizado a derivados | No observado |
| Bibliotecas nativas relevantes sin evaluar y habilitadas | Ninguna habilitada: HEIC apagado por defecto |
| Vulnerabilidades altas explotables sin mitigación | Ninguna |
| Corrupción silenciosa de texto | No observada; defectos de coordenadas P1 corregidos |
| Resultados de versiones antiguas presentados como vigentes | No observado |
| Pérdida de originales | No observada |
| Derivados incompletos presentados como correctos | No observado |
| Errores críticos de instalación opcional | Ninguno observado; una instalación sin worker no cambia (el worker es perfil opcional) |
| Defectos de concurrencia que comprometan integridad o privacidad | Ninguno abierto (carreras de derivados cubiertas; ver revisión de seguridad §6) |

## 5. Migraciones

Orden y naturaleza (todas aditivas, forward-only; ninguna toca migraciones entregadas):

| Migración | Contenido |
|---|---|
| `20270115000000_content_intelligence` | Esquema privado `runly_content`, RLS sin políticas, triggers de invalidación y admisión |
| `20270116000000_content_intelligence_consolidation` | Intentos, totales, mantenimiento, admisión que respeta interruptores |
| `20270117000000_content_intelligence_heic` | `enqueue_file()` admite `image/heic|heif` |
| `20270118000000_content_searchable_pdf` | Tabla `derivative` (única por archivo/revisión), RLS, índices |
| `20270119000000_content_derivative_reconcile` | Columna `bucket`, tabla `derivative_orphan` con CHECK de prefijo, trigger BEFORE DELETE, índice parcial de descubrimiento |

Verificado: cadena completa sobre un esquema vacío (prueba PostgreSQL: 7 superadas, 1 omitida por requerir Docker), aplicación incremental sobre la base del laboratorio (instalación existente) y reversión (`audits/content-intelligence-stage4d/rollback-4c-4d.sql`, ejecutada sobre la base desechable: tablas e índice eliminados).
`CREATE INDEX` sobre `file_asset` no es `CONCURRENTLY` (el sistema de migraciones usa transacción): en instalaciones muy grandes créese antes con `CREATE INDEX CONCURRENTLY IF NOT EXISTS file_asset_entity_enabled_id_idx ON file_asset (entity_id, id) WHERE enabled` y la migración quedará sin efecto.
Rollback: las migraciones son aditivas; revertir significa parar API y worker nuevos, ejecutar el SQL de reversión (descarta derivados y sus objetos) y restaurar la definición de `enqueue_file()` de la consolidación si debe dejar de admitirse HEIC.
Los workflows de integración (`uuid-policy`, `supabase-schema-ownership-policy`, `verify-postgrest-exposure`, `verify-module-security`) se ejecutaron localmente y pasan.

## 6. Compatibilidad de actualización

- La actualización del ERP no activa OCR: el perfil por defecto es `OFF` y el worker es un perfil de composición opcional.
- API nueva con worker antiguo: el protocolo 2 no cambia; el worker antiguo no reclama derivados (el endpoint `/derivative/claim` no se le ofrece) y sigue procesando trabajos de OCR. La capacidad `heif` es opcional en el latido.
- Worker nuevo con API antigua: `/derivative/claim` devuelve 404; el worker lo trata como «sin trabajo» (el bucle captura el error y reintenta tras 10 s). No probado con una API real de una versión anterior; requiere dos versiones publicadas.
- Preferencias existentes: no se sobrescriben; la calidad por defecto de **nuevas activaciones** es `balanced` (`policySchema` ya la fija), `fast`, `balanced` y `accurate` siguen disponibles e independientes del perfil de rendimiento.

## 7. Qué se ejecutó y qué no

Ejecutado en laboratorio: pruebas de worker (unidad), pruebas de API y PostgreSQL, flujos `vertical-formats` (14), `vertical-searchable` (18), `vertical-geometry` (21), `vertical-isolation` (32), `vertical-heic` (Chromium y Firefox), `vertical-historical`, `vertical-viewer`/`vertical-pdf`, y el driver `run.mjs` con escenarios pequeños (ver §9).
No ejecutado (requiere host dedicado, dos versiones publicadas o datos reales): perfiles 2x4/4x8/8x16 completos, corpus Extended, fotografías reales, backfill de gran volumen, soak de 60 minutos, instalación nueva/actualización/reversión con imágenes publicadas, regresión completa del ERP, RLS directo vía PostgREST con tokens de usuario.

## 8. Workflows que dispararía un push a `main` (no se hizo push)

| Workflow | Disparador | ¿Despliega? |
|---|---|---|
| Quality Gates | push a `main`, PR, manual | No (lint, políticas, guardias; el nivel `release` solo por etiqueta o manual) |
| Security Gates | todo push y PR | No |
| Supabase Schema Ownership Policy | todo push y PR | No |
| UUID Policy | todo push y PR | No |
| Shared packages controlled release | solo `workflow_dispatch`; publica únicamente si se marca `publish` y existe el entorno protegido | No automático |

Ningún workflow construye ni publica imágenes Docker ni despliega código en un push.

## 9. Herramientas: preparadas, verificadas y certificadas

| Herramienta | Estado |
|---|---|
| `lab.mjs`, `run.mjs --list` | Verificadas (arrancan, validan entorno aislado, listan escenarios) |
| `run.mjs` escenarios `corpus-smoke`, `worker-restart`, `storage-interrupt`, `postgres-restart`, `backfill-pause-resume` | Verificadas en el laboratorio (resultados en `audits/content-intelligence-stage4d/driver/`) |
| `run.mjs` `corpus-standard`, `historical`, `e2e-browser` | Verificadas en etapas previas; no repetidas en 4D |
| `run.mjs` `corpus-extended`, `erp-ab`, `soak`, `install-upgrade-rollback` | **Preparadas**, no verificadas: requieren host dedicado o dos versiones |
| `vertical-*.mjs` (formats, searchable, geometry, isolation, heic, historical, viewer, pdf) | Verificadas y repetibles en laboratorio |
| Escenarios certificados | **Ninguno**: la certificación es la etapa 5 |

## 10. Matriz de certificación de la etapa 5

Criterios medibles; cada fila debe dejar JSON/MD en `audits/content-intelligence-stage5/`.

| # | Escenario | Comando | Criterio de aprobación |
|---|---|---|---|
| 1 | A/B de rendimiento del ERP (ausente/inactivo/nuevo/histórico/alta precisión/presión) en 2x4, 4x8, 8x16 | `node scripts/content-certification/run.mjs --only erp-ab --profile <perfil>` | p95 y p99 de rutas del ERP sin degradación estadísticamente significativa frente a «ausente» (IC bootstrap 95 %); límites de CPU/memoria del worker respetados |
| 2 | Corpus Extended (≈500) | `... --only corpus-extended --profile 4x8` | Sin errores; CER/identificadores no peores que Standard en más de 2 puntos |
| 3 | Fotografías reales autorizadas | `python apps/content-worker/corpus.py DIR --size standard --real RUTA` + `evaluate.py` | Informe separado de sintético; identificadores ≥ 0.85 en etiquetas legibles |
| 4 | Backfill de gran volumen | `... --only historical` con ≥ 50 000 archivos sintéticos | Cola ≤ límite; cursor reanuda; sin duplicados; consulta de descubrimiento p95 < 50 ms |
| 5 | Soak | `SOAK_MINUTES=720 ... --only soak` | Memoria y cola acotadas; `/tmp` sin crecimiento |
| 6 | Reinicios | `... --only worker-restart,postgres-restart,storage-interrupt,backfill-pause-resume` | Invariantes: sin duplicados, sin páginas huérfanas, sin leases vencidos |
| 7 | Instalación nueva sin OCR / con worker | procedimiento del runbook | ERP funcional; worker conectado; OCR apagado hasta activarlo |
| 8 | Actualización desde versión sin CI / desde worker anterior | requiere dos imágenes publicadas | Sin activación automática; compatibilidad de protocolo |
| 9 | Reversión | `rollback-4c-4d.sql` + imagen anterior | ERP intacto; originales intactos |
| 10 | Regresión del ERP | `node scripts/ci/run-gates.mjs release` y suite | Sin fallos nuevos |
| 11 | HEIC | tras cerrar CVE-2026-62291 y decidir x265 | `RUNLY_CONTENT_HEIC=on` solo con evaluación de CVE completa |
| 12 | RLS directo en PostgREST | `verify-postgrest-exposure` con tokens de usuario real | Esquema `runly_content` no expuesto |

## 11. Comandos exactos de laboratorio (esta etapa)

```bash
source .artifacts/content-intelligence/stage4c-env.sh   # variables CI_CONTENT_* del laboratorio aislado
node scripts/content-certification/vertical-isolation.mjs
node scripts/content-certification/vertical-searchable.mjs
node scripts/content-certification/vertical-geometry.mjs
node scripts/content-certification/vertical-heic.mjs
node scripts/content-certification/vertical-formats.mjs
CI_CONTENT_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/content_intelligence_test node --test apps/api/src/services/content-intelligence/
docker run --rm --network none --entrypoint python3 -v "$PWD/apps/content-worker:/app:ro" -w /app runly-content-stage4c:candidate -m unittest test_worker test_governor
```

## 12. Pendiente (gates abiertos)

1. HEIC: CVE-2026-62291 (libheif) y x265 sin evaluar; alternativa preferida: compilar libheif/libde265 sin x265 con fijación por hash.
2. Certificación de rendimiento y soak en host dedicado (etapa 5).
3. Dos versiones publicadas para probar actualización y reversión.
4. Fotografías reales autorizadas y corpus Extended.
5. Cierre de sesión: el token de acceso vive hasta su expiración (plataforma).
6. Vulnerabilidades de Studio (`fabric`, `image-size`): hallazgos de plataforma fuera de este alcance.

## 13. Commits y estado de Git

Se completa al cerrar la etapa (§2 y siguiente): sin push, sin despliegues, cambios ajenos conservados.
