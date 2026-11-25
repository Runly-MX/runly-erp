# Checklist de aceptación del Release Candidate (Bloque D)

Estado: **preparado, no ejecutado.** Cada punto indica el entorno que lo cubre para no repetir instalaciones, builds ni arranques. Marcar `[x]` solo con evidencia y fecha (`Verified: AAAA-MM-DD (...)`).

## Entornos compartidos

| Entorno | Se crea una vez | Cubre |
|---|---|---|
| **E1. Árbol limpio en el SHA del RC** | `git clone` + `pnpm install --frozen-lockfile` | puntos 1-3, suite, seguridad, gates, SBOM |
| **E2. Stack Docker desde las imágenes del RC** (API, worker, web, PostgreSQL, Collabora opcional) | `pnpm docker:release` y arranque con la base de pruebas | puntos 4-10, 14 |
| **E3. Navegador + datos de prueba sobre E2** (Chromium; luego móvil con throttling) | Playwright contra E2 | puntos 11-13 |
| **E4. Dispositivos físicos y Tauri** | Teléfono Android/iOS, Windows | puntos 15-16 |

## Lista

Bloqueadores de publicación (B) y mejoras que pueden esperar (M).

| # | Comprobación | Entorno | Tipo |
|---|---|---|---|
| 1 | SHA definitivo fijado; árbol limpio; sin cambios de otras sesiones. Lockfile sin deriva: `pnpm install --frozen-lockfile` y `git diff --exit-code pnpm-lock.yaml` | E1 | B |
| 2 | Build reproducible: dos builds web seguidos con el mismo SHA dan los mismos hashes de chunks; gate `run-gates.mjs release` en verde | E1 | B |
| 3 | Suite general (`full-suite-baseline.mjs`) sin regresiones frente a `suite-failures-baseline.txt`; fallos restantes conocidos: 5 de Postgres de Website | E1 (+E2 para Postgres) | B |
| 4 | Imágenes API, worker y web construidas desde el **mismo SHA**; etiqueta y revisión coinciden en las tres | E2 | B |
| 5 | Arranque limpio, `/health`, comunicación API-worker-web-PostgreSQL, actualización sobre una instalación previa y reinicio | E2 | B |
| 6 | 5 pruebas de PostgreSQL de Website contra el contenedor (`website-*-postgres.test.js`) | E2 | B |
| 7 | Migraciones: aplicar sobre copia de la base previa; sin editar migraciones aplicadas; `prisma migrate status` limpio (incluye `20270116000000_content_intelligence_consolidation`, de otra sesión: confirmar que entra en el RC) | E2 | B |
| 8 | Backup y restauración de la base y de los archivos; rollback seguro (volver a la imagen anterior y a la base restaurada) | E2 | B |
| 9 | Seguridad: `pnpm test:security`, revocación de permisos en caliente (segundo usuario), cuarentena (módulo sin registro de confianza da 423 y no se carga), Secure Runtime apagado por defecto | E1+E2 | B |
| 10 | Módulos: instalar, actualizar, desinstalar y restablecer un módulo RME3; fachada declarativa; respuestas filtradas de `/blueprints` y `/runtime/modules` (`docs/audits/perf-f3/scripts/http-contract.mjs`, 17 comprobaciones) | E2 | B |
| 11 | Sincronización offline en navegador: primera sincronización de una empresa con más de 500 filas por entidad, interrupción y reanudación, cambio de empresa, revocación, mutación pendiente que coincide con un registro recibido | E3 | B |
| 12 | Rendimiento de navegación: recorrido login, Home, módulos, cambio de empresa (solicitudes duplicadas, `notifications/summary`, `sync/pull`); presupuestos de `perf-guards.mjs` | E3 | B |
| 13 | Memoria: navegación repetida de 10-15 min (heap, DOM, listeners, WebSockets, workers, object URLs); fugas confirmadas, no crecimiento temporal | E3 | M (B si hay fuga reproducible) |
| 14 | Compatibilidad Atlas y Developer Hub: ERP y Hub con el mismo Atlas (0.11.1), catálogos registrados, validación de audio/video por el sandbox del Hub (`MARKETPLACE_VALIDATOR_ROOT` preparado), orden de publicación ERP antes que el Hub | E2 + repo Hub | B |
| 15 | PWA: instalación, offline, actualización del service worker, notificaciones; en teléfono físico | E4 | B para la PWA publicada |
| 16 | Tauri: instalador de Windows, arranque, caché SQLite de ledger, actualización | E4 | M si el RC no incluye escritorio |
| 17 | GitHub Actions: los workflows del repositorio corren en verde sobre el SHA (rama de RC, sin push a producción) | remoto | B |
| 18 | Inventario de artefactos distribuidos: contenedores (imagen base y paquetes del sistema), binarios (`ffmpeg-core.wasm`, Piper, LibreDWG), fuentes, sonidos, `THIRD_PARTY_NOTICES` y SBOM regenerados desde el SHA; textos de licencia | E1+E2 | B (inventario); la revisión jurídica puede cerrarse en paralelo |

## Qué puede esperar a una versión posterior

- Sustitución de `country-state-city` (`RUNLY_GEO_SERVICE_PLAN.md`): requiere decisión sobre direcciones guardadas; no bloquea si se acepta el aviso en `THIRD_PARTY_NOTICES`.
- Núcleo FFmpeg LGPL (`RUNLY_LICENSE_INVENTORY_PRELIMINARY.md`): no bloquea si legal acepta el núcleo GPL como componente separado con oferta de fuente.
- Tombstones de borrados duros en el sync offline (solo calendario tiene tombstones lógicos): diseño en `RUNLY_PERFORMANCE_F3_4_RESULTS.md`.
- Perfiles de React más allá de lo medido, SBOM de licencias de Rust y Atlas/Hub completos.

## Bloqueadores externos conocidos

Revisión jurídica de GPL/ODbL y avisos; teléfonos reales; imágenes Docker del RC; decisión sobre las migraciones de otras sesiones presentes en el árbol.


## Estado tras Bloque D (2026-11-25)

Resumen del informe `RUNLY_PLATFORM_STABILIZATION_RC1.md`. `[x]` solo con evidencia; el resto sigue abierto.

| # | Estado | Evidencia o bloqueador |
|---|---|---|
| 1 | [x] | SHA del código `adbfdbb10`; solo cambian pruebas, scripts y documentación después. `pnpm install --frozen-lockfile` no se repitió (lockfile sin tocar). Verified: 2026-11-25 |
| 2 | [ ] | Dos builds web idénticos no se compararon; gate release en verde |
| 3 | [x] | Suite general 6916 pruebas, 0 fallidas, línea base vacía. Verified: 2026-11-25 |
| 4 | [x] | Imágenes API, worker y web desde `adbfdbb10` (`32d4d8794f7b`, `94a6a0890f4e`, `0873a407f7d2`). Verified: 2026-11-25 |
| 5 | [~] | API: arranque real con migraciones, seed y `/health` (5/5 no root). Web: arranca con API simulada. Worker: solo usuario y capacidades; falta arranque con el stack |
| 6 | [x] | 5 suites de PostgreSQL de Website, 86/86 en contenedor desechable. Verified: 2026-11-25 |
| 7 | [~] | Esquema completo aplicado sobre base vacía (imagen y sync) e historial histórico. Falta el ensayo de actualización con copia de datos de staging |
| 8 | [~] | Backup y restauración de PostgreSQL verificados con datos de prueba (filas, FK, índices, checksum). Falta ruta S3 con restic (la integración falla en el arnés), archivos y arranque tras restaurar |
| 9 | [~] | Seguridad 166/166, revocación y aislamiento de sync con base real. Falta revocación en caliente con segundo usuario contra una API real |
| 10 | [ ] | Instalación, actualización y desinstalación de módulos contra una API real no ejecutadas aquí |
| 11 | [~] | Sync offline contra PostgreSQL real 9/9; falta Chromium con IndexedDB real |
| 12 | [ ] | Sin medición nueva en navegador |
| 13 | [ ] | Memoria sin medir |
| 14 | [~] | Atlas 0.11.1 en ERP y Hub; 22 casos del validador compartido; falta el sandbox real del Hub |
| 15 | [ ] | Teléfonos físicos pendientes (lista en el informe) |
| 16 | [ ] | Tauri sin ejecutar |
| 17 | [ ] | GitHub Actions sin ejecutar (sin push) |
| 18 | [~] | SBOM npm y Rust, avisos y textos de licencia; faltan contenedores, binarios y revisión jurídica |
