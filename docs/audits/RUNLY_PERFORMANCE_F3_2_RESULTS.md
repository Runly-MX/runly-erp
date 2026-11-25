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
