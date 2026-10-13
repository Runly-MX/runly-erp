# Dependencias y escaneo de secretos: revisión inicial

Date: 2026-10-12
Machine-readable evidence: 2026-10-12-dependency-triage.json.
Status: topología clasificada; parches y alcance detallado pendientes salvo shell-quote.

## Cambio verificado

La alerta crítica GHSA-pqg4-j6r4-53mv afectaba shell-quote 1.9.0, dependencia de
concurrently 10.0.5 utilizada en scripts de desarrollo. Se aplicó override exacto
concurrently>shell-quote a 1.11.0. La regresión primero falló por falta de rechazo
y después pasó para LF, CR y separadores Unicode posteriores a un comentario;
no se ejecutó el texto del payload como comando.

El [advisory primario](https://github.com/advisories/GHSA-pqg4-j6r4-53mv) identifica
la combinación de comentario y terminador como requisito y 1.11.0 como parche.
No se confirmó una ruta de explotación remota en Runly.

pnpm intentó refrescar otras dependencias con specifier latest al resolver el
override. Esos cambios no se aceptaron: se conservaron todas las resoluciones
anteriores y se incorporó únicamente la nueva resolución/integridad de shell-quote,
su snapshot, el vínculo de concurrently y el override. Frozen install sin scripts
pasó con ese lockfile. concurrently conserva 10.0.5.

Verificación posterior: 10/10 pruebas (shell-quote, startup Office y runtime),
concurrently --help exit 0. pnpm audit pasa de 45 a 44 alertas: 0 críticas,
22 altas, 19 moderadas, 3 bajas. El audit sigue fallando por alertas restantes;
no se configura como excepción ni se afirma una dependencia libre de riesgos.

## Clasificación de las 19 familias

| Alcance observado | Familias | Tratamiento siguiente |
|---|---|---|
| API/worker directo | Hono, Nodemailer, Sharp, csv-parse | Contratos HTTP, SMTP, imagen e importación; los saltos major requieren diseño separado |
| Editor del navegador | Tiptap/core, prosemirror-view | Actualización coordinada de extensiones y pruebas de pegado/edición/colaboración |
| Navegador transitivo | DOMPurify, lodash-es, KaTeX | Seguir entradas realmente utilizadas y probar sanitización/rendering; no excluir por transitivas |
| API transitivo | uuid vía ExcelJS/Firebase | Actualizar padres o verificar compatibilidad; sin override major indiscriminado |
| Tooling Prisma | @hono/node-server vulnerable, fast-uri, valibot, deepmerge-ts, mysql2 | Diferenciar herramientas enviadas en imagen de un servicio expuesto; compatibilidad Prisma y rutas de entrada por revisar |
| Tooling de desarrollo/API | brace-expansion, source-map-js | Versiones compatibles y pruebas de glob/build/compilación de módulos |
| Build de navegador | braces vía Sass/chokidar de Excalidraw | El feed no indica rango parcheado utilizable; revisar actualización o sustitución del padre |
| Coordinador de desarrollo | shell-quote | Parche aplicado y probado |

La versión vulnerable del adaptador Hono viene por Prisma dev. El adaptador
directo de API resuelve 1.19.17, distinto de la copia alertada 1.19.11. Prisma
figura en dependencies del repositorio y se usa en el arranque: prune --prod
no basta para clasificar todas esas rutas como ausentes del artefacto. No se
demostró que servidores internos de Prisma estén escuchando en una instalación.

El JSON registra cada advisory, versiones afectadas/parcheadas del feed, importers
relativos, una ruta representativa, estado y siguiente acción. Es clasificación
inicial por topología, no aceptación de exposición ni sustituto de revisar cada
condición del advisory. Owner permanece null hasta asignación. No hay excepciones
aceptadas; el número de filas de advisories no equivale al contador de pnpm, que
también considera versiones distintas afectadas.

## Secret scanning local

Se descargó Gitleaks 8.30.1 del [release oficial](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
a una carpeta temporal local. El ZIP Windows x64 se verificó contra el checksum
publicado por el proveedor: SHA256
d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e.
No se añadió un binario al repositorio ni se modificó PATH permanentemente.

pnpm check:secrets se ejecutó con ese binario en PATH del proceso: exit 0,
sin leaks encontrados; privacidad revisó 4316 archivos sin hallazgos. El comando
construye un snapshot de archivos versionados y redaction está activa. No es
escaneo del historial ni evidencia de rotación de secretos antiguos. CI y otros
equipos todavía necesitan provisionar la herramienta antes de ejecutar el gate;
un resultado local no demuestra que ya esté instalada en CI.

## Pendientes de distribución observados

Los Dockerfiles no copian todos los manifests workspace antes de pnpm install:
preview-runtime falta en las etapas deps de API/worker y compiler/preview-runtime
en web, aunque aparecen como dependencias. Después sí copian packages completos.
El impacto requiere un build limpio; no se declara un fallo de producción a partir
de esta observación. La reproducción aislada con manifests y frozen install
offline quedó inconclusa por tarball ausente del cache local, no por un error
demostrado de workspace. Registrar en el futuro contrato de build/consumidor.

También persisten advertencias de peers React de librerías transitivas. No se
aceptó una actualización de React o del conjunto UI dentro de este parche.

Verified: 2026-10-12 (audit antes/después, resolución específica, instalación
congelada sin scripts, pruebas dirigidas y escaneo local descritos; sin deploy,
publicación, cambios de instancias o excepciones de seguridad aprobadas).
