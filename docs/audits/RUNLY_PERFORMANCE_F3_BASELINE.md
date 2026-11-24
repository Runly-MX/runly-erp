# Runly Performance Engineering F3.0 - Línea base de rendimiento y experiencia móvil

Fecha: 2026-11-23. Revisión auditada: `0ff88dc90` (main, árbol limpio de cambios funcionales).
Alcance: solo medición y análisis. No se modificó ningún archivo funcional, no hubo push, PR ni despliegue.
Evidencia reproducible: `docs/audits/perf-f3/` (scripts, resultados JSON, inventarios CSV).

## 1. Resumen ejecutivo

1. **La cifra de F0 "278 KB gzip antes del login" no describe lo que descarga el usuario.** `main.jsx` importa `AppEntry` de forma dinámica e incondicional y `AppEntry` contiene la pantalla de login. Medido en Chromium con caché fría, **ver el formulario de login descarga 6.3 MB en 162 solicitudes** (JS 2.41 MB gzip en 132 archivos, dos HTML de "loader" de ~1 MB cada uno, cuatro PNG de logo de ~2 MB en total, CSS y fuentes). El bootstrap de 271 KB es solo el primer salto.
2. **Cierre estático actualizado:** bootstrap 271 KB gzip (F0: 278), shell autenticado `AppEntry` **2 360 KB gzip / 8.6 MB raw en 129 archivos** (F0: 2 412 KB). La mejora desde F0 es de 2 %. El objetivo inicial de 500 KB está a 4.7x.
3. **En lab móvil el costo es dominante.** Con 4x CPU y 1.6 Mbps/150 ms (aprox. de gama media) el login aparece a los **22 s** (LCP 22.5 s, TBT 1.2 s); con una sesión existente el LCP de Home es de **34 s**. En gama baja simulada (6x, 0.7 Mbps) es de 48 s y 74 s. Sin throttling el LCP de Home ya es 5.4 s. Esto es consistente con la lentitud reportada en teléfonos.
4. **Tres causas explican la mayor parte del costo, todas corregibles sin quitar funcionalidad ni cambiar el diseño:**
   - Bytes: JS estático (2.36 MB) + imágenes/loader pre-login (4.1 MB, la mayoría evitable: un logo de 48 px pesa 540 KB) + `/blueprints` 3.5 MB y `/runtime/modules` 477 KB **sin compresión** en cada carga.
   - Estructura: el barrel `@runly/ui` y `manualChunks` (`ui-vendor`) arrastran al camino inicial PDF.js, Recharts, editores Lexical/MDXEditor/TipTap/Yjs, el builder de sitios web y todo `lucide-react` (import `* as`).
   - Cascada de arranque: ~35 solicitudes tras el login, duplicados (`/user/me` x2, `/notifications/summary` x2, `/instance/status` x3-4), `/memberships/me` mediano 885 ms, un piso artificial de 900 ms del loader y CLS 0.13-0.25.
5. **Memoria y estabilidad: sin fuga confirmada.** Tres rondas por 8 módulos (24 navegaciones) estabilizan el heap tras la primera ronda (desviación <= 0.8 MB por módulo), los listeners por módulo son idénticos entre rondas y el reposo de 90 s no crece (heap +0.3 MB, listeners 0, 12.7 solicitudes/min). Es evidencia corta: no descarta fugas lentas (soak de 30 min pendiente).
6. **Lo que NO se pudo medir** (ver sección 14): dispositivos físicos, Safari/WebKit, PWA instalada, host nativo, métricas de usuarios reales, latencia con la base de datos co-ubicada de producción, compresión/caché reales del borde de producción, perfiles de React Profiler.

Recomendación: ejecutar F3.1 (imágenes, loader, compresión/caché, duplicados) y F3.2 (lazy en barrel y vendor) primero. Son de esfuerzo bajo y riesgo bajo y, estimados, reducen la descarga de login de 6.3 MB a ~2.5 MB y el JS estático de 2.36 MB a ~1.6 MB.

## 2. Metodología y limitaciones

| Aspecto | Detalle |
|---|---|
| Build | `vite build` de producción sobre `0ff88dc90` hacia un directorio temporal (no se tocó `apps/desktop/dist`). 14 s. |
| Cierre estático | `scripts/closure.mjs`: sigue `imports` estáticos del manifest de Vite (no `dynamicImports`), gzip nivel 9. |
| Servidor | `scripts/serve.mjs`: replica nginx del repo (`index.html` no-store, `assets/*` sin `Cache-Control`), gzip nivel 6 solo para texto, proxy del mismo origen a una API aislada. **La API no comprime** (se mantuvo así a propósito). |
| API | API propia en puerto 4021 contra la base remota de desarrollo. Los servidores de desarrollo del usuario no se tocaron. |
| Navegador | Chromium (Playwright) con CDP: `Network`, `Performance`, `HeapProfiler`. Longtask, LCP, CLS, FCP, evento (INP aprox.) vía `PerformanceObserver`. |
| Perfiles | `desktop` sin throttling; `high` 2x CPU, 10 Mbps/40 ms; `mid` 4x CPU, 1.6 Mbps/150 ms; `low` 6x CPU, 0.7 Mbps/300 ms. Los tres móviles usan viewport 390x844, DPR 2, touch. |
| Repeticiones | **Una corrida por celda.** No se caracterizó la varianza; tratar diferencias < 15 % como ruido. |

Limitaciones que condicionan la lectura:

- **Emulación no es dispositivo físico.** El throttling de CPU de Chromium escala un procesador de escritorio; no reproduce memoria limitada, térmica, ni el motor JS de Safari. Los perfiles `mid`/`low` son una aproximación de laboratorio, no una predicción por modelo de teléfono.
- **"Tiempo hasta quieto"** (sin solicitudes en vuelo durante 2 s) es una cota superior: sondeos y presencia pueden retrasarlo. Se usa LCP, TBT y bytes como métricas primarias; en `mid` la recarga en caliente alcanzó el tope de 120 s del arnés y se descarta.
- **Latencia de API inflada:** la base de desarrollo está a ~84 ms por consulta (WAN). Los tiempos de API de este informe son cotas superiores respecto a producción co-ubicada; no son medidos de producción.
- LCP en sesión existente incluye la espera hasta que Home pinta contenido, no solo el shell.

## 3. Bundle de producción

### 3.1 Totales (build `0ff88dc90`)

| Conjunto | Archivos | Raw | Gzip | Nota |
|---|---:|---:|---:|---|
| Todo el build (JS) | 750 | 37.4 MB | 10.5 MB | no se descarga completo |
| Todo el build (CSS) | - | 887 KB | 126 KB | |
| Bootstrap `index.html` (JS) | 12 | 983 KB | 271 KB | F0: 278 KB |
| Cierre estático `AppEntry` (JS) | 129 | 8.6 MB | 2 360 KB | F0: 2 412 KB. Suma sobre el bootstrap: 2 092 KB |
| Cierre estático `AppEntry` (CSS) | - | 664 KB | 93 KB | |

Inventario completo: `perf-f3/data/chunks-static-closure.csv` y `chunks-lazy-top60.csv`. `modulepreload` en `index.html`: 11 chunks del bootstrap; no hay preload de `AppEntry` ni de sus 129 archivos, así que el navegador descubre el cierre por cascada de importaciones.

### 3.2 Qué hay en el cierre estático (gzip, mayores primero)

| Chunk | Raw KB | Gzip KB | Contenido (por sourcemap) | Por qué está en el camino inicial |
|---|---:|---:|---|---|
| `src` (barrel `@runly/ui`) | 1 995 | 543 | Lexical 128 KB, MDXEditor 106, prismjs 54, downshift 52, micromark 32, dnd-kit 37, react-hook-form, date-fns, ImageEditor, MediaGallery, AttachmentsPanel | `@runly/ui` se importa en 1 231 sitios; sin `sideEffects`/subpaths, el barrel entra completo |
| `ui-vendor` | 1 682 | 471 | **lucide-react 762 KB raw**, TipTap/ProseMirror/Yjs/lib0 (~400 KB raw), Radix, sonner | `manualChunks` agrupa Radix+TipTap+lucide+sonner en un solo chunk; `import * as LucideIcons` en >= 7 archivos impide el tree shaking |
| `react-vendor` | 613 | 185 | React, ReactDOM, router, scheduler | Necesario (piso) |
| `runlyBlocks` + `habitiaTemplate` | 828 | 186 | Plantillas y bloques del builder de sitios web | Alcanzable por arista estática desde `AppEntry` |
| `AppEntry` | 601 | 142 | Shell, Home, Work, Profile, ModuleOutlet, chat flotante, QuickNotes, login | Todo estático |
| `pdf` | 385 | 112 | pdfjs-dist (react-pdf) | `PDFViewer.jsx` exportado por el barrel |
| `atlas-web-builder` + `purify` | 363 | 111 | Editor de sitios | Arista estática desde `AppEntry` |
| `PieChart` | 335 | 95 | Recharts, redux-toolkit | `RunlyDashboard.jsx` en el barrel |
| `inviteResult` | 259 | 59 | Código del módulo chat (FloatingChatHub) | Montado siempre en `RunlyApp` |
| `supabase-vendor` | 191 | 48 | supabase-js | Necesario para sesión |
| `NoteEditor` | 121 | 34 | Editor de notas | Arista estática |
| `state-vendor` | 107 | 30 | TanStack Query, Zustand | Necesario |

Cadenas verificadas con `paths.mjs` (recorrido BFS desde `AppEntry`): `pdf` y `PieChart` llegan vía `src` (barrel); `atlas-web-builder`, `runlyBlocks`, `NoteEditor`, `inviteResult` y `sortable` son importados directamente por el chunk `AppEntry`.

Piso estimado del camino inicial: React 185 + supabase 48 + Query/Zustand 30 = 263 KB gzip irreducible, más código de shell y UI base.

### 3.3 Librerías pedidas: qué se descarga realmente

| Librería | En cierre estático | Peso lazy (incremental, gzip) | Comentario |
|---|---|---:|---|
| @runly/ui | **Sí, completo** | 543 KB (chunk `src`) | Principal fuente de peso evitable |
| Studio (incluye Fabric) | No | 332 KB | Lazy. Primera apertura: 11 029 nodos DOM, 714 ms de long tasks, 2.2 MB de API (desktop) |
| Website / Atlas Web Builder + bloques | **Sí** | ~297 KB (web builder 111 + blocks 186) | Debería ser lazy por módulo |
| Excalidraw | No | 316 KB (+ chunks de fuentes/subset) | Lazy. **El chunk proviene de `dist/dev/`** (ver P-14) |
| Fabric | No | dentro de Studio | Lazy |
| FFmpeg | No | ~1 KB al importar (el wasm se baja bajo demanda) | Lazy correcto (`loadFfmpeg.js`) |
| PDF.js | **Sí** (react-pdf) | 112 KB | Lazy sería suficiente |
| Tiptap | **Sí** (dentro de `ui-vendor`) y NoteEditor | ~110 KB est. + 34 | Se carga en cada pantalla |
| MapLibre | No | 275 KB | Lazy correcto |
| Recharts | **Sí** | 95 KB | Vía barrel |
| LiveKit | No (solo `CallsProvider` 8 KB) | CallRoom 209 KB | Lazy correcto |
| lucide-react | **Sí, completo** | ~762 KB raw en `ui-vendor` | Namespace imports |
| country-state-city | No | **city.js 2 102 KB gzip (7.9 MB raw)**, state 113 KB | Lazy, pero abrir un formulario de dirección en móvil descarga 2.1 MB |
| Mermaid | No | 40+ chunks por diagrama (~190-380 KB c/u) | Lazy; correcto |
| hls.js / jspdf | No | 172 KB / 125 KB | Lazy |

"Descargado" y "ejecutado" difieren: el cierre estático se descarga **y** se evalúa antes de pintar login. En `mid`, 2.4 MB de JS se traducen en ~1.2 s de TBT y 22 s de LCP; los chunks lazy solo cuestan al abrir el módulo.

## 4. Experiencia real de arranque (laboratorio)

### 4.1 Pantalla de login con caché fría (escritorio, sin throttling)

162 solicitudes, 6 274 KB:

| Recurso | KB | Observación |
|---|---:|---|
| JS (132 archivos) | 2 408 | cierre de `AppEntry` completo |
| `runly-loader.html` + `runly-loader-dark.html` | 2 118 | HTML de 1.4-1.5 MB con PNG base64; se piden **ambos** temas |
| Logos PNG (isotipo claro/oscuro 540+572 KB, logo claro/oscuro 477+412 KB) | ~2 000 | el splash muestra un `<img width=48>` de 540 KB; ambos temas se descargan aunque uno esté `display:none` |
| CSS | 101 | |
| Fuentes (Google Fonts, 7 familias, CSS bloqueante en `<head>`) | 50 | tercero, DNS+TLS adicionales |
| `/instance/status` x3 | 3 | 520-720 ms cada uno |

Tras el login: 41 solicitudes más, 4 228 KB, de los cuales `/blueprints` 3 510 KB, `/runtime/modules` 477 KB, `/sync/pull` 199 KB. Además `preloadCallSounds()` baja ~470 KB de mp3 (ringtone 359 KB) al arrancar.

### 4.2 Matriz de laboratorio (una corrida por celda)

| Perfil (aprox.) | Throttling | Login visible / LCP | TBT login | Sesión existente: LCP Home | TBT sesión | Long tasks (n / máx) | INP* | CLS sesión | Transferido sesión |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Escritorio | ninguno | 2.4 s | 114 ms | 5.4 s | 164 ms | 2 / 168 ms | 40 ms | 0.129 | 9.0 MB |
| Android gama alta (aprox.) | 2x, 10 Mbps/40 ms | 6.1 s | 396 ms | 9.1 s | 650 ms | 6 / 390 ms | 72 ms | 0.254 | 9.0 MB |
| Android gama media (aprox.) | 4x, 1.6 Mbps/150 ms | 22.5 s | 1 179 ms | 34.0 s | 2 091 ms | 19 / 955 ms | 120 ms | 0.250 | 9.0 MB |
| Android gama baja (aprox.) | 6x, 0.7 Mbps/300 ms | 48.2 s | 2 174 ms | 73.9 s | 4 507 ms | 32 / 1 522 ms | 184 ms | 0.251 | 9.0 MB |

*INP aproximado: máxima duración de evento observada durante el arranque; no es un INP de interacciones reales. FCP es 0.3-1.0 s en todos los perfiles porque el splash es HTML estático: **FCP engaña, LCP es la medida útil aquí**. TTFB del documento ~4 ms (servidor local; no representa red real).

| Perfil | iPhone antiguo / reciente, Safari, PWA, host nativo |
|---|---|
| Estado | **No medido.** Ver sección 8 para el protocolo de dispositivo físico. |

El CLS de 0.13-0.25 (umbral "bueno" 0.1, "malo" 0.25) no se atribuyó a un elemento: pendiente en F3.6.

## 5. React y renderizado

Hallazgos (por inspección de código y métricas de CDP; **sin React Profiler todavía**):

- Árbol de providers siempre montados: `PersistQueryClientProvider` (persister Dexie con `shouldDehydrateQuery: () => false`, es decir, no persiste nada pero mantiene la infraestructura), `TooltipProvider`, `AuthProvider`, `OfficeProvider`, `ImageEditingProvider`, `ViewerSharingProvider`, `ActiveCompanyProvider`, `RealtimeProvider`, `CallsProvider`. Siempre montados en el shell: `FloatingChatHub`, `QuickNotesWidget`, `CornerMenu`, `CommandPalette`, `AppLauncher`, `OfflineProvider`.
- **Piso artificial de 900 ms** (`MIN_LOADER_MS`) antes de mostrar la app, más un iframe de loader de ~1.4 MB. Costo directo en LCP incluso con API instantánea.
- Sin biblioteca de virtualización (0 coincidencias de `react-virtual`, `react-window`, `virtuoso`). Las tablas grandes dependen de paginación por pantalla; no se auditó cada una.
- Densidad: 143 usos de `backdrop-blur`/`backdrop-filter`, 355 de `animate-pulse`/`animate-spin`, 49 `setInterval`, 81 `refetchInterval` con ~12 cadencias distintas (5 s a 120 s). El costo de blur en GPUs móviles no se midió.
- Studio: 11 029 nodos DOM en la primera apertura (Home del módulo), long tasks de 714 ms (desktop) y 1 326 ms (4x CPU).
- No se añadió memoización: no hay perfil que la justifique.

Navegación entre módulos (desktop, SPA, `pushState`), ronda 1 / ronda 2: Inventario 2.96 s / 1.44 s, Compras 1.77 / 1.60, Chat 4.20 / 1.90, Calendario 1.75 / 0.82, Studio 6.83 / 0.99, Website 2.32 / 2.53, Builder 2.51 / 0.06. Esos tiempos son "hasta red quieta" (incluyen espera de API), no tiempo de render. Long tasks por navegación (desktop): Inventario 130-153 ms, Calendario 69-156 ms, Studio 355-714 ms; a 4x CPU: Inventario 2.2 s, Studio 1.3 s, Chat 1.2 s. Datos en `data/res-*-nav.json` (las cifras de red de `res-mid-nav.json` usaron una versión anterior de la heurística de quietud; solo son válidas sus long tasks).

## 6. Red y datos

### 6.1 Inventario de solicitudes tras el login (orden de llegada, 34 llamadas API)

`POST /auth/login` -> `GET supabase /auth/v1/user` -> `/user/me` -> `/instance/status` -> `/realtime/revision` -> `/memberships/me` -> `/user/me` (duplicado) -> `/chat/mirai/status` -> `/profile/status` -> `/notifications/dnd` -> `/companies/deletions` -> `/notifications/summary` -> `/chat/conversations` -> `/profile/me/preferences/{chat_prefs,app.view}` -> `/chat/external/inbox` -> `/calls/config` -> `/files/office/status` -> `/instance/config` -> `/runtime/modules` -> `/help/resolve?path=/` -> `/blueprints` -> `/profile/me/preferences/home.widgets` -> `/automation-approvals/mine` -> `/home-widgets` -> `/notifications/summary` (duplicado) -> `/help/resolve?path=/home` -> `POST /realtime/presence` -> `/calls/current` -> `/sync/pull?modules=...`.

Duplicados observados: `/user/me` x2, `/notifications/summary` x2, `/instance/status` x3 antes del login y 1 después, `/help/resolve` x2 (rutas `/` y `/home`).

### 6.2 Payloads y latencia de API (API aislada, base remota; mediana de 5 llamadas, `Accept-Encoding: identity`)

| Endpoint | Mediana | Raw | Gzip (estimado) | ETag | Nota |
|---|---:|---:|---:|---|---|
| `/health` | 1 ms | 0.1 KB | - | no | piso de la API |
| `/user/me` | 438 ms | 8.5 KB | 2.0 KB | no | llamado 2 veces |
| `/memberships/me` | 885 ms | 2.0 KB | 0.9 KB | no | ~9 consultas secuenciales a ~84 ms |
| `/runtime/modules` | 628 ms | **477 KB** | 126 KB | no | 35 módulos; core 44 KB, inventory 44 KB |
| `/blueprints` | 578 ms | **3 510 KB** | 859 KB | no | 211 blueprints; core 750 KB, inventory 640 KB, purchases 285 KB. 578 ms **con cache en memoria** en servidor: costo de serialización/filtrado |
| `/chat/conversations` | 802 ms | 3.8 KB | 1.5 KB | no | |
| `/notifications/summary` | 534 ms | 0.1 KB | - | no | 534 ms para 0.1 KB: consultas, no bytes |
| `/help/resolve` | 718 ms | 2.0 KB | 1.0 KB | no | |

Separación de capas:

- **Frontend:** carga de `/blueprints` y `/runtime/modules` en cada arranque (staleTime 5 min pero la caché no persiste: `shouldDehydrateQuery: () => false`); recarga en caliente baja otra vez 4.0 MB; duplicados y cascada.
- **Red:** ni `apps/api` ni `infra/**/spa.conf` activan compresión (sin `compress`, sin `gzip on`); `nginx:alpine` no la trae activa por defecto. A 1.6 Mbps, `/blueprints` tarda ~17.5 s sin comprimir y ~4.3 s con gzip. **Si el borde de producción comprime, este hallazgo se reduce; no pudo verificarse.** `assets/*` hasheados no llevan `Cache-Control`/`immutable` (solo `Last-Modified`): la frescura es heurística y cada recarga puede revalidar ~134 archivos.
- **API:** tiempos de 350-900 ms por endpoint trivial = N consultas secuenciales x latencia de DB; `/blueprints` gasta ~0.5 s de CPU/serialización con caché caliente.
- **Base de datos:** no se ejecutó `EXPLAIN` ni `pg_stat_statements`; **los índices no fueron auditados** (queda en F3.5, contra una base co-ubicada).
- Tiempos de `/sync/pull` (199 KB, 2.7 s) y `/runtime/modules`/`/blueprints` en cold-login (1.5-2.3 s) incluyen contención entre solicitudes concurrentes.

### 6.3 Reposo (90 s, sesión abierta)

19 solicitudes (12.7/min, 16 KB): `POST /realtime/presence` cada ~10 s, `GET /calls/current` cada ~20 s, más un refresco de `memberships`, `notifications/summary`, `companies/deletions`, `chat/conversations`. CPU de script 0.11 s en 90 s; heap +0.3 MB; listeners +0. Aceptable; el sondeo de presencia es optimizable pero no prioritario.

## 7. Memoria y estabilidad

Desktop, 3 rondas x 8 vistas (Inicio, Inventarios, Compras, Chat, Calendario, Studio, Website, Constructor de módulos) con GC forzado en cada medición:

| Vista | Heap ronda 1 / 2 / 3 (MB) | Listeners | Nodos DOM |
|---|---|---|---|
| Inventario | 29.6 / 40.4 / 40.7 | 474 / 474 / 474 | 1 626 / 1 673 / 1 673 |
| Compras | 28.9 / 37.4 / 37.8 | 445 / 445 / 445 | 1 782 / 1 824 / 1 824 |
| Chat | 32.4 / 39.0 / 39.1 | 486 / 486 / 486 | 1 755 / 1 790 / 1 790 |
| Calendario | 36.2 / 42.5 / 42.8 | 699 / 699 / 699 | 2 686 / 2 715 / 2 715 |
| Studio | 50.7 / 48.5 / 49.3 | 735 / 655 / 655 | 11 029 / 11 040 / 11 040 |
| Website | 36.1 / 37.3 / 37.8 | 438 / 438 / 438 | 1 778 / 1 780 / 1 780 |
| Builder | 37.3 / 37.7 / 37.8 | 451 / 451 / 451 | 1 796 / 1 796 / 1 796 |

Línea base 27.3 MB, final 37.8 MB. El salto de ronda 1 a 2 corresponde a cachés de TanStack Query y módulos ya evaluados (`gcTime` 10 min), no a crecimiento continuo: de ronda 2 a 3 el delta máximo es +0.8 MB (Studio). Los listeners y nodos por vista son constantes entre rondas, es decir, **los recursos se liberan al salir de cada módulo**. En el perfil `mid` (2 rondas) el heap fue 20.4 -> 20.5 MB.

**Fugas confirmadas: ninguna.** Limitación: 24 navegaciones no cubren Chat con realtime sostenido, llamadas, editores de canvas ni ciclos largos. Se requiere el soak de 30 min de F3.7 antes de declarar ausencia de fugas.

## 8. Dispositivos móviles: protocolo y matriz

| Clase | Proxy de laboratorio usado | Estado | Pendiente (físico) |
|---|---|---|---|
| Android gama baja | `low`: 6x, 0.7 Mbps/300 ms | Medido (aprox.) | Dispositivo con 2-3 GB RAM, Chrome estable |
| Android gama media | `mid`: 4x, 1.6 Mbps/150 ms | Medido (aprox.) | Dispositivo ~4-6 GB RAM |
| Android gama alta | `high`: 2x, 10 Mbps/40 ms | Medido (aprox.) | Dispositivo reciente |
| iPhone antiguo soportado | - | **No medido** | Definir iOS mínimo soportado; Safari Web Inspector |
| iPhone reciente | - | **No medido** | Safari + PWA |
| Safari / WebKit | - | **No medido** | Playwright WebKit en CI como señal, dispositivo para confirmar |
| Chrome | Chromium Playwright | Medido | - |
| PWA instalada | - | **No medido** | `chrome://inspect`, Lighthouse PWA, SW en caché fría |
| Host nativo (Tauri/Android) | - | **No medido** | Trace en WebView del host |

Protocolo por dispositivo: (a) arranque en frío (sesión cerrada, caché vacía), (b) sesión existente tras cierre forzado, (c) navegación Home -> Inventario -> Chat -> Calendario x5, (d) uso de 10 min con Chat y una llamada. Registrar LCP, TBT, long tasks, heap a 0 y 10 min, FPS durante scroll de tabla grande y apertura de Studio, temperatura/throttling del SoC. Herramientas: `chrome://inspect` + Performance (Android), Web Inspector (iOS), `scripts/measure.mjs` con CDP donde aplique. Nunca presentar el lab como equivalente.

## 9. Métricas: laboratorio vs usuarios reales

- **Laboratorio (este informe):** LCP, FCP, CLS, TBT (suma de long tasks > 50 ms), INP aproximado, bytes transferidos por tipo, solicitudes, heap, listeners, nodos, long tasks.
- **Usuarios reales (RUM): no existen datos.** No hay recolección de `web-vitals` en el repo; ningún número de este informe es campo. Se propone en F3.7 un endpoint ligero de métricas anónimas (LCP, INP, CLS, TTFB por ruta, clase de dispositivo, tipo de conexión) con muestreo.
- TTFB solo es representativo en producción real; aquí es de servidor local.

## 10. Presupuestos de rendimiento propuestos

Medidos en el perfil `mid` (4x CPU, 1.6 Mbps/150 ms) salvo que se indique. Los límites intermedios existen porque 500 KB desde 2 360 KB es un cambio de 4.7x: se escalona para poder verificarlo por fase.

| Área | Presupuesto objetivo | Hoy | Hitos intermedios |
|---|---|---|---|
| **Login** (pantalla visible, caché fría) | JS gzip <= 350 KB; transferencia total <= 700 KB; LCP <= 4 s (`mid`), <= 2.5 s (`high`); TBT <= 300 ms | 2 408 KB JS, 6 274 KB total, LCP 22.5 s | F3.1: total <= 3.0 MB. F3.3: JS <= 350 KB |
| **Shell principal** (JS estático gzip tras login) | **<= 500 KB objetivo**; tope duro de CI <= 650 KB | 2 360 KB | F3.2: <= 1 500 KB; F3.3: <= 1 000 KB; F3.4: <= 650 KB; luego 500 KB |
| Home con sesión existente | LCP <= 4 s (`mid`); CLS <= 0.1; solicitudes <= 25; bytes de API <= 150 KB gzip | LCP 34 s; CLS 0.25; 34 llamadas; 4.2 MB | |
| **Navegación entre módulos** (caliente) | usable <= 1.0 s desktop / <= 2.5 s `mid`; long task máx <= 200 ms (desktop) | 0.8-2.9 s desktop (red) ; long tasks hasta 714 ms | |
| **Módulo ordinario** (primera apertura) | JS incremental <= 250 KB gzip; API <= 100 KB | Inventario 35 KB JS, Chat 197 KB, Studio 336 KB | |
| **Editor avanzado** (Studio, Canvas, Website, Notas) | JS incremental <= 1.2 MB gzip, solo tras entrada explícita; nodos DOM iniciales <= 5 000; abrir <= 6 s `mid` con indicador | Studio 11 029 nodos, 2.2 MB de API | |
| **Uso prolongado** | heap +<= 10 % tras 30 min / 200 navegaciones; listeners +0 por ciclo; reposo <= 6 solicitudes/min | reposo 12.7/min; sin crecimiento observado en 24 navegaciones | |
| **Red y API** | JSON > 50 KB siempre comprimido; bootstrap p95 <= 300 ms contra DB co-ubicada (fijar tras medir producción); sin GET duplicado en un arranque; ETag/304 en `/blueprints` y `/runtime/modules` | 0 comprimidos, 0 ETag, 4 duplicados | |

**Sobre el objetivo de 500 KB:** el piso irreducible medido es 263 KB (React 185 + supabase 48 + Query/Zustand 30). Dejan ~240 KB para shell, UI base e iconos usados. Es alcanzable solo si el barrel de UI y el chat/notas/web quedan fuera del camino inicial (F3.2-F3.4); por eso se fija como objetivo, con tope duro de 650 KB hasta comprobarlo. Se revisará con la medición de F3.4.

## 11. Hallazgos priorizados

Impacto: bytes/tiempo ahorrables en `mid`. Evidencia: **M** = medido, **I** = inferido de código/estructura, **E** = estimado. Esfuerzo: S (<= 2 días), M (3-8), L (>8). Riesgo funcional/visual: B/M/A.

| ID | Hallazgo | Impacto | Evid. | Esf. | Riesgo | Orden |
|---|---|---|---|---|---|---:|
| P-01 | Logos de 48 px son PNG de 400-570 KB (x4) y se bajan ambos temas | -2.0 MB en login (32 % del total) | M | S | B | 1 |
| P-02 | Dos HTML de loader de ~1.0 MB (PNG base64) bajados ambos temas, más piso artificial de 900 ms | -2.1 MB y -0.9 s de LCP | M | S | B | 1 |
| P-03 | Sin compresión en API ni en nginx del repo: `/blueprints` 3.5 MB, `/runtime/modules` 477 KB (verificar en borde) | -3.0 MB en cada arranque (4:1) | M (tamaños), I (borde) | S | B | 1 |
| P-04 | `assets/*` sin `Cache-Control` ni `immutable` (revalidación de ~134 archivos por recarga) | RTTs x134 en red lenta | I | S | B | 1 |
| P-05 | `/blueprints` y `/runtime/modules` completos en cada carga, sin ETag ni persistencia; duplicados (`/user/me`, `/notifications/summary`, `/instance/status`, `/help/resolve`) | -3.99 MB por recarga; -4 solicitudes | M | M | M | 2 |
| P-06 | Barrel `@runly/ui` arrastra PDF.js (112 KB), Recharts (95 KB), Lexical/MDXEditor/prism/micromark (~90 KB est.), ImageEditor | ~300 KB gzip | M | M | B-M | 2 |
| P-07 | `manualChunks` junta TipTap/ProseMirror/Yjs con Radix/lucide en `ui-vendor`: todo editor en cada pantalla | ~110 KB gzip est. | M (composición), E (gzip) | S | B | 2 |
| P-08 | Builder de sitios + bloques/plantillas + NoteEditor + chat completo con arista estática desde `AppEntry` | ~340 KB gzip | M | M | M | 2 |
| P-09 | `import * as LucideIcons` en >= 7 archivos: todo lucide (762 KB raw) en `ui-vendor` | ~150-200 KB gzip est. | M (raw), E (gzip) | M | M (nombres de icono arbitrarios en blueprints) | 3 |
| P-10 | El login vive dentro de `AppEntry`: ver login exige el cierre de 2.4 MB | login JS 2 408 -> ~350 KB | M | M | M | 3 |
| P-11 | Cascada de arranque: ~34 solicitudes, `/memberships/me` 885 ms (~9 consultas), 4 duplicados | -1 a -3 s (depende de la red) | M | M | M | 3 |
| P-12 | Sonidos de llamada (470 KB) precargados al arrancar | -470 KB post-login | M | S | B | 1 |
| P-13 | CLS 0.13-0.25 sin atribuir | calidad de carga | M | S-M | B | 4 |
| P-14 | Excalidraw empaquetado desde `dist/dev/` en build de producción | hasta -30 % de ~316 KB + subsets (E) | I (por ruta) | S | B | 4 |
| P-15 | country-state-city: `city.js` 7.9 MB raw / 2.1 MB gzip en un solo chunk | -2 MB al abrir formularios de dirección en móvil | M | M | B | 4 |
| P-16 | Studio: 11 029 nodos y 714 ms de long tasks al abrir; 2.2 MB de API | percepción en móvil | M | M | M | 4 |
| P-17 | Google Fonts: 7 familias bloqueantes de tercero (+ Sora en el loader) | RTT y bloqueo de render en redes lentas | I | S | B | 4 |
| P-18 | Sin virtualización; 143 `backdrop-blur`; polling disperso | sin medir | I | L | M | 5 (tras perfil) |
| P-19 | Latencia de API: endpoints triviales 350-900 ms por consultas secuenciales | depende de la DB de producción | M (lab), no verificado en prod | M | M | 3 |

Priorización (impacto alto / riesgo bajo primero): P-01, P-02, P-03, P-04, P-12 (F3.1) -> P-06, P-07, P-08 (F3.2) -> P-09, P-10, P-05 (F3.3-F3.4) -> resto.

## 12. Plan F3.1 a F3.8

Cada fase termina con la medición del mismo arnés (`perf-f3/scripts`) y un registro comparativo. Ninguna fase elimina funciones ni cambia el diseño.

| Fase | Contenido | Hallazgos | Meta medible | Esfuerzo / riesgo |
|---|---|---|---|---|
| **F3.1 Bytes baratos** | Re-exportar logos a tamaños reales (WebP/PNG optimizado); cargar solo el tema activo; reducir loader HTML (sin base64, solo tema activo); quitar el piso de 900 ms cuando ya hay datos; precarga de sonidos al primer gesto; activar gzip/brotli en nginx y `compress` en la API; `Cache-Control: immutable` para `assets/*` | P-01..04, P-12 | Login: 6.3 MB -> <= 3.0 MB; `/blueprints` en red 3.5 MB -> ~0.9 MB (si el borde no ya comprimía) | S / B |
| **F3.2 Lazy de peso conocido** | Subpaths o `lazy()` para `PDFViewer`, dashboards con Recharts, editores Markdown/Lexical e `ImageEditor`; partir `ui-vendor` (TipTap fuera); lazy de builder web/bloques/NoteEditor; revisar build prod de Excalidraw | P-06, P-07, P-08, P-14 | Cierre estático 2 360 -> <= 1 500 KB | M / B-M |
| **F3.3 Login mínimo y arranque** | Separar la ruta de login del shell (`RunlyApp` lazy); registro de iconos acotado o `dynamicIconImports`; ordenar el arranque con prefetch (`modulepreload` del shell tras mostrar login) | P-09, P-10 | Login JS <= 350 KB; shell <= 1 000 KB | M / M |
| **F3.4 Shell y barrel** | `@runly/ui` en subpaths/`sideEffects: false`; Home/Work/Help/Profile/CommandPalette/chat flotante/QuickNotes en lazy; presupuesto de CI activo | P-06 (resto) | Shell <= 650 KB, luego 500 KB | L / M |
| **F3.5 API y datos de arranque** | ETag/`If-None-Match` y revisión de módulos para `/blueprints` y `/runtime/modules`; persistencia por revisión en IndexedDB; endpoint de bootstrap agregado o paralelización; eliminar duplicados; recortar blueprints por módulo; auditoría de índices con `pg_stat_statements` y `EXPLAIN` contra DB co-ubicada | P-05, P-11, P-19 | <= 25 solicitudes, bytes de API <= 150 KB gzip, 0 duplicados | M-L / M |
| **F3.6 Render y fluidez** | Perfiles React Profiler de Home, Inventario, Chat, Studio; atribuir CLS; virtualizar tablas grandes solo donde el perfil lo pida; evaluar `backdrop-blur` en móvil; reducir DOM inicial de Studio; `country-state-city` por país bajo demanda | P-13, P-15, P-16, P-18 | CLS <= 0.1; long tasks <= 200 ms; Studio <= 5 000 nodos | M-L / M |
| **F3.7 Dispositivos, RUM y soak** | Pruebas físicas (sección 8); RUM `web-vitals` con muestreo; soak de 30 min / 200 navegaciones con chat y llamada | todos | Primeros datos de campo; fugas confirmadas o descartadas | M / B |
| **F3.8 Regresión en CI** | Sección 13 | todos | Gates activos | S-M / B |

## 13. Propuesta de pruebas de regresión de rendimiento (CI)

1. **Gate de bundle (barato, determinista, en cada PR):** `scripts/closure.mjs` sobre el build; falla si el cierre estático supera el presupuesto vigente (hoy 2 360 KB; baja por fase), si el bootstrap supera 300 KB, o si alguno de estos paquetes aparece en el cierre estático: `pdfjs-dist`, `recharts`, `@tiptap/*`, `prosemirror-*`, `yjs`, `lexical`, `@mdxeditor`, `atlas-web-builder`, `mermaid`, `excalidraw`, `fabric`, `livekit-client`, `maplibre-gl`, `country-state-city`. Anotar el delta en el PR.
2. **Gate de activos pre-login:** falla si un archivo servido pre-login (`public/runly/*`) supera 100 KB o el HTML de loader supera 150 KB.
3. **Gate de payload de API:** contra una API efímera de CI, `apilat.mjs` falla si `/blueprints` o `/runtime/modules` superan su presupuesto en bytes comprimidos, si falta `ETag`, o si una sola carga de arranque hace GET duplicados.
4. **Prueba de laboratorio (nocturna o etiquetada, no por PR):** `measure.mjs` perfil `mid`, 3 repeticiones, mediana; compara LCP, TBT, transferencia y solicitudes contra el último baseline guardado con tolerancia de 20 % (la varianza de una corrida aislada no está caracterizada). Publicar JSON como artefacto.
5. **Soak semanal:** 200 navegaciones, heap/listeners/nodos; falla si el delta heap entre mitad y final supera 10 % o listeners crecen.
6. **Métricas de campo:** alertas sobre LCP/INP p75 por ruta cuando exista RUM (F3.7). No bloquear PR con datos de campo.
7. Mantener una versión de Chromium fijada para comparabilidad; registrar versión y perfil en cada resultado.

## 14. Qué no se midió y riesgos de interpretación

- Dispositivos físicos, Safari/WebKit, PWA, host nativo, red real, usuarios reales (RUM).
- Producción: compresión y caché del borde, latencia con DB co-ubicada, tamaño real de `/blueprints` por empresa (la empresa de prueba tiene 35 módulos instalados).
- Índices y planes de consulta; React Profiler; atribución de CLS; costo de `backdrop-blur`; tablas grandes con miles de filas; llamadas y chat en uso real.
- Una corrida por celda; sin intervalos de confianza. El tiempo hasta "quieto" no es "interfaz utilizable".
- Las estimaciones de gzip por librería (lucide, TipTap, MDXEditor) provienen de bytes raw por sourcemap, no de gzip aislado. Confirmar en F3.2/F3.3 con el build real antes de comprometer metas.
- La aproximación `mid`/`low` sobre un procesador de escritorio probablemente subestima el costo en teléfonos de gama baja con poca RAM.

## 15. Reproducción

Todo vive en `docs/audits/perf-f3/scripts/` (usa `playwright` del monorepo y variables de entorno, sin credenciales en archivo):

```bash
cd apps/desktop && npx vite build --outDir <tmp>/dist --emptyOutDir --manifest
node scripts/closure.mjs <tmp>/dist <tmp>/closure.json     # cierre estático, preload
node scripts/paths.mjs <tmp>/dist pdf- recharts            # por qué un chunk está en el camino inicial
RUNLY_API_PORT=4021 node apps/api/src/index.js              # API aislada
node scripts/serve.mjs <tmp>/dist 4173 4021 1               # servidor tipo nginx + proxy
E2E_USER_EMAIL=... E2E_USER_PASSWORD=... PERF_COMPANY_ID=... PERF_OUT=<out> PERF_STATE=<out>/state.json \
  node scripts/measure.mjs mid cold      # perfiles: desktop|high|mid|low; escenarios: cold|session|nav|idle
node scripts/apilat.mjs                                     # latencia y payload de API
```

`compose.mjs` atribuye bytes de un chunk a paquetes mediante sourcemap (build con `--sourcemap`). Datos de esta auditoría: `docs/audits/perf-f3/data/`.
