# Tiptap: resultado de seguridad y compatibilidad local

Date: 2026-10-13
Source: 4bfba14c
Spec/plan: 2026-10-13-tiptap-security-upgrade-design.md y 2026-10-13-tiptap-security-upgrade.md.
Evidence: 2026-10-13-tiptap-security-results.json.

Se actualizaron los 21 paquetes directos a versiones exactas 3.30.5 y los 43
paquetes de la familia instalados a esa revisión. Los mínimos nuevos requieren
y-tiptap 3.0.7 y prosemirror-model 1.25.11. La comparación estructural del
manifiesto y lockfile contra 74dff345 confirma que no cambiaron resoluciones
ajenas a este conjunto; prosemirror-view conserva el parche 1.42.3 anterior.
La instalación frozen sin scripts pasó. No se modificaron archivos del editor
de producto, documentos guardados, configuración de proveedores ni schema.

## Seguridad comprobada

El baseline final dio 1 pass/3 fail: una propiedad JSON propia `__proto__`
alteraba el prototipo del objeto combinado y los dos parsers excedían el
presupuesto de tres segundos. Los fixtures iniciales de API/quoting se corrigieron
antes de registrar ese baseline. Los inputs grandes viajan por stdin y cada
parser corre en un proceso aislado con límite de tiempo.

Con 3.30.5, los cuatro tests pasan. DOMSerializer en Chrome conserva el título
válido y no recibe atributos de evento heredados. Esto verifica la corrección
del objeto combinado, sin demostrar un ataque a Notes o contaminación global
de Object.prototype. Los schemas habituales filtran atributos no declarados.
[Advisory de atributos](https://github.com/advisories/GHSA-cp6q-959q-f8rh).

Los helpers públicos de Markdown procesan los dos inputs acotados dentro del
presupuesto y mantienen atributos normales. No se confirmó que Notes utilice
estos helpers con Markdown arbitrario de un cliente.
[Advisory de parsers](https://github.com/advisories/GHSA-j95f-988m-3j2f).

## Verificaciones

| Verificación | Resultado |
|---|---|
| Tests de seguridad y browser | 5/5, sin fallos |
| Chrome, extensiones reales de Notes | Clipboard, texto, tabla, undo/redo y JSON roundtrip pasan |
| Colaboración local | Dos Y.Doc sincronizados en memoria; edición, undo/redo y convergencia pasan |
| React | EditorContent monta y refleja edición con el React del host |
| Barrido shared/desktop/scripts/installer/scaffold | 1,617 pass, siete skip, cero fail; 189.88 s |
| Build web | Pasa; 7.54 s, advertencia existente de tamaño de chunks |
| Audit | 29 → 27: cero críticas, 13 altas, 13 moderadas, una baja; sigue fallando |
| Privacidad y secretos | 4,353 archivos, cero hallazgos; Gitleaks 8.30.1 sin leaks en snapshot de archivos |
| Whitespace | git diff --check pasa |

No se repitió el barrido API en este alcance. Los siete skips del barrido
compartido no equivalen a pruebas aprobadas. Los tests de navegador bloquean
peticiones externas; no prueban Supabase Realtime, reconexión, presencia remota,
invitados, dispositivos o anotación/interacción de imágenes. El build compila
los consumidores, pero no acepta esos recorridos.

React Doctor 0.9.18 completó la revisión de NoteEditor.jsx, editor-extensions.js
y AnnotatableImage.jsx, sin checks omitidos. Encontró un error previo
`no-ref-current-in-render` en el ref usado para flush al desmontar y cinco
advertencias: complejidad, componente grande, dependencias de metadatos de
usuario y dos de accesibilidad. Los tres archivos son idénticos al baseline.
La revisión no está limpia: el ref/autoguardado necesita un alcance propio con
pruebas de render descartado, cambio de nota y desmontaje antes de corregirse.
Se desactivaron score remoto y análisis externo de supply chain; no se crearon
issues, hooks ni configuración CI.

## Pendientes

Quedan diez familias alertadas: @hono/node-server, uuid, fast-uri, valibot,
deepmerge-ts, mysql2, nodemailer, csv-parse, braces y katex. No hay excepciones
aceptadas. Los cambios major y la exposición efectiva necesitan contratos y
fixtures propios. La aceptación real del editor colaborativo sigue abierta.
CI reproducible, simulacro B2 real y correcciones de transporte empresarial
permanecen diferidos por el usuario. No hubo publicación o despliegue.
