# Studio: contrato de plantillas para el editor y agentes

Contrato verificado con PostgreSQL desechable y Hono. Los UUID de los ejemplos son sintéticos. Ningún cambio visual forma parte de esta entrega.

## Ampliación de documento v5

`studio_composition_guide` devuelve v5, con los contratos `shapeContract` y
`lineCaps`. El documento conserva `fill` hexadecimal; añade `fillPaint` tipado
solid/image, propiedades `shape` y extremos `startCap/endCap`. Detalle, creación,
actualización, guardado/uso de plantillas y review aceptan estos datos mediante
el mismo validador y los mismos permisos; v1-v4 se normalizan al leer/guardar.
Los cambios exactos están en `docs/architecture/studio-editor-ui-contract.md`.

Las proyecciones ahora preservan geometría, estilos, encuadre y referencias de
relleno de los primeros 40 objetos: vectores/líneas ya no se convierten en
rectángulos. El preview sigue siendo incompleto y nunca debe guardarse como
documento editable. El detalle sigue siendo la fuente para edición y agentes.

`GET /studio/templates/:id/assets/:fileId/signed-url` (SDK `templateAssetUrl`)
autoriza la plantilla y su referencia privada y devuelve `{data:{signedUrl,
expiresIn:60}}`, con `Cache-Control: private, no-store`. Revalida después de
Storage. No permite abrir otros archivos ni concede acceso genérico a Files.
No se incorpora esta firma al documento, al detalle MCP ni a propuestas.

Las fotos en `fillPaint` cuentan en todos los extractores de FileAssets, créditos,
validación y reglas de publicación: una foto ajena recibida por colaboración no
puede compartirse empresarialmente salvo concesión empresarial ya existente.
Cuando el fondo depende de fotografía, máscara, borde o geometría ambigua,
`studio_review_design` pide revisión manual y no calcula contraste ficticio.

## Autorización y permisos

Todas las operaciones necesitan empresa activa, membresía vigente, módulo habilitado y `studio.view`. Personal solo es visible para su propietario; company para miembros autorizados de la misma empresa; runly es inmutable.

- `studio.templates.manage`: crear/editar/retirar personales propias.
- `studio.templates.publish`: crear/editar/retirar empresariales (también de otro propietario) y publicar personales propias. No da acceso a personales ajenas.
- `studio.create`: usar una plantilla para crear un diseño independiente.

Los permisos se registran mediante el manifest y el catálogo. Seed y sincronización administrativa ya asignan el catálogo a `runly.admin`/`system.admin`; el RBAC vigente reconoce administradores. La sincronización normal de manifests crea/activa definiciones, sin concederlas a roles normales. No se agrega ninguna migración de grants, ni se infiere publicación desde `studio.edit`. No ejecutar seed para actualizar una instalación: modifica asignaciones globales por su comportamiento previo. La concesión a roles existentes sigue siendo una decisión administrativa explícita.

## Listado y compatibilidad

`GET /studio/templates?scope=all&q=&category=all&page=1`

Scopes: all, runly, personal, company. Respuesta conserva el envelope anterior: `response.data.data` contiene las tarjetas; `response.data.pagination` y `response.data.categories` contienen paginación/categorías. Doce tarjetas por página; primero catálogo Runly, luego persistidas por actualización e ID. Se pueden pedir páginas específicas de cada scope.

```json
{
  "data": {
    "data": [{
      "id": "01900000-0000-7000-8000-000000000001",
      "key": "01900000-0000-7000-8000-000000000001",
      "name": "Campaña de otoño", "category": "Redes sociales", "description": "Texto editable",
      "scope": "personal", "ownerId": "01900000-0000-7000-8000-000000000002",
      "ownerName": "Persona de prueba", "source": "user", "revision": 1,
      "updatedAt": "2026-10-25T18:00:00.000Z",
      "canEdit": true, "canDelete": true, "canPublish": false,
      "width": 1080, "height": 1080, "objectCount": 0,
      "preview": {"page":{"width":1080,"height":1080,"background":"#ffffff"},"objects":[]},
      "document": {"page":{"width":1080,"height":1080,"background":"#ffffff"},"objects":[]}
    }],
    "pagination": {"page":1,"pageSize":12,"total":1,"totalPages":1},
    "categories": ["Redes sociales"]
  }
}
```

`document` en una **tarjeta** es un alias de `preview` para los consumidores actuales. Máximo 40 objetos y 120 caracteres por texto; vectores/líneas conservan su geometría y estilos. Imágenes privadas no incluyen URLs ni datos de almacenamiento. Esa vista previa es incompleta y no es un documento de edición. Usar `GET /studio/templates/:id` para abrir/editar el documento completo; nunca guardar el preview. El endpoint de detalle devuelve `{data:{...metadata,document}}`, normalizado por `validateDocument()` vigente.

Catálogo: id `runly:square`, key legacy `square`. Ambas formas se aceptan en detalle/uso; UUID distingue las persistidas. Runly tiene ownerId=null, ownerName=Runly, source=runly, permisos de edición falsos y updatedAt=null. El catálogo original continúa exclusivamente en código.

## Operaciones de interfaz

Guardar diseño autorizado como plantilla personal:

```http
POST /studio/templates
Content-Type: application/json

{"name":"Campaña de otoño","category":"Redes sociales","description":"Texto editable","designId":"01900000-0000-7000-8000-000000000003"}
```

Crear desde documento: reemplazar designId por `document` completo del editor; exactamente uno de los dos. Scope omitido significa personal. Para crear empresarial, indicar `"scope":"company"` y tener publish. No enviar source/ownerId/companyId; se rechazan. El origen HTTP siempre es user; los documentos pasan por el validador canónico, sin fijar versión en este contrato de API. Obtener versión, fuentes y ejemplo mediante studio_composition_guide.

Publicar una personal propia:

```http
POST /studio/templates/01900000-0000-7000-8000-000000000001/publish
Content-Type: application/json

{"revision":1}
```

Devuelve `{data:{...,scope:"company",revision:2,...}}`. La publicación concede a miembros autorizados el uso de las imágenes **propias** referenciadas. Imágenes ajenas recibidas por colaboración no se pueden redistribuir empresarialmente. No se vuelve público ningún archivo.

Editar metadata/documento con revisión esperada:

```http
PUT /studio/templates/01900000-0000-7000-8000-000000000001
Content-Type: application/json

{"revision":2,"name":"Campaña revisada","description":"Versión aprobada"}
```

Campos opcionales: name, category, description, document. No cambiar scope con PUT. El documento omitido se conserva. La respuesta contiene la revisión incrementada. Revisión concurrente: HTTP 409 con code `STUDIO_REVISION_CONFLICT`; conservar edición local, abrir detalle actual y resolver antes de reintentar.

Retirar: `DELETE /studio/templates/:id` con JSON `{"revision":3}`. Devuelve `{data:{id,name,scope,revision:4,enabled:false}}`. Retiro lógico: impide nuevos usos, no elimina diseños previos. La revisión también es obligatoria al retirar.

Crear diseño independiente: `POST /studio/templates/:key/designs` (ruta conservada), o alias `POST /studio/templates/:key/use`. No necesita copiar el JSON desde la tarjeta; el servidor carga la plantilla autorizada. Respuesta 201 `{data:{id,name,revision:1,document,updatedAt,ownerId,role:"OWNER",canEdit:true}}`. Abrir `/app/m/runly.studio?design=<id>`. Cambios posteriores de plantilla no alteran el diseño.

## Imágenes privadas y auditoría

Tablas de referencias autorizan solo los FileAssets utilizados. Empresa, disponibilidad y tipo de archivo se revalidan en crear/editar/publicar/usar y en commit MCP. Un diseño creado desde plantilla tiene referencias propias sin dependencia de la plantilla retirada ni del diseño fuente. La revocación de membresía/Studio y la deshabilitación del archivo siguen bloqueando acceso. El original se firma por el endpoint vigente del diseño, con revalidación tras I/O; no almacenar firmas en documentos.

`studio.design` es un destino **private-reference** de Files MCP: conserva adjuntos privados con la ACL del diseño, pero no inserta imágenes automáticamente en el documento. Para composición, consultar studio_media, usar fileAssetId y proponer la edición de documento. No confundir adjuntos con imágenes utilizadas en el lienzo.

AuditLog registra studio.template.create/update/publish/delete/use, revisión, alcance y actor; además los diseños y commits MCP conservan su auditoría propia. Tablas nuevas con RLS y acceso denegado a clientes públicos; no hay clientes directos de estas tablas.

## Agentes: MCP y MirAI

OAuth necesita consentimiento studio:read/studio:write. Reconectar para añadir scopes; refresh no amplía consentimiento.

```json
{"companyId":"01900000-0000-7000-8000-000000000004","request":{"operation":"studio_template_save","input":{"name":"Campaña asistida","designId":"01900000-0000-7000-8000-000000000003","scope":"personal"}}}
```

Enviar a `runly_studio_prepare`. Devuelve proposalId, preview, proposed, expiresIn=600 y approvalUrl. Mostrar el enlace y esperar aprobación web antes de `runly_studio_commit` con companyId/proposalId. Creaciones desde MCP tienen source=ai asignado por servidor. Guardar company, publicar y actualizar plantillas son sensibles; las actualizaciones personales también usan confirmación adicional conservadora. La autorización concreta de save/update depende del scope y se verifica en el servicio, aunque el permiso base del descriptor sea studio.view. Cada acción declara readPermission=studio.view explícito.

Operaciones de escritura: studio_create_design, studio_update_design, studio_template_save, studio_template_update, studio_template_publish. Actualizar exige revisión; scope solo cambia por publish. Prepare y commit revalidan ACL, empresa, archivos y revisión. Las propuestas vencidas no se ejecutan y commits repetidos devuelven el resultado guardado.

`runly_studio_query` ofrece studio_overview, studio_designs, studio_design_detail, studio_templates, studio_template_detail, studio_icon_search, studio_media, studio_composition_guide y studio_review_design. Icon search acepta q/collection/page; con iconId devuelve detalle/geometría reutilizando el catálogo y su licencia. Media devuelve metadatos sin firmas y exige Files además de Studio. Las consultas de MirAI usan exactamente estas capacidades; no hay mutaciones directas MirAI porque su flujo actual no ofrece confirmación sensible equivalente. Utilizar MCP aprobado para escribir.

Review acepta exactamente uno de designId, templateId o document validado y autorizado. Respuesta `{findings:[{objectId,severity,rule,message,suggestion}],informational:true,geometry}`. Aplica contraste AA 4.5:1 solo cuando los colores sólidos/fondo son inequívocos; imágenes, máscaras, transparencia y capas complejas implican requires_manual_review. La geometría aplica rotación/escala y altura multilínea estimada; no mide glifos reales. Texto <24px efectivo en lienzos >1000px es recomendación, no bloqueo. No existe studio_render_preview en esta entrega.
