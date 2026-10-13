# Resultado de los parches transitivos

Date: 2026-10-13
Source: e6423dbd
Machine-readable evidence: 2026-10-13-transitive-security-results.json.

## Cambios verificados

| Familia | Cambio | Evidencia | Commit |
|---|---|---|---|
| source-map-js | 1.2.1 → 1.2.2 | Baseline 3/7, corregido 7/7; consumidores Tailwind/PostCSS y roundtrip; bundler/compiler 21/21 | 4227277c |
| lodash-es | Copia Mermaid 4.17.21 → 4.18.1 ya instalada | Baseline 2/6, corregido 6/6; más un test de bundle browser, total 7/7; parser real y utilidades | 414c966e |
| prosemirror-view | 1.41.9 → 1.42.3 | Baseline falla por contexto clipboard inválido; corregido 1/1 en Chrome; smoke Notes con sus extensiones actuales | e6423dbd |

Los overrides se limitan al rango vulnerable y fijan la versión corregida.
Frozen install sin scripts pasó tras cada familia. Comparación estructural de
package.json y YAML contra d791d933: ninguna resolución, importer, override o
campo del manifiesto ajeno a esas familias cambió. Se actualizaron las referencias
de peers de ProseMirror necesarias para mantener coherencia del editor.

## Alcance de las regresiones

SourceMapConsumer rechaza offsets negativos, no enteros/no finitos, líneas
excesivas y sumas anidadas excesivas. Los casos inválidos no se serializan en la
versión antigua; evitan generar contenido enorme o bloquear el runner. PostCSS
conserva CSS y mapas válidos. No se demostró que un usuario pueda suministrar un
mapa arbitrario a la compilación Runly. [Advisory source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

El fixture lodash sigue la resolución Excalidraw → Mermaid parser → Langium →
Chevrotain. Rechaza claves de imports con una expresión inocua y deja intacto un
sentinel de prototipo frente a unset/omit con segmentos envueltos en arrays.
El sentinel siempre se limpia; no se borran métodos incorporados ni se ejecutan
comandos. El parser instalado produce el AST de un diagrama válido y rechaza uno
inválido; su bundle browser usa la copia corregida. No se confirmó exposición de
imports template controlados por un cliente. [Template](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [paths](https://github.com/advisories/GHSA-f23m-r3pf-42rh).

El fixture EditorView observa el Slice recibido por handlePaste antes de aplicar
la transacción. Un atributo declarado como string admite un array en el baseline;
la versión corregida descarta ese contexto. Array/object/null/number se rechazan
y se conserva el texto. Contexto válido, texto, strong y roundtrip pasan.
También se usa buildExtensions de Notes con Tiptap real para pegar, formatear,
insertar tabla, undo/redo y guardar/restaurar JSON. La configuración de extensiones
excluye acciones remotas; el editor del fixture es editable. CSS se omite sólo
del bundle lógico; su apariencia no se acepta por este test. [Advisory ProseMirror](https://github.com/advisories/GHSA-c8x8-7fp4-3x9w).

La validación depende del schema: este parche no agrega validadores a todos los
atributos Tiptap ni cierra sus advisories independientes. Colaboración, imágenes,
dos sesiones y servicios reales siguen sin aceptación en este fixture.

## Auditoría restante

| Estado | Críticas | Altas | Moderadas | Bajas | Total |
|---|---:|---:|---:|---:|---:|
| Baseline de esta etapa | 0 | 17 | 16 | 1 | 34 |
| source-map-js | 0 | 16 | 16 | 1 | 33 |
| lodash-es | 0 | 15 | 14 | 1 | 30 |
| prosemirror-view | 0 | 14 | 14 | 1 | 29 |

Audit sigue fallando. Hay 11 familias abiertas: @hono/node-server, @tiptap/core,
braces, csv-parse, deepmerge-ts, fast-uri, katex, mysql2, nodemailer, uuid y valibot.
El JSON registra cada advisory, rangos, versiones, conteo de paths y hasta tres
rutas representativas por versión; no elimina otras rutas por omitirlas del
resumen. Owner pendiente; ninguna excepción aceptada.

## Verificación final

Build web pasó (7.42 s); conserva advertencias de tamaño de chunks. API: 2367
tests, 2365 pass/2 skip/0 fail (222.34 s). Shared: 1624 tests, 1617 pass/7
skip/0 fail (200.86 s). Node 22.12.0, concurrency 8, timeout 60000 ms,
force-exit; patrones y omisiones iguales al regression-ledger. Los 15 tests
nuevos .mjs se ejecutaron aparte y pasan; no están en los globs de esos barridos.
Force-exit no demuestra limpieza de handles; no opt-ins de servicios reales.
Privacidad y escaneo local de secretos se verifican al cerrar el commit; no
se acepta historial/rotación por un snapshot local. No publicación o deployment.
