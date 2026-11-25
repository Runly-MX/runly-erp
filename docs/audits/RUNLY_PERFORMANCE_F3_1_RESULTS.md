# F3.1 results: immediate optimizations (in progress)

Estado: **parcial, no cerrado.** SHA del candidato: `d6ff0fca5` más commits posteriores solo de documentación (código idéntico a `7273cdfb3`/`61b6658b4`). Control: `119eac8e9` (estado medido por F3.0). Fecha: 2026-11-24.

## 1. Alcance y cambios

| Intervención | Commit |
|---|---|
| Imágenes de marca a su tamaño de uso, loader sin PNG duplicados, sin espera de 900 ms | `5688dda00` |
| nginx: gzip estático, `immutable` en `assets/` con hash | `23cc4b900`, afinado en `cf29c3531`, `61b6658b4` |
| `/instance/status` en una sola clave de caché; `/user/me` compartido en vuelo | `6e8a1b1bb` |
| API: gzip y ETag débil en `/blueprints` y `/runtime/modules` | `7273cdfb3` |

Inventario de imágenes (tamaño en disco, original a variante): isotipo 540-570 KB a 4-5 KB (48 px) y 20-23 KB (loader 216 px a 2x); wordmarks 410-570 KB a 5-6 KB; HTML del loader 1.45/1.53 MB a 8 KB. Los originales se conservan para correos, PDF, stores e iconos nativos. Quedan sin tratar: `og-image.png` (568 KB, solo metadatos sociales), `runly-app-icon-*` (1.1-1.2 MB, iconos de app), `pdf.worker.min.mjs` (1 MB, diferido).

## 2. Método

- Dos builds con `pnpm install --frozen-lockfile` limpio (como la imagen web), base `/app/`, `MSYS_NO_PATHCONV=1`. Sus carpetas `assets/` difieren en 19 bytes: el código JavaScript de ambos es prácticamente el mismo.
- Servidor de laboratorio (`scripts/serve.mjs`) que replica nginx (index `no-store`, `assets/` con la política de cada variante, gzip nivel 6), mismo proxy a una API aislada (puerto propio, base de pruebas remota).
- Perfiles: `desktop` (sin estrangulamiento) y `mid` (CPU x4, 1.6 Mbps, 150 ms; **es una aproximación de laboratorio, no un teléfono**). 5 ejecuciones por variante y perfil, intercaladas control/candidato, Chromium.
- Cada ejecución: arranque en frío con login; sesión existente con recarga.
- **Entorno de la prueba**: estación Windows 11, API remota (latencia 350-900 ms por consulta, no representativa de producción). Varianza entre corridas mostrada como (mín..máx).

## 3. Resultados (mediana, mín..máx, n=5)

| Profile | Metric | Control (F3.0 state) median (min..max) | Candidate median (min..max) | Delta |
|---|---|---|---|---|
| desktop | login visible ms | 2568 (2233..2592, n=5) | 1674 (1534..1691, n=5) | -35% |
| desktop | login KB | 6637 (6637..6637, n=5) | 2538 (2538..2889, n=5) | -62% |
| desktop | login JS KB | 2207 (2207..2207, n=5) | 2207 (2207..2207, n=5) | 0% |
| desktop | login requests | 162 (162..162, n=5) | 160 (160..161, n=5) | -1% |
| desktop | login FCP ms | 224 (212..236, n=5) | 212 (208..224, n=5) | -5% |
| desktop | login LCP ms | 2336 (2284..2396, n=5) | 1604 (1552..1740, n=5) | -31% |
| desktop | login TBT ms | 87 (81..92, n=5) | 89 (82..92, n=5) | 2% |
| desktop | post-login KB | 4754 (4754..4754, n=5) | 4232 (4232..4709, n=5) | -11% |
| desktop | post-login JS KB | 9 (9..9, n=5) | 9 (9..9, n=5) | 0% |
| desktop | post-login requests | 40 (40..40, n=5) | 40 (40..43, n=5) | 0% |
| desktop | login to usable ms | 6671 (6318..7239, n=5) | 6334 (5908..6777, n=5) | -5% |
| desktop | post-login TBT ms | 107 (94..122, n=5) | 96 (91..110, n=5) | -10% |
| desktop | warm reload ms | 6552 (6243..7032, n=5) | 6074 (5787..6257, n=5) | -7% |
| desktop | warm reload KB | 4018 (4018..4018, n=5) | 4018 (4018..4018, n=5) | 0% |
| desktop | warm reload requests | 185 (185..185, n=5) | 185 (185..185, n=5) | 0% |
| desktop | warm API calls | 29 (29..29, n=5) | 29 (29..29, n=5) | 0% |
| desktop | session first-load KB | 9893 (9893..9901, n=5) | 7087 (6737..7087, n=5) | -28% |
| desktop | session first-load requests | 189 (189..194, n=5) | 189 (189..189, n=5) | 0% |
| mid | login visible ms | 21484 (21247..21729, n=5) | 15961 (15372..16238, n=5) | -26% |
| mid | login KB | 6612 (6612..6612, n=5) | 2515 (2515..2515, n=5) | -62% |
| mid | login JS KB | 2207 (2207..2207, n=5) | 2207 (2207..2207, n=5) | 0% |
| mid | login requests | 156 (156..156, n=5) | 159 (159..159, n=5) | 2% |
| mid | login FCP ms | 532 (528..544, n=5) | 532 (512..560, n=5) | 0% |
| mid | login LCP ms | 21592 (21336..21984, n=5) | 15900 (15456..16180, n=5) | -26% |
| mid | login TBT ms | 1093 (856..1320, n=5) | 1434 (1036..1657, n=5) | 31% |
| mid | post-login KB | 4782 (4781..4782, n=5) | 4234 (4233..4234, n=5) | -11% |
| mid | post-login JS KB | 9 (9..9, n=5) | 9 (9..9, n=5) | 0% |
| mid | post-login requests | 49 (47..50, n=5) | 44 (43..45, n=5) | -10% |
| mid | login to usable ms | 30101 (29039..33582, n=5) | 27312 (26944..27955, n=5) | -9% |
| mid | post-login TBT ms | 1805 (1296..2119, n=5) | 2129 (1433..2422, n=5) | 18% |
| mid | warm reload ms | 28310 (28185..29540, n=5) | 28300 (28030..28703, n=5) | 0% |
| mid | warm reload KB | 4045 (4045..4053, n=5) | 4020 (4020..4031, n=5) | -1% |
| mid | warm reload requests | 193 (193..198, n=5) | 190 (189..190, n=5) | -2% |
| mid | warm API calls | 34 (34..39, n=5) | 34 (33..34, n=5) | 0% |
| mid | session first-load KB | 9871 (9871..9871, n=5) | 6739 (6738..6740, n=5) | -32% |
| mid | session first-load requests | 189 (189..189, n=5) | 192 (192..193, n=5) | 2% |

Medición adicional (escritorio, n=5, navegación normal con caché HTTP caliente, `docs/audits/perf-f3/scripts/measure.mjs`): **sin diferencia** entre control y candidato (6315 ms vs 6067 ms, -4 % dentro del ruido; 4021 KB y 186 solicitudes en ambos).

### Lectura

- **Transferencia del login: -62 %** (6.6 MB a 2.5 MB), por las imágenes y el loader. **LCP del login: -31 % en escritorio y -26 % en el perfil móvil simulado**, y tiempo hasta ver el formulario -35 %/-26 %. Aquí el LCP sí mejora por una causa medida: el elemento LCP era el loader de 1.4 MB. El efecto sobre LCP no se infiere del tamaño de archivos.
- **JavaScript del login: 2207 KB en ambos. Sin mejora.** Es lo que F3.2 debe atacar; ninguna de las medidas de F3.1 lo toca. La cifra de 2.4 MB de F3.0 estaba inflada por el entorno: el `node_modules` del repo principal se había desviado del lockfile (Excalidraw `dev.js` en lugar de `prod.js`, versiones extra de React). La instalación limpia que usa Docker resuelve `prod`. **El baseline de JavaScript correcto es 2207 KB.**
- **TBT del login en perfil móvil: +31 % (1093 a 1434 ms)** con intervalos que se solapan (856-1320 vs 1036-1657). Es compatible con ruido, pero no demuestra lo contrario; probablemente el trabajo de JavaScript, que no cambió, ya no está oculto detrás de una descarga más larga. No se afirma mejora ni empeoramiento.
- **Caché caliente:** la recarga con `reload()` revalida todo y esconde el efecto de `immutable`; en la navegación normal, ambos casos quedan cubiertos por caché heurística porque los archivos del laboratorio son más viejos que 10 días. **No hay mejora medida por `immutable`.** Su valor es estructural: tras un despliegue real, los archivos recién publicados no tendrían frescura heurística útil y revalidarían hasta ~764 recursos; esto no está verificado en este laboratorio.
- **Primera carga con sesión (caché fría): -28 % / -32 % en bytes.**
- **Tiempo hasta interfaz usable tras el login: -5 % / -9 %**, con rangos que casi se tocan. Tampoco se afirma como mejora firme.

### Solicitudes redundantes (observado en una ejecución de cada variante, tras la sesión)

| Solicitud | Control | Candidato |
|---|---|---|
| `/instance/status` antes del login | x3 | x1 |
| `/instance/status` con sesión | x2 | x2 |
| `/user/me` | x2 | x2 |
| `/notifications/summary`, `/memberships/me`, `/chat/conversations`, `/companies/deletions`, `/realtime/presence` | x2 / x2 / x2 / x2 / x3 | **x1 cada una** |

La caída de las cinco últimas no la explican directamente mis cambios; coincide con quitar la espera de 900 ms (menos remontajes durante el arranque), pero **no lo probé aislando la causa**. `/user/me` sigue duplicado en el login (una petición del inicio de sesión y otra de `SIGNED_IN`) y `/instance/status` en sesión; quedan abiertos.

## 4. Compresión de la API (medido contra la API aislada con el código nuevo)

| Ruta | Sin comprimir | gzip | Revalidación (304) |
|---|---|---|---|
| `/blueprints` | 3 594 201 B (1.31 s) | **880 076 B** (0.64 s) | 0 B |
| `/runtime/modules` | 488 113 B | **129 179 B** | 0 B |

Estas cifras son de una petición con la API local contra una base remota; el laboratorio A/B de la sección 3 se hizo **antes** de esta API (la API aislada usaba el código anterior), por lo que el ahorro de `/blueprints` no aparece en esas tablas. Las dos columnas del A/B contienen los 3.5 MB sin comprimir en ambos lados.

## 5. Seguridad de caché y compresión

Ver clasificación completa en `RUNLY_PLATFORM_F1B_CONSOLIDATION_RESULTS.md` sección 5. Resumen: gzip de nginx solo en estáticos; rutas proxy con `gzip off`; la API comprime una lista cerrada de dos rutas con `private, no-cache` y `Vary: Authorization, X-Runly-Company-Id`; el 304 solo ocurre con cuerpo idéntico para ese usuario y empresa (prueba de unidad). No se probaron en este laboratorio: login/logout, cambio de empresa ni revocación de permisos contra la caché HTTP del navegador (la garantía descansa en `no-cache` y en la prueba de ETag).

## 6. No medido / pendiente

- Firefox, WebKit, dispositivos físicos, PWA, Tauri.
- Actualización entre dos versiones consecutivas sin limpiar caché (política diseñada, no ejercitada en un navegador).
- CPU y memoria durante el login, y TBT/INP con instrumentación de React (F3.4).
- Comparación A/B con la compresión de la API activa en ambos lados.
- `/notifications/summary` como duplicado: ya no se observa en esta ejecución, causa no aislada.
- Atlas 0.11.0 sigue sin confirmación de su responsable (bloqueador de release).

## 7. Reproducción

`docs/audits/perf-f3/scripts/`: `runs.sh` (A/B intercalado), `measure.mjs`, `aggregate.mjs`, `serve.mjs` (`PERF_IMMUTABLE=1`), `visual.mjs`.


> **Nota de trazabilidad (2026-11-24, `RUNLY_BUILD_REPRODUCIBILITY_REPORT.md`):** varias cifras de JavaScript de este informe se midieron en árboles con un `.env` local que contiene `NODE_ENV=development`, lo que empaquetaba la versión de desarrollo de Excalidraw (+3.1 MB sin comprimir) y alteraba el reparto de chunks. Las cifras no se han modificado; el informe de reproducibilidad explica cuáles se ven afectadas. La referencia limpia actual del login crítico es 611 KB (control 2207 KB).
