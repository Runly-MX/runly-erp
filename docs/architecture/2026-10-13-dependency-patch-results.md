# Estado posterior a los parches compatibles

Date: 2026-10-13
Source: dependency patches 2988b4f7; Dev Kit regeneration 064c6ec9
Machine-readable evidence: 2026-10-13-dependency-patch-results.json.

## Cambios y evidencia

| Familia | Cambio | Regresión antes → después | Commit |
|---|---|---|---|
| Sharp | 0.35.4 → 0.35.5 y paquetes nativos de esa familia | 3/4 → 4/4; SVG/PNG, JPEG, resize y rechazo de entrada corrupta | 8165635a |
| Hono | 4.13.5 → 4.13.7, raíz/API y referencias de peers | 2/6 → 6/6; texto SSR normal/stream y middleware/JSON | 664dd15c |
| DOMPurify | Override 3.4.14 → 3.4.16 | 0/1 → 1/1 en Chrome; cuatro hooks, nodo retirado y contenido permitido | 78f85db9 |
| brace-expansion | Overrides 1.1.18 → 1.1.21 y 2.1.4 → 2.1.7 | 2/6 → 6/6; copias ESLint/archive, globs y presupuesto de proceso | 2988b4f7 |

Cada instalación congelada sin scripts pasó. Se contrastó estructuralmente el
YAML del lockfile con acaf4323: todas las resoluciones, importers y overrides
ajenos a estas familias permanecen iguales. No se aceptó el refresco de versiones
`latest` que pnpm propuso inicialmente al actualizar Sharp.

La copia nativa cargada en Windows informa librsvg 2.63.2. Eso prueba el binario
local y el pipeline de imágenes, sin afirmar ejecución del exploit o verificación
del binario Linux de producción. El [advisory de Sharp](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)
describe el alcance de la vulnerabilidad y la versión corregida.

Los tests Hono ejercitan texto raíz que debe escaparse, tanto con renderToString
como con renderToReadableStream. No se confirmó que Runly use esa posición de SSR
con entradas no confiables. [Advisory Hono](https://github.com/advisories/GHSA-hxh3-vqpv-xpqv).

El test DOMPurify usa el artefacto de la misma dependencia que resuelve jsPDF,
en Chrome real sin solicitudes externas. Comprueba atributos después de retirar
un subtree con hooks before/upon/after; usa eventos inocuos y no carga imágenes.
No afirma explotación de una pantalla de cliente ni cubre todos los modos de
sanitización. [Advisory DOMPurify](https://github.com/advisories/GHSA-p98j-92pf-mc4p).

El test de brace-expansion resuelve las copias usadas por ESLint y por
exceljs/archiver/readdir-glob. La entrada malformada de 64000 cierres agota el
presupuesto de dos segundos antes del cambio y completa en aproximadamente
750 ms por copia después. Es una regresión acotada en un proceso hijo, no un
benchmark multiplataforma. [Advisory brace-expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr).

## Audit y trabajo restante

| Revisión | Críticas | Altas | Moderadas | Bajas | Total |
|---|---:|---:|---:|---:|---:|
| Antes de esta etapa, shell-quote ya corregido | 0 | 22 | 19 | 3 | 44 |
| Sharp | 0 | 21 | 19 | 3 | 43 |
| Hono | 0 | 21 | 18 | 3 | 42 |
| DOMPurify | 0 | 21 | 18 | 1 | 40 |
| brace-expansion | 0 | 17 | 16 | 1 | 34 |

`pnpm audit --json` sigue terminando con error por alertas restantes. No hay
excepciones aceptadas. El JSON conserva las 14 familias restantes, cada advisory,
rango afectado/parcheado y rutas de dependencias relativas. Un conteo no demuestra
alcanzabilidad; owner permanece pendiente de asignación.

| Siguiente frente | Familia | Trabajo independiente necesario |
|---|---|---|
| Revisar parches dentro de su línea actual | source-map-js, prosemirror-view, lodash-es | Contratos de compilación/mapas, interacción del editor y entradas del parser; comprobar padres y duplicación de versiones antes del override |
| Prisma/tooling | @hono/node-server, fast-uri, valibot, mysql2 | Separar copias internas de la API directa, revisar consumidor/entradas y probar compatibilidad; no actualizar Prisma indiscriminadamente |
| Upgrade coordinado del editor | @tiptap/core | Extensiones y colaboración en conjunto; evitar mezclar majors del editor |
| Cambios major | nodemailer, csv-parse, deepmerge-ts, uuid | Revisar APIs de los padres y migración; fixtures SMTP/importación/merge/exportación, sin cuentas o DB reales |
| Rendering/build | katex, braces | Renderer y padre Sass/chokidar; el feed de braces no ofrece un rango corregido utilizable |

La ausencia de un rango utilizable en el feed no prueba que no exista arreglo en
el proyecto upstream. Ninguna fila se considera una excepción o cierre de riesgo.
Los advisories específicos y rutas de cada familia están enlazados en el JSON.

## Validación final y límites

Build web pasó. El escaneo local de secretos/privacidad pasó sobre 4332 archivos,
con Gitleaks 8.30.1 previamente verificado y PATH temporal; no es escaneo histórico.
Regresiones completadas: API 2367 tests, 2365 pass, 2 skip, 0 fail (216.0 s).
Primer shared: 1624 tests, 1616 pass, 7 skip, 1 fail (192.8 s), por
AGENTS.md del Dev Kit desactualizado frente a su fuente. Regenerado en
064c6ec9: test dirigido 1/1; nuevo shared 1617 pass, 7 skip, 0 fail (176.4 s).

Node 22.12.0, timeout 60000 ms, concurrency 8 y force-exit. Los patrones
seleccionados no enumeran todas las suites .mjs/Prisma/Docker; no se activaron
servicios reales. Force-exit no demuestra limpieza de handles. Los 17 tests
dirigidos pasan; cuatro de Sharp ya forman parte del conteo API.

CI, restauración real B2 y transporte empresarial siguen diferidos.
No se publicaron paquetes, artefactos o imágenes, ni se modificó una instalación.
