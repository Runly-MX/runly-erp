# Runly Website Responsive Foundation

## Estado de esta entrega

Revisión técnica y primera implementación local del proyecto propuesto el
21 de noviembre de 2026. **El proyecto completo todavía no está aceptado.**
No se modificó SENDA ni se creó una revisión suya. No hubo publicación de paquetes,
push ni despliegue. Las capturas corresponden a una fixture sintética sin datos
de clientes; no constituyen aceptación visual de SENDA.

## F0: inventario y matriz de problemas

| Hallazgo y origen | Responsable | Severidad | Reproducción / evidencia | Tratamiento |
| --- | --- | --- | --- | --- |
| Geometría y distribución ya tienen overrides planos y Container Queries; tipografía y superficie eran comunes a los dispositivos | Atlas | Alta | Cambiar `fontSize` desde el Inspector móvil cambia el valor base | Ampliación del formato existente; sin tres renderers duplicados |
| El navbar dependía del viewport; el commit `2390adf2d0737a3174d46ae4803362ee9da44c02` añadió la consulta `atlas-page` | ERP / Website Blocks | Alta | Un contenedor de 390 px en un viewport de 1920 px debe mostrar hamburguesa | Se conserva esa corrección y se añade contenedor propio para embeds independientes |
| El carrito estaba dentro de los enlaces ocultos al cerrar el menú móvil; identificadores del menú repetidos entre instancias | Website Blocks | Media | Menú cerrado en 320–820 px | Carrito separado y `useId` para cada menú; Escape devuelve foco |
| Elementos libres heredaban la fuente del chrome del editor, frente a la del documento anfitrión en público | Atlas | Alta | Comparar fuente y medidas del título entre editor y renderer público | Base tipográfica común en la raíz del lienzo y de la página |
| El Inspector podía conservar metadatos responsive al filtrar campos de un catálogo antiguo | Developer Hub | Alta | Un catálogo con `fontSize`, sin `mobileFontSize`, no puede aceptar ese override | El adaptador anuncia responsive sólo cuando el catálogo contiene ambos dispositivos |
| El catch del proceso Website transformaba excepciones inesperadas en documento inválido | Developer Hub | Alta | Inyectar TypeError interno frente a PackageError documentado | Fallo interno operativo, sin stack ni detalles privados |
| El runner perdía la distinción entre falta de memoria y otros cierres del proceso | Developer Hub | Media | Clasificar la firma OOM y una terminación genérica | stderr privado acotado a 8 KiB; sólo sale el código seguro |
| `@newsletter` es un marcador de instalación, no el ID de un formulario publicado | ERP / Hub | Alta | Revisar `website-template-forms.js` y `ContactFormRenderer.jsx` | Mantener la vinculación transaccional a un formulario real; no reemplazarlo por un input decorativo |
| El Hub consume Website Blocks de una revisión anterior a la corrección del navbar | Integración | Alta | La dependencia compartida está fijada a `aad51d79693d4f88376579c3aab8f36a84527b8c` | Requiere publicación y adopción verificadas antes de producción |

Las declaraciones locales de ERP y Hub fijan Atlas **0.8.2**. Website Blocks en
el workspace declara **0.1.0**; Hub usa la distribución compartida
`0.1.0-source.aad51d79693d4f88376579c3aab8f36a84527b8c`.
El paquete raíz de Developer Hub declara **0.1.0**. Estos datos identifican las
fuentes y dependencias locales: **no se verificaron las versiones desplegadas**.

## Cambios por repositorio

Atlas prepara **0.9.0 como candidato sin publicar**. Mantiene documentos schema 1
y el convenio `tabletCampo` / `mobileCampo`. La resolución es por propiedad:
desktop → tablet → mobile, conservando ceros. Los estilos se calculan una vez por
dispositivo y el CSS elige según `atlas-page`: móvil por debajo de 640 px, tableta
por debajo de 1024 px y escritorio desde 1024 px. El zoom no cambia el ancho lógico.

Los elementos compatibles incorporan overrides de tipografía (tamaño, peso,
interlineado, letras, alineación, familia, estilo y wrapping), padding/márgenes,
colores, borde, radio, sombra, límites de tamaño, proporción, overflow, orden,
capa, visibilidad y ajuste/posición de imagen. Box incorpora gap, alineación,
distribución y wrap por dispositivo, además de su layout y columnas existentes.
La visibilidad usa `visibility`; conserva el espacio del elemento.

El Inspector comparte los controles existentes, identifica campos responsive,
permite cambiar dispositivo, copiar valores del dispositivo anterior y borrar
overrides nuevos para recuperar la herencia. Usa el historial existente para
undo/redo y la persistencia JSON existente. Los controles históricos de geometría
siguen separados. Los defaults móviles históricos de Box conservan su semántica;
su migración completa de restablecimiento necesita una decisión compatible.

El diagnóstico del lienzo identifica candidatos a overflow y permite seleccionarlos.
No oculta el contenido ni aplica reparaciones automáticas. La advertencia propone
revisar ancho, márgenes, separación y posición; todavía no atribuye una causa exacta
ni ofrece una reparación configurable por propiedad.

ERP modifica `packages/website-blocks/src/storeNavbarBlock.jsx` y añade un
laboratorio reproducible en `scripts/fixtures/website-responsive/` con su comando
`node scripts/test-website-responsive-foundation.mjs`. Usa el build local de Atlas
(o `ATLAS_SOURCE_DIR`) y no instala ni publica un sitio.

Hub modifica el adaptador de capacidades, el child y runner del validador, el
servicio Website y los mensajes seguros de MCP/Creator. Los nuevos códigos
`VALIDATOR_INTERNAL_ERROR` y `VALIDATOR_MEMORY_LIMIT` son operativos. Se mantienen
TIMEOUT, OUTPUT_TOO_LARGE, CRASHED y BAD_OUTPUT. La clasificación OOM se basa en
la firma de Node: un SIGKILL sin esa firma sigue siendo CRASHED, no se inventa una
causa. No se devuelven stderr, binarios ni stacks en los nuevos diagnósticos.

## Compatibilidad y migración

Commits locales en `main`: Atlas `e647e1b` y Developer Hub `e8c6b76`.
El commit ERP contiene este informe, el navbar y el laboratorio. Sin push.

Archivos Atlas: `package.json`, `src/blocks/elements/{responsive.js,design.js,ElementBlocks.jsx}`,
`src/styles/elements.css`, `src/editor/chrome/{Canvas.jsx,OverflowDiagnostics.jsx,PropertiesPanel.jsx,PropertyField.jsx}`
y `src/__tests__/responsiveStyles.test.js`.

Archivos Hub: `apps/api/src/services/marketplace-validation/{website-failure.js,runner.js,child.mjs}`,
`apps/api/src/services/marketplace-resources/website.js`, `apps/api/src/mcp/errors.js`,
`apps/web/src/website/capabilities.js`, `apps/web/src/marketplace-console/shared.js`,
`tests/website-responsive-candidate.test.js` y `tests/website-validator-failure.test.js`.

Archivos ERP: `.gitignore`, `packages/website-blocks/src/storeNavbarBlock.jsx`,
`scripts/test-website-responsive-foundation.mjs`, `scripts/fixtures/website-responsive/{index.html,entry.jsx}`
y este informe.

1. Conservar catálogos históricos, incluidos 0.8.2 y sus digests. No regenerarlos.
2. Construir Atlas 0.9.0 y preparar el perfil local del Hub con
   `node scripts/prepare-website-editor-candidate.mjs`. Su manifiesto y catálogo
   quedan en archivos ignorados; producción rechaza este perfil.
3. Verificar los campos nuevos mediante escritura ZIP y reapertura con el
   validador aislado. Los documentos 0.8.2 siguen sujetos a su catálogo original:
   no reciben campos nuevos silenciosamente.
4. Antes de adoptar: publicar y fijar una versión de Atlas, generar un **nuevo**
   catálogo y digest, publicar Website Blocks desde una revisión limpia y adoptar
   esa distribución en ERP y Hub. No sustituir el snapshot 0.8.2.
5. Verificar dependencias, renderer SSR/hidratado y rollback del entorno objetivo.
   Sólo después ejecutar regresión SENDA revisión 21 y considerar otra revisión.

## Validación y límites

La matriz automatizada cubre 320, 360, 390, 768, 820, 1024, 1280, 1440 y 1920 px,
en Chromium y WebKit, público y preview. Comprueba overflow, tamaño tipográfico,
paridad entre esos dos modos, menú, carrito, Escape/foco y envío con un adaptador
de formulario de prueba. El editor se prueba con lienzo 390 y viewport 1920:
edición independiente, undo/redo, restablecimiento, guardado y reapertura local.
La comparación editor/público también comprueba fuente, color, ancho y altura del
título. No equivale a una publicación real ni a un envío a producción.

Resultados y capturas se generan en `.artifacts/website-responsive-foundation/`.
Las capturas principales usan 390, 820 y 1440 px; hay además captura del editor.
La suite completa de Atlas tiene 248 casos. El Hub añade pruebas dirigidas de
capacidades, fallos, guardado y roundtrip ZIP del candidato.

Verificación ejecutada: 248/248 pruebas de Atlas, lint y build de Atlas;
22 pruebas dirigidas de Hub, dos casos del perfil responsive (incluido el
validador aislado), lint dirigido y build normal de Hub. El build normal continúa
usando los pins publicados de 0.8.2. React Doctor no encontró problemas en los
cambios de Atlas; en ERP señaló 12 advertencias de Bookings/LMS ajenas a esta
entrega. Se omitieron suites globales de ERP y Hub, integración con base de datos,
E2E autenticado y despliegue porque esta entrega certifica el candidato local,
no la adopción ni la aceptación final del proyecto.

`pnpm check:privacy` global detectó 23 hallazgos en archivos ajenos a esta entrega
(Growth, fixtures de dominios y correo). No se alteraron esos archivos. Debe
resolverse ese gate antes de compartir la revisión completa del repositorio.
El análisis de los seis archivos preparados para este commit no encontró hallazgos.

## Pendientes del proyecto original

- Verificar versiones y configuración del entorno desplegado y abrir SENDA 21
  en modo de lectura para establecer sus capturas de referencia.
- Auditar individualmente todos los bloques especializados, carruseles, imágenes,
  comercio y las otras plantillas. La fixture de navbar/formulario/footer no
  certifica todo el catálogo.
- Completar presets semánticos XL/2XL, fondos de imagen responsive, modos de
  dimensión pendientes y propiedades específicas de los bloques especializados.
- Completar diagnósticos con causa por propiedad, reparación configurable y
  control equivalente en el preview del Hub.
- Certificar el editor dentro del iframe real del Hub, guardado de revisiones
  contra un entorno de integración y renderer publicado con SSR/hidratación.
- Medir el exceso de salida del validador con paquetes fotográficos reales;
  distinguir el error no demuestra que su causa operativa haya desaparecido.
- Publicar/adoptar dependencias y un catálogo nuevo, con sus comprobaciones
  completas de integración, build y despliegue. No se cambiaron los pins 0.8.2.
- Ejecutar aceptación visual y funcional de SENDA. No reconstruirla ni sustituir
  sus imágenes para hacer pasar las pruebas.
