# Website W2 — editor Atlas en Developer Hub

## Alcance y resultado

Implementación local sobre W1 (`c2eb2b1e9` ERP y `79f86d5` Hub). El recurso `website_template` abre su documento en Atlas Web Builder 0.3.5; conserva páginas, bloques, tema, referencias SHA-256 y avisos de licencia. Importar, guardar y exportar utilizan el lector/escritor compartido de W1. No hay editor HTML/CSS ni formato Website alternativo.

La aceptación funcional se realiza contra Auth, SQL y Storage locales reales mediante una transacción de prueba con rollback. No se instalaron sitios ERP ni se publicaron releases. Elevate sigue con derechos desconocidos (`license_unknown`); sus metadatos Hub usan `LicenseRef-Unknown`, porque el campo de licencia del Hub no admite `_`. Esa etiqueta no concede derechos.

## Un solo renderer

`packages/website-blocks/src/` contiene los 85 archivos de bloques y plantillas que antes pertenecían al escritorio. Las rutas antiguas en `apps/desktop/src/website/runlyBlocks/` son reexportaciones compatibles. El cliente de contacto recibe `getApiUrl` mediante `configureWebsiteRuntime`; el Hub no configura esa integración. La lógica de renderizado no se duplicó ni se ampliaron bloques.

La regeneración de `apps/api/src/routes/website/block-catalog.json` conserva 148 definiciones y el digest:

`0e6f77787d7351448f05dc87af8b1f2bb701170a1077eacc76633d548216d248`

No se cambió la identidad de 0.3.5, el esquema de bloques ni el contrato v2. `inspectWebsiteTemplate().content.licenses` devuelve además el aviso UTF-8 validado, necesario para reexportar sin perder su procedencia. La evidencia pública de validación continúa sin incluir contenido editable o bytes de imágenes.

El escritor compartido `packages/studio-interchange/src/website-write.js` omite únicamente selectores vacíos que son exactamente el default del catálogo pero no una opción explícita admitida. Atlas los incluye al insertar bloques nuevos (por ejemplo `HeadingBlock.size`). Omitirlos conserva el default del renderer; no elimina valores personalizados ni permite defaults inseguros de otros tipos. Una prueba verifica equivalencia al mezclar defaults y rechazo de una opción inventada. El lector/validador no se relajó.

## Frontera privada

El portal autentica cada operación usando la sesión, Origin, CSRF, membresía y publicador existentes. El iframe editor/preview tiene origen separado, `sandbox="allow-scripts"`, origen efectivo opaco, CSP sin red, formularios, marcos secundarios, workers ni ejecución de archivos del ZIP. Sus scripts son exclusivamente la compilación confiable del Hub y Atlas. El servidor estático sólo sirve la clausura del manifiesto de compilación; rechaza rutas ajenas.

El puente comprueba ventana emisora, origen del padre en el marco, puerto MessageChannel y secuencias crecientes. No ofrece RPC de fetch, acceso al ERP ni envío de cookies. Sólo recibe el documento y las imágenes que el usuario ya está autorizado a leer. Las referencias `asset:<sha256>` se materializan como data URLs efímeras dentro del marco y se invierten antes de guardar. El validador compartido vuelve a rechazar URLs externas, data URLs persistidas o activos ausentes. No hay enlaces públicos permanentes al almacenamiento privado.

El preview reutiliza el renderer y la biblioteca de bloques. Las acciones de formularios/datos dinámicos se muestran desconectadas, sin SDK ni adaptadores de empresas. Un marcador no equivale a un formulario conectado. Los enlaces del preview no navegan fuera de él.

## Revisión, bytes y límites

Las migraciones Hub añaden `package_file_id` a las filas inmutables del historial y un trigger que comprueba recurso, publicador y tipo del archivo. Las revisiones de metadatos heredan la referencia; las revisiones visuales fijan un archivo nuevo. Se conserva concurrencia optimista con `expectedRevision`. Abrir una revisión anterior y guardarla crea otra revisión, sin sobrescribir el archivo anterior.

Guardar genera un ZIP canónico en el proceso aislado, lo inspecciona y lo almacena con los servicios existentes; la validación de W1 registra evidencia para ese archivo y esa revisión y lo mueve al almacenamiento privado de borradores. Guardar no solicita revisión humana, aprueba, firma ni publica. No se modificaron H7 ni las claves o dominios criptográficos.

Se mantienen 25 MiB por ZIP y la cuota actual de cinco archivos por recurso. Agotar la cuota produce error y conserva las revisiones previas; no hay eliminación automática de versiones. El transporte JSON de guardar/exportar admite hasta 36 MiB por base64; no amplía los límites del ZIP. Un fallo del trabajador después de crear una revisión puede dejarla pendiente en cuarentena: el cliente no informa éxito y las versiones válidas anteriores siguen accesibles. No se garantiza una transacción distribuida entre SQL y Storage.

Los ajustes Atlas que v2 no expresa se rechazan, incluyendo SEO/visibilidad no portable, efectos arbitrarios o escalas incompatibles del tema. Los colores, fuentes del contrato y escalas coherentes se convierten al tema v2; el validador decide fuentes, rangos y tipos. No se descartan ajustes incompatibles silenciosamente. Undo/redo y selección/reordenación pertenecen a Atlas; al cambiar de página se conserva su documento, pero no se promete historial undo entre páginas o sesiones.

## Dependencias y ejecución local

En Hub, desde un checkout limpio de la entrega, una sola vez:

```powershell
node scripts/prepare-website-local.mjs --runly ../runly
$env:MARKETPLACE_VALIDATOR_ROOT = (Resolve-Path .artifacts/website-validator)
node --env-file=.env scripts/migrate.mjs
pnpm build
node scripts/serve-website-editor.mjs
# En otra terminal, con el mismo MARKETPLACE_VALIDATOR_ROOT:
pnpm dev
```

El editor local estático usa un origen loopback distinto del portal. `VITE_WEBSITE_EDITOR_ORIGIN`, `WEBSITE_EDITOR_ORIGIN` y `WEBSITE_PARENT_ORIGIN` deben concordar si se cambian los puertos. En compilaciones de producción sin configuración del origen, la UI bloquea la edición. El servidor del editor debe reiniciarse tras recompilar: su inventario permitido corresponde a una compilación concreta.

El script copia fuentes confiables a `.website-editor/` y prepara un root del validador `local-candidate` con inventarios completos. Verifica primero el digest del catálogo. Vite comprueba inventario y SHA-256 de cada archivo generado; falla si falta o cambia. El script rehúsa reemplazar snapshots existentes o ejecutarse con `NODE_ENV=production`. Para refrescar, conservar la evidencia existente y preparar nuevamente en un checkout limpio. No copiar paquetes de un ZIP como código de la aplicación.

No se alteró `shared-packages.lock.json`, ni se publicaron paquetes. El root local no pasa por distribución productiva. Antes de un despliegue autorizado habrá que distribuir `website-blocks` y los entrypoints W1 del intercambio como artefactos verificables de una revisión coherente, incorporarlos al flujo de paquetes existente y adoptar sus identidades mediante ese flujo. No sustituir fuentes dentro del root productivo ni falsificar su lock. Esa adopción y los orígenes HTTPS separados requieren una fase de despliegue autorizada.

## Elevate y fidelidad visual

El candidato conserva una página, 133 bloques y 16 imágenes; todos los avisos y bytes originales W1 permanecen. Sólo se ajusta el breakpoint nativo del Navbar a 1024 px, porque los enlaces de W1 desbordaban a 768 px. No se elimina contenido ni se oculta el overflow para pasar la prueba. Se exporta además un ZIP de evidencia con texto, imagen y color modificados desde Atlas, separado del candidato que conserva el texto original.

La edición y el responsive no significan fidelidad exacta al prototipo. El prototipo original se conserva intacto en la entrega privada. La representación genérica de W1 sigue presentando estas diferencias:

| Zona | Capacidad existente investigada | Diferencia que permanece |
| --- | --- | --- |
| Cabecera | Navbar con logo, enlaces, CTA y breakpoint | Sin selector bilingüe contractual; faltan anclas portables por sección y el acabado exacto de marca |
| Hero | Hero centrado/dividido/con imagen, Section y Grid | Progreso y prueba social están como texto separado; faltan composición superpuesta y avatares reutilizables |
| Programas | Image, Grid, Card y bloques Services/ProjectCards | No se conserva exactamente el recorte, badge y jerarquía de cada tarjeta del prototipo |
| Nutrición | SplitFeature, imagen y texto editable | Falta checklist superpuesto con iconos y layout exacto |
| Eventos | Texto y contenedores | Las fechas son estáticas; falta variante de filas editoriales con campos de fecha, duración y modalidad; no existe agenda conectada en el paquete |
| Testimonios | Testimonial y Testimonials | La propuesta genérica pierde la tarjeta retrato y el carrusel específico |
| Cierre | Imagen y contenedores | Falta composición reutilizable de teléfono; no representa una aplicación funcional |
| Contacto | Marcador `@contact` | Las etiquetas del modal original son texto, sin contrato de modal/acciones/campos equivalentes |

No se añadieron variantes ad hoc dentro de W2 ni se alteró 0.3.5 para simular equivalencia. Para elevar la fidelidad se requiere una revisión posterior del catálogo compartido: propiedades, defaults, renderer y preview coherentes en ERP/Hub, nuevo digest e identidad/versionado explícitos. El candidato es editable y validable; la fidelidad exacta y la publicación no están aprobadas.

## Verificación y siguiente fase

Pruebas dirigidas: seis pruebas de intercambio ERP (incluyendo conservación literal de avisos y defaults nuevos Atlas), tres W1 Hub, cinco de recursos, cinco de consola; integración Website real con exportación validada en Hub y ERP y conversión v1→v2; Chromium/Firefox/WebKit del flujo visual aislado. Chromium añade creación de página, inserción y reordenación. Lint dirigido y build del Hub. La evidencia local está en `.artifacts/website-w2/` del Hub. No se certifican suites globales, firmador, publicación o instalación.

El chequeo global de privacidad mantiene los 72 hallazgos heredados ajenos ya identificados en W1. No se ampliaron excepciones. Las reglas se aplican también a los archivos de esta entrega antes del commit. React Doctor motivó corregir una ref actualizada durante render y un toggle de estado, y explicitar la protección de enlaces por teclado. Se conserva una advertencia de complejidad del panel que reúne el puente, las páginas y las operaciones de paquetes; no se suprime. Sus diagnósticos no sustituyen las pruebas del flujo.

W3 debe comenzar leyendo W1 y este documento, y conservar la separación de autorización, revisión y publicación. Implementar importación ERP con selección de sitio y autorización sobre ese sitio; materializar cada raster validado como FileAsset privado con origen/licencia y hash; construir el mapa `asset:` → binding de ese sitio; aplicar páginas y tema con los servicios Atlas existentes. Resolver imágenes de bloque y `background.url` mediante un mecanismo autorizado del sitio, sin almacenamiento privado expuesto ni referencias de otro sitio. Resolver el consumo real de fuente de encabezado. Probar idempotencia, rollback/compensación, cuotas, referencias ausentes, aislamiento entre sitios/empresas, concurrencia y reapertura con el mismo renderer. No usar URLs firmadas temporales como contenido persistido. No convertir marcadores en integraciones sin autorización y contrato. Publicación oficial y verificación de derechos permanecen separadas de W3.
