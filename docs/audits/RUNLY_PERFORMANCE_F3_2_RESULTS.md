# F3.2 results: load architecture and bundles (in progress)

Estado: **parcial, no cerrado.** Código medido: `4e50b506d`, `9794cf89b`, `3ab7aa152` y `c14397e98` (el grupo `editor-vendor` de `239c62962` se revirtió en `3ab7aa152`). Control: `119eac8e9` (instalación limpia). Fecha: 2026-11-24. Metodología, entorno y límites de laboratorio: igual que `RUNLY_PERFORMANCE_F3_1_RESULTS.md` §2 (perfil `mid` es una aproximación de laboratorio, no un teléfono; base remota de desarrollo).

## 1. Cambios

| Intervención | Efecto medido (login en frío, una carga) |
|---|---|
| AppEntry carga `AuthenticatedShell` y todas las pantallas de ruta con `lazy` (nuevo `app/AuthenticatedShell.jsx`) | JS 2207 a 1557 KB; archivos 131 a 46 |
| `"sideEffects": ["**/*.css"]` en `@runly/ui` (antes no había el campo; verificado que el único efecto al importar son CSS) | 1557 a 944 KB; el chunk del barrel `src` 493 a 41 KB |
| tiptap fuera del chunk `ui-vendor` (sin grupo propio) | 944 a 769 KB |
| Precarga en reposo del shell y de Home mientras se usa el formulario de login | Quita la cascada tras el login (ver §3) |

Solo el primer paso solo **no** habría bastado: `sideEffects` solo, sobre el `AppEntry` estático, dejó el JS en 2243 KB (más archivos). Hace falta el corte de `AppEntry` **y** el campo de efectos.

Intento descartado: un grupo manual `editor-vendor` para tiptap/prosemirror/yjs. Rolldown emitió dentro de él el React core y react-dom (no una segunda copia: la misma, en el chunk equivocado), así que 554 chunks lo importaban y el login seguía descargando 185 KB de editor (ver `RUNLY_REACT_VERSION_MATRIX.md` §4). Se revirtió; queda comentado en `vite.config.js`.

## 2. Resultados (mediana, mín..máx, n=5)

Control no intercalado con esta última ronda del candidato (misma máquina, mismo día, control medido en la ronda anterior).

| Profile | Metric | Control (F3.0 state) median (min..max) | Candidate median (min..max) | Delta |
|---|---|---|---|---|
| desktop | login visible ms | 2591 (2209..2596, n=5) | 1580 (1536..3387, n=5) | -39% |
| desktop | login KB | 6637 (6637..6988, n=5) | 2128 (1772..2128, n=5) | -68% |
| desktop | login JS KB | 2207 (2207..2207, n=5) | 1464 (1464..1464, n=5) | -34% |
| desktop | login requests | 162 (162..163, n=5) | 216 (215..216, n=5) | 33% |
| desktop | login FCP ms | 244 (212..404, n=5) | 212 (204..696, n=5) | -13% |
| desktop | login LCP ms | 2324 (2296..2372, n=5) | 1564 (1360..3160, n=5) | -33% |
| desktop | login TBT ms | 84 (81..90, n=5) | 0 (0..0, n=5) | -100% |
| desktop | post-login KB | 1754 (1754..1754, n=5) | 1233 (1233..1233, n=5) | -30% |
| desktop | post-login JS KB | 9 (9..9, n=5) | 10 (10..10, n=5) | 11% |
| desktop | post-login requests | 40 (40..40, n=5) | 41 (41..42, n=5) | 3% |
| desktop | login to usable ms | 6899 (5910..7229, n=5) | 6632 (5601..7490, n=5) | -4% |
| desktop | post-login TBT ms | 92 (86..130, n=5) | 15 (7..28, n=5) | -84% |
| mid | login visible ms | 21554 (21371..21578, n=5) | 6850 (6814..6980, n=5) | -68% |
| mid | login KB | 6612 (6612..6612, n=5) | 1754 (1749..1756, n=5) | -73% |
| mid | login JS KB | 2207 (2207..2207, n=5) | 1464 (1464..1464, n=5) | -34% |
| mid | login requests | 156 (156..156, n=5) | 214 (214..214, n=5) | 37% |
| mid | login FCP ms | 536 (512..560, n=5) | 548 (516..972, n=5) | 2% |
| mid | login LCP ms | 21656 (21456..21768, n=5) | 6996 (6892..7104, n=5) | -68% |
| mid | login TBT ms | 1053 (991..1131, n=5) | 535 (436..585, n=5) | -49% |
| mid | post-login KB | 1780 (1780..1780, n=5) | 1234 (1234..1235, n=5) | -31% |
| mid | post-login JS KB | 9 (9..9, n=5) | 10 (10..10, n=5) | 11% |
| mid | post-login requests | 46 (45..46, n=5) | 43 (42..44, n=5) | -7% |
| mid | login to usable ms | 14170 (13749..14970, n=5) | 13528 (11621..14579, n=5) | -5% |
| mid | post-login TBT ms | 1591 (1503..1697, n=5) | 1091 (904..1163, n=5) | -31% |

## 3. Lectura honesta

- **Ruta crítica del login:** el formulario es utilizable con **769 KB de JS** (control: 2207 KB), -65 %. Tiempo hasta ver el formulario -39 % (escritorio) y -68 % (móvil simulado); LCP -33 % y -68 %; TBT del login 84 a 0 ms (escritorio) y 1053 a 535 ms (móvil).
- **La precarga cuenta.** Tras mostrar el formulario se precarga en reposo el shell: el JS descargado en la página de login pasa a **1464 KB** (-34 % frente a 2207 KB), pero fuera de la ruta crítica. Sin precarga, el JS posterior al login era 704 KB y el **tiempo hasta usable empeoraba +29 % en el perfil móvil simulado** (14.2 a 18.3 s) por la cascada login, shell, pantalla; con la precarga ese empeoramiento desaparece (-4 %/-5 %, con rangos que se solapan: **no se afirma mejora**).
- **Presupuestos provisionales:** login completo 500 KB: **no se cumple** (769 KB crítico, 1.46 MB con precarga; transferencia total 1.4-2.1 MB). JS estático tras el login 500 KB gzip: **no se cumple** (el shell y los providers suman ~700 KB). Quedan ~300 KB de `ui-vendor` (lucide-react completo por los `import * as`), `react-vendor` 127 KB, `supabase-vendor` 49 KB.
- La precarga consume datos en conexiones lentas aunque el usuario no inicie sesión; si se prefiere ahorrar datos, habría que condicionarla a `navigator.connection.saveData` (no implementado).
- Variación: el rango alto de 3.4 s en una ejecución de escritorio y los valores de 118 s de otras tablas son ejecuciones atípicas del laboratorio (timeouts); la mediana las absorbe pero no se investigaron.

## 4. Verificación funcional

Smoke autenticado de 12 pantallas (home, work, profile, help, notes, inventory, calendar, chat, website, studio, files, pfm) contra el control y el candidato: sin errores de página ni de assets nuevos. Único error repetido en ambos: HTTP 423 de un módulo personalizado en cuarentena (comportamiento esperado de Stage 1). **No cubierto:** abrir un editor tiptap real, Excalidraw, colaboración, llamadas, PWA, Firefox/WebKit, móvil físico.

## 5. Hallazgos para seguir

- React: unificado a 19.3.1 en ERP (`82c7ff827`); ver `RUNLY_REACT_VERSION_MATRIX.md`. El bundle de ERP ya tenía una sola copia por `resolve.dedupe`; lo que había eran versiones distintas en el lockfile.
- `lucide-react` entra completo (762 KB sin comprimir) por 10 archivos con `import * as`; sustituirlos por un registro controlado es el siguiente paso (D.4).
- `country-state-city` (GPL-3.0, 2.1 MB): decisión de sustitución pendiente del frente legal.
- Excalidraw: con instalación limpia se resuelve `prod`; el `dev` de F3.0 era un artefacto del `node_modules` desfasado del repo principal. Falta verificarlo funcionalmente.

## 6. Pendiente de F3.2

Paso 3 (subpath exports de `@runly/ui` y compatibilidad con RME3/SDK/Hub), paso 5 de iconos, lazy loading de los providers que siguen estáticos (Office, ImageEditing, ViewerSharing, BugReportHost), `country-state-city`, Excalidraw funcional, y el informe de compatibilidad con módulos RME3 compilados contra los shims.

## 7. Reproducción

`docs/audits/perf-f3/scripts/`: `login-closure.mjs`, `smoke.mjs`, `runs.sh`, `aggregate.mjs`.

## 8. Actualización posterior (iconos y variación entre instalaciones)

**Variación entre instalaciones del mismo lockfile.** Al medir de nuevo en un worktree recién creado e instalado (`--frozen-lockfile`) obtuve cifras absolutas distintas a las de las secciones anteriores para los **mismos commits**: control `119eac8e9` 2398 KB de JS en el login (antes 2207), etapa con shell lazy 1684 KB (antes 1557), etapa con `sideEffects` 1019 KB (antes 944), etapa final 845 KB (antes 769). La reducción relativa se mantiene (**-65 %**: 2398 a 845 KB), pero **el valor absoluto depende del estado de `node_modules`** aunque el lockfile sea idéntico (el reparto de React entre chunks cambia: `react-vendor` 127 KB gzip en un entorno y 185 KB en otro). Es otro caso de irreproducibilidad del entorno; los números absolutos de F3.1/F3.2 deben leerse con ese margen y toda comparación futura debe hacerse en un mismo worktree limpio. Método de esta sección: JS de ruta crítica con la precarga desactivada (`NOPREFETCH=1 node login-closure.mjs`), una sola carga por build; **no es una mediana de 5 ejecuciones**.

**Iconos.**
- Sustituir `import * as Lucide` por imports con nombre en `field-icon-inference.js` (`75b60eef3`) **no cambió** el JS crítico (845 KB antes y después): la librería completa entraba por otra vía.
- Causa real: `lucide-react` estaba en el grupo manual `ui-vendor`, y el shim `ext-lucide-react` (`export * from 'lucide-react'`, entrada de build para módulos RME3) comparte ese grafo, así que el grupo retenía los **761 KB** de la librería completa en el login. Sacarla del grupo (`vite.config.js`) deja a la aplicación empaquetar solo los iconos que importa: **JS crítico 845 a 687 KB (-19 %)** y `ui-vendor` de 300 a 98 KB gzip, a costa de más archivos pequeños (66 a 126 archivos; con HTTP/2 y caché inmutable es barato, pero el A/B de solicitudes está pendiente).
- Se conserva la capacidad de los módulos: el shim sigue exportando **6470 nombres, idéntico antes y después** (comprobado importando el shim construido); los iconos de los módulos del menú se ven en una captura de Home.
- Quedan sin tratar los `import * as` de `module-icon-registry`, `icon-library/registry`, `DetailHero`, `StatStrip`, `FormPreviewPanel`, `DetailViewDesignerParts`, y los de canvas y `builderHelpers`: ninguno estaba en la ruta del login; sí lo estarán cuando se abran esas pantallas. Su ahorro no se midió.

**Presupuesto:** login crítico 687 KB de JS (sin comprimir la transferencia total 1.3 MB): sigue **sin cumplir** los 500 KB.


> **Nota de trazabilidad (2026-11-24, `RUNLY_BUILD_REPRODUCIBILITY_REPORT.md`):** varias cifras de JavaScript de este informe se midieron en árboles con un `.env` local que contiene `NODE_ENV=development`, lo que empaquetaba la versión de desarrollo de Excalidraw (+3.1 MB sin comprimir) y alteraba el reparto de chunks. Las cifras no se han modificado; el informe de reproducibilidad explica cuáles se ven afectadas. La referencia limpia actual del login crítico es 611 KB (control 2207 KB).

## 9. Matriz de precarga del shell (2026-11-24)

Build limpio de `33ef31881` sin `.env` (`pnpm build:web`), servidor de laboratorio con la política de nginx, API aislada. Script `docs/audits/perf-f3/scripts/prefetch-matrix.mjs`, datos crudos `docs/audits/perf-f3/data/prefetch-matrix.jsonl`. Medianas de **3 ejecuciones** por celda (sin dispersión publicada; muestra pequeña). `none` = A (sin precarga), `idle` = B (la precarga anterior), `adaptive` = C (solo con señal de intención, respeta `saveData` y conexiones lentas, pausada si la página está oculta), `selective` = D (como C, solo el shell).

| scenario | profile | strategy | n | JS at form KB | JS before submit KB | JS total KB | transfer total KB | submit→usable ms |
|---|---|---|---|---|---|---|---|---|
| immediate | desktop | adaptive | 3 | 607 | 658 | 1638 | 2478 | 5017 |
| immediate | desktop | idle | 3 | 1627 | 1627 | 1638 | 2129 | 4627 |
| immediate | desktop | none | 3 | 607 | 607 | 1638 | 2677 | 4961 |
| immediate | desktop | selective | 3 | 607 | 658 | 1638 | 2677 | 5157 |
| no-network-api | desktop | adaptive | 3 | 607 | 1627 | 1638 | 2479 | 4304 |
| no-network-api | desktop | idle | 3 | 1627 | 1627 | 1638 | 2478 | 4311 |
| no-network-api | desktop | none | 3 | 607 | 607 | 1638 | 2326 | 4824 |
| no-network-api | desktop | selective | 3 | 607 | 1595 | 1638 | 2677 | 4812 |
| savedata | desktop | adaptive | 3 | 607 | 607 | 1638 | 2677 | 4863 |
| savedata | desktop | idle | 3 | 607 | 607 | 1638 | 2677 | 4804 |
| savedata | desktop | none | 3 | 607 | 607 | 1638 | 2326 | 4895 |
| savedata | desktop | selective | 3 | 607 | 607 | 1638 | 2677 | 4844 |
| typing | desktop | adaptive | 3 | 607 | 1627 | 1638 | 2478 | 4288 |
| typing | desktop | idle | 3 | 1303 | 1627 | 1638 | 2478 | 4787 |
| typing | desktop | none | 3 | 607 | 607 | 1638 | 2326 | 5363 |
| typing | desktop | selective | 3 | 607 | 1595 | 1638 | 2677 | 4822 |
| typing | mid | adaptive | 3 | 607 | 857 | 1638 | 2105 | 14168 |
| typing | mid | idle | 3 | 607 | 861 | 1638 | 2105 | 14067 |
| typing | mid | none | 3 | 607 | 607 | 1638 | 2105 | 18893 |
| typing | mid | selective | 3 | 607 | 859 | 1638 | 2105 | 15305 |
| visit-only | desktop | adaptive | 3 | 607 | 607 | 607 | 1256 | - |
| visit-only | desktop | idle | 3 | 1124 | 1627 | 1627 | 2291 | - |
| visit-only | desktop | none | 3 | 607 | 607 | 607 | 1256 | - |
| visit-only | desktop | selective | 3 | 607 | 607 | 607 | 1256 | - |

Lectura:
- **Visitante que solo ve el formulario** (rebote): `none`, `adaptive` y `selective` descargan 607 KB de JS; `idle` descarga **1627 KB** (+1020 KB de JS y +1035 KB de transferencia total) sin que nadie interactúe. Es el coste que la precarga anterior imponía a quien no inicia sesión.
- **Usuario que escribe sus credenciales:** en el perfil móvil simulado el tiempo del envío hasta la pantalla utilizable es 18.9 s sin precarga, 14.2 s con `adaptive`, 14.1 s con `idle` y 15.3 s con `selective`; en escritorio 5.4, 4.3, 4.8 y 4.8 s. `adaptive` e `idle` son equivalentes para quien interactúa; con n=3 no distingo entre ellos.
- **Inicio inmediato** (relleno y envío a la vez, p. ej. gestor de contraseñas): ninguna estrategia mejora (≈5.0 s); `adaptive` solo añade 51 KB antes del envío.
- **`saveData`:** `adaptive`, `selective` e `idle` no precargan (607 KB antes del envío).
- **Sin Network Information API** (Safari, Firefox): `adaptive` espera la intención y entonces precarga; no hay descarga automática por falta de datos.
- La transferencia total hasta la pantalla utilizable es la misma (≈1638 KB de JS) en todas las estrategias que llegan a ella: la precarga **mueve** la descarga, no la elimina. Lo que cambia es quién la paga (el que no inicia sesión ya no) y cuándo.

**Decisión: `adaptive` (C)** es el valor por defecto (`lib/shellPrefetch.js`): iguala a `idle` para quien interactúa, elimina el coste del rebote y respeta `saveData`. `selective` ahorra ~32 KB pero es más lenta en el perfil móvil simulado.

No cubierto: sesión existente (no pasa por el formulario), PWA, hosts nativos, Safari real (solo se simuló la ausencia de la API), una condición de 3G real y el uso con red intermitente.

## 10. Estado frente a los presupuestos (build limpio, `33ef31881`)

| Presupuesto | Resultado | Cumple |
|---|---|---|
| Login completo 500 KB transferidos | 1256 KB de transferencia total (607 KB de JS, el resto CSS, imágenes y fuentes) | **No** |
| JS estático posterior al login 500 KB gzip | ≈1030 KB adicionales de JS tras el login (1638 menos 607) | **No** |
| CLS ≤ 0.1 | 0.00 en el login (A/B de F3.1 y F3.2) | Sí |
| Sin espera artificial de arranque | Eliminada (`5688dda00`) | Sí |

Contribuyentes restantes de la ruta crítica de login: ver `RUNLY_PROVIDERS_MATRIX.md` §4 (React DOM y Router 127 KB, Radix 92 KB, Supabase completo 49 KB, framer-motion 39 KB, barrel de `@runly/ui` 68 KB). El siguiente trabajo con mejor relación esfuerzo/beneficio es importar solo `auth` de Supabase y diferir framer-motion en el login.

## Anexo: descomposición de la transferencia del login (2026-11-25)

Medido con `perf-f3/scripts/login-resources.mjs` (Chromium escritorio, build local servido con gzip, API no disponible, una carga en frío, 6 s tras mostrar el formulario). La suma reproduce la última medición (1256 KB; JS 612 KB).

| Tipo | Antes | Después |
|---|---|---|
| JavaScript (126 solicitudes) | 613 KB | 612 KB |
| **Audio (4 archivos de llamadas y notificación)** | **457 KB** (ringtone 351) | **0** |
| CSS (4, de ellos `styles` 65 KB) | 68 KB | 68 KB |
| Imágenes (isotipos `-sm`/`-md` del loader y logo `-sm`) | 56 KB | 56 KB |
| Fuentes (Google: Plus Jakarta Sans y Sora, `woff2`) | 52 KB | 52 KB |
| API (`/instance/status` y loaders HTML) | 7 KB | 7 KB |
| HTML | 1 KB | 1 KB |
| **Total** | **1256 KB** | **799 KB (-36 %)** |

Causa: `useCallSoundUnlock` (montado en `AppEntry`, antes de autenticarse) llamaba a `preloadCallSounds()` y el primer clic del formulario disparaba además la descarga de los cuatro buffers. Corrección: los audios se descargan solo cuando el shell autenticado monta `enableCallSounds()` (`RunlyApp`); el desbloqueo de Web Audio en el primer gesto se conserva para iOS. Prueba: `callSoundsDeferred.test.js`.

Quedan sin tocar por riesgo/valor: `styles.css` 65 KB (CSS global; separar el crítico exige otro análisis), fuentes de Google (terceros; 52 KB, autoalojarlas es otra decisión), isotipos `-md` del loader animado (43 KB, branding). Pendiente: comprobar en navegador con sesión que el timbre y los sonidos siguen precargados tras iniciar sesión y la primera llamada entrante en iOS.

Caché de `runtime-modules`: los dos únicos consumidores (`useRuntimeModules`, `useEntityBranding`) comparten la clave `["runtime-modules", usuario]` y ambos piden `slim`; el valor por defecto del SDK es la respuesta completa pero no tiene otros llamadores, así que no hay mezcla de formas.

## Anexo: Supabase en el login (2026-11-25): evaluado, no implementado

Estado: **ABIERTA, sin cambios de código por decisión técnica.**

- `supabase-vendor` pesa 195 KB (49.4 KB gzip) más 2.4 KB gzip de `lib/supabase`; incluye `auth-js`, `realtime-js` (con parche local en el lockfile) y los clientes de Storage/PostgREST/Functions que `createClient` agrupa. En el login se usa solo `auth` (`getSession`, `onAuthStateChange`, `signIn`/`setSession`, renovación).
- Un único cliente compartido (`apps/desktop/src/lib/supabase.js`, `Proxy` + `authorizeRealtimeClient`) sirve a 20 archivos y a Realtime (Chat, Notes, Canvas, actividad), Storage (imágenes de notas) y al token de los canales. `createIsolatedRealtimeClient` ya crea un segundo cliente, sin sesión, solo para credenciales acotadas.
- Alternativa soportada: usar `@supabase/auth-js` en el login y cargar `supabase-js` bajo demanda. Obliga a (1) añadir `auth-js` como dependencia directa (cambio de lockfile), (2) tener dos clientes con sesión sobre la misma clave de almacenamiento (`sb-*-auth-token`), o (3) reconstruir el cliente completo a partir del auth-js ya creado, lo que no es una API pública. Cualquiera de las tres introduce el riesgo de carreras de renovación de token y de sesión duplicada que se pidió evitar, y el ahorro esperado es como mucho ~20-25 KB gzip (≈3 % de los 799 KB del login; la diferencia exacta no se midió porque `auth-js` no es importable sin añadir la dependencia).
- Conclusión: no compensa a este coste. Reabrir solo si el presupuesto de JS crítico queda inalcanzable sin ello; la vía menos arriesgada sería un cliente único creado con `auth-js` + módulos de Realtime/Storage inyectados, que requiere una pasada propia sobre `authorizedRealtime.js` y las pruebas de sesión (login, logout, renovación, recuperación, PWA, nativo).

## Anexo: Framer Motion (`motion/react`) fuera del login (2026-11-25)

Estado: **VERIFICADA LOCALMENTE** (payload y navegador Chromium; sin dispositivos físicos).

- Hallazgo: el chunk `proxy` (motion) pesa 124 KB, **39.5 KB gzip**, y se descargaba en el login aunque `LoginScreen` solo usa animaciones CSS (`motion-safe:animate-in`). Entraba por imports estáticos de `ApiErrorScreen` (desde `ErrorBoundary` y `AppRouteGuard`) y `SetupWizard` (`AppRouteGuard`). El resto de usuarios (`AppLauncher`, `CommandPalette`, `CornerMenu`, `HrCatalogsScreen`) ya están en el shell cargado bajo demanda.
- Decisión: no migrar a `LazyMotion` ni reescribir a CSS. `ApiErrorScreen` usa muelles, animaciones repetidas y `AnimatePresence` en ~15 elementos: reescribirlo es refactorización extensa con riesgo visual para una pantalla casi nunca vista. Se carga bajo demanda en su lugar.
- Cambios: `LazyApiErrorScreen.jsx` (carga perezosa + respaldo plano «No se pudo mostrar el detalle del error» con «Reintentar» si el chunk no carga, para no dejar pantalla en blanco justo cuando se necesita), usado por `ErrorBoundary` y `AppRouteGuard`; `SetupWizard` lazy con `Suspense`. Sin cambios de dependencias ni de lockfile. `prefers-reduced-motion` no cambia: el componente movido conserva `useReducedMotion`.
- Medición (`login-resources.mjs`, mismo método que el anexo anterior):

| | Antes | Después |
|---|---|---|
| JavaScript del login | 612 KB (126 solicitudes) | 551 KB (113 solicitudes) |
| Transferencia total | 799 KB | **738 KB (-61 KB, -7.6 %)** |

Acumulado desde 1256 KB: -41 %.
- Pruebas: lint de los archivos tocados limpio; `error-screen-lazy.mjs` en navegador: con `/instance/status` abortado se muestra la pantalla de error completa («Sin conexión»…), y con su chunk además bloqueado, el respaldo plano con botón «Reintentar».
- Limitaciones: la pantalla de error aparece unos ms después (descarga de ~40 KB solo en ese caso); el asistente de configuración inicial y el flujo de primer uso no se recorrieron en navegador (la API no estaba disponible); no se midió latencia ni móviles físicos.

## Anexo: validación del arranque y la autenticación (2026-11-25)

Estado: **VERIFICADA LOCALMENTE** (Chromium escritorio, un solo navegador; API aislada en el puerto 4021 contra la base de desarrollo, solo lectura; build web del commit `d19f82d3a` servido con `serve.mjs`). Script reproducible: `perf-f3/scripts/auth-flow.mjs <base>` (variables `E2E_USER_*`, `PERF_COMPANY_ID`, `PERF_OTHER_COMPANY_ID`).

| Comprobación | Resultado |
|---|---|
| Arranque sin sesión muestra el formulario de login | Aprobada |
| Sin descarga de audios antes de autenticarse | Aprobada (0 archivos) |
| Inicio de sesión llega al shell (`/app/home`) | Aprobada |
| Audios (4) descargados tras autenticarse | Aprobada (ringtone, join, exit, notification) |
| Restauración de sesión existente (recarga de `/app`) sin formulario | Aprobada; los audios se precargan también al restaurar |
| Navegación inicial: Home, Calendario, Contactos | Aprobada |
| Cambio de empresa (empresa de pruebas a «Racoon Devs», solo lectura) | Aprobada: las llamadas llevan la empresa nueva y ninguna de la anterior |
| `/app/setup` con la instancia inicializada | Aprobada: redirige sin mostrar el asistente |
| Cierre de sesión por el menú de usuario y recarga posterior | Aprobada: vuelve al login y se queda |
| `ApiErrorScreen` y respaldo plano (anexo anterior) | Aprobada |
| Errores de carga de componentes dinámicos | Sin fallos de `assets/*.js|css` ni de `React.lazy` en ninguna fase |

Hallazgos (ninguno es un defecto de las optimizaciones; sin cambios de código):
1. `[ModuleBundleLoader] failed to load bundle for custom.estrato`: el módulo está en cuarentena en esta API (`[route-loader] custom.estrato: quarantined (NO_TRUST_RECORD)`, F1B), por lo que su bundle se rechaza. Comportamiento esperado de la cuarentena; solo genera ruido en consola.
2. **Preexistente**: al cerrar sesión, 3 `pageerror` `TypeError: e.teardown is not a function` en `RealtimeClient.removeChannel` (supabase-vendor). Reproducido con el build anterior a F3.2 (`apps/desktop/dist`, mismo `supabase-vendor`), así que no lo introducen F3.1/F3.2. El cierre de sesión se completa. Sospecha: algún canal que `removeAllChannels()` entrega al `removeChannel` nativo (`lib/authorizedRealtime.js:171-172`) sin el método `teardown` que exige el `realtime-js` parcheado. Pendiente de corrección propia con prueba de regresión; reproducción: `perf-f3/scripts/logout-error.mjs`.

Pendiente (no permitido por el entorno o fuera de alcance): asistente de configuración inicial real (requiere una instancia sin inicializar), recuperación de contraseña, otros navegadores y móviles físicos, primera llamada entrante tras iniciar sesión (audio con gesto del usuario, iOS).
