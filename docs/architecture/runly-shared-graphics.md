# Infraestructura gráfica compartida de Runly

## Decisión de Fase 1

No se mueve código de Canvas/POS/Notes y no se crea un paquete gráfico. La reutilización vigente Canvas → POS ya está implementada mediante CanvasViewport, viewport, adapters y drawers. Sus utilidades no necesitan distribución externa para la primera vertical de Studio.

La revisión de los seis paquetes y sus consumidores está en [la auditoría](runly-studio-audit.md). El contrato de documento Studio se comparte únicamente entre sus consumidores API/cliente en `apps/shared/studio/`; no se ofrece como API pública npm. Es código nuevo de dominio, no una extracción del renderer de Canvas.

## Límites de propiedad

| Responsabilidad | Propietario |
| --- | --- |
| Controles, temas y estados de UI | @runly/ui |
| Identidad y contratos centrales de módulo | @runly/core |
| Transporte autenticado y empresa activa | @runly/sdk + host |
| Declaraciones, ayuda y contratos de servicios | @runly/module-engine |
| Compilar módulos | @runly/module-compiler |
| Previsualización declarativa aislada | @runly/preview-runtime |
| Páginas de composición, edición y PNG | runly.studio |
| Diagramas, planos, hotspots y bindings | runly.canvas |
| Mesas y operación de pisos | runly.pos mediante adapters |
| Elementos y colaboración Excalidraw | runly.notes |
| Plantillas documentales, versiones y archivos generados | runly.documents |

## Contrato interno Studio v2 y lectura de v1

`apps/shared/studio/document.js` tiene cero dependencias. Valida JSON por allowlist, versiones 1/2, unidad px, una página, fondo hexadecimal y hasta 500 objetos. La salida canónica es v2: añade `locked` y `hidden` booleanos por objeto. Al leer v1 se asignan ambos a false, sin mutar el input ni reescribir la fila en base de datos. El próximo guardado explícito conserva v2. Versiones desconocidas se rechazan. Los tipos son texto, rectángulo, elipse e imagen. Texto conserva escala X/Y para que un resize no pierda fidelidad al reabrir. Los identificadores de objetos son locales al documento; el UUID de la entidad persistente lo genera la base.

La posición en el array determina orden de pintado y permite subir/bajar niveles y enviar al frente/fondo. No hay grupos, capas independientes, variables ni múltiples páginas. Incorporarlos requiere migración de contrato explícita, no aceptar silenciosamente JSON de Fabric. El viewport personal queda fuera del documento. También quedan fuera blobs, URLs firmadas e identidades de empresa/propietario suministradas por el cliente.

`fabric-adapter.js` traduce ese contrato a objetos interactivos y vuelve a producir un documento validado al guardar. Su instancia, selección, listeners y cachés son por documento. Al desmontar se dispone el canvas. No se conecta a la base ni al SDK.

## Contratos API

- GET `/studio/designs?page=1`: hasta 24 diseños propios de la empresa activa.
- POST `/studio/designs`: `{name, document}` → `{data: {id, name, revision, document, updatedAt}}`.
- GET `/studio/designs/:id`: mismo envelope, sin inferir identidad del contenido.
- PUT `/studio/designs/:id`: `{name, document, revision}`. El UPDATE incluye empresa, propietario, enabled y revisión. Una revisión obsoleta responde 409 `STUDIO_REVISION_CONFLICT` sin sobrescribir.

Permisos: studio.view, studio.create y studio.edit. Los permisos globales no conceden acceso a diseños ajenos. La primera vertical no expone compartir, borrar, duplicar ni endpoints públicos. Los métodos SDK son onlineOnly: una mutación con revisión antigua no entra en una cola offline.

## Archivos y exportación

Studio usa FileUploader y sdk.files.upload para guardar el original como archivo privado AtlasFile de runly.files. La escena almacena únicamente su fileAssetId. El servidor exige empresa activa, propietario de la imagen, enabled y MIME PNG/JPEG/WebP al guardar. El cliente solicita URLs nuevas autorizadas al abrir; no las persiste. Los permisos Files de lectura/subida siguen vigentes.

La exportación PNG pinta la página completa al tamaño del contrato, sin selección y sin depender del zoom CSS. La prueba comprueba dimensiones y píxeles del original. El límite inicial es 4096 px por lado, 500 objetos y aproximadamente 1 MB JSON; son límites conservadores de la vertical, no garantías de rendimiento. No se anuncia SVG, PDF vectorial, multipágina ni CMYK.

## Evolución autorizada por evidencia

Antes de extraer una utilidad: identificar dos consumidores reales, caracterizar sus comportamientos y demostrar que comparten semántica. Antes de distribuir: contrato estable, exports explícitos, separación browser/puro, validación de tarballs y consumidores independientes. Ninguna fase exige mover funciones solo para producir un paquete nuevo.

No hay cambios de APIs de Canvas/POS/Notes en esta entrega. La evidencia disponible son pruebas dirigidas y build; no se afirma equivalencia absoluta ni se ejecutó una sesión completa de esos módulos contra una instalación real.
