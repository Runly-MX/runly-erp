# Studio: plantillas persistentes y dominio MCP

Fecha: 2026-10-25. Estado: especificación técnica validada contra el código local.

## Problema y objetivos

El catálogo actual solo ofrece plantillas en código. Se necesita conservar diseños reutilizables personales y empresariales, con autorización en servidor, revisiones optimistas y operaciones asistidas sujetas a aprobación. Esta entrega comprende backend, migración forward, MCP, MirAI y pruebas locales. No modifica React, Fabric ni el contrato canónico.

## Arquitectura verificada

- `apps/shared/studio/document.js`: `validateDocument`, versión exportada y límites oficiales; actualmente versión 4, objetos planos con `groupId`, imagen con propiedades de máscara/filtros, texto con escalas y variantes. No fijar esa versión en servicios nuevos.
- `apps/shared/studio/templates.js`: catálogo `STUDIO_TEMPLATES` y `templateDocument`; permanece en código.
- `apps/api/src/routes/studio/studio-service.js`: transacciones, revisión optimista y auditoría de diseños.
- `studio-access.js`: identidad, `runly_studio.member_active`, ACL de diseño y referencias `studio_design_asset`. Las copias actuales pueden depender de acceso al diseño original.
- `studio-collaboration.js`: firma temporal de originales tras autorizar el diseño. Files conserva sus propias políticas y no se modifica la visibilidad del archivo.
- `catalog/service.js`: Iconify reutilizable con licencia, cuota y límites.
- `mcp/registry.js` y `domain-runtime.js`: herramientas agrupadas; propuestas de diez minutos, aprobación web, confirmación sensible, revalidación y commit serializable/idempotente.
- `routes/chat/mirai-actions-wiring.js`: registro de capacidades compartidas, herramientas y servicio de propuestas MirAI.

## Modelo y aislamiento

Nueva migración posterior a las migraciones Studio existentes; nunca reescribirlas. `studio_template`: UUIDv7 generado en PostgreSQL, empresa/propietario con FK, scope personal/company, nombre obligatorio (160), categoría (80), descripción (1000), documento JSONB validado, source user/ai, source_design_id opcional, revisión positiva inicial 1, enabled, fechas. Índices por empresa/scope/propietario y fecha. Representación Prisma compatible con las convenciones de almacenamiento oficial.

`studio_template_asset` relaciona plantilla y FileAsset, registrando el actor que autoriza cada referencia. RLS habilitado y revocación explícita de PUBLIC/anon/authenticated para ambas tablas: acceso exclusivamente por servicios autorizados, sin políticas permisivas de cliente. Empresa de cada archivo debe coincidir con la plantilla. Una plantilla inválida por recursos revocados no se puede utilizar.

Identificadores: UUID para persistidas; claves legacy y `runly:<key>` para catálogo. El catálogo devuelve `id=runly:<key>` y conserva `key`. Nunca se persisten filas del sistema.

## Matriz de permisos y propiedad

Todas las operaciones exigen membresía vigente, módulo instalado/habilitado y `studio.view` efectivo.

| Operación | Personal | Empresa | Runly |
| --- | --- | --- | --- |
| Leer/usar | Solo propietario | Miembro autorizado de esa empresa | Miembro autorizado |
| Crear/editar/retirar | Propietario con templates.manage | templates.publish, incluso otro propietario | Inmutable |
| Publicar | Propietario con templates.publish | Ya publicada; no conversión inversa | Prohibido |
| Crear diseño | studio.create adicional | studio.create adicional | studio.create adicional |

Los dos permisos se agregan a manifest y catálogo legible. Publicar corresponde solo a administradores por defecto. Revisar seed, provisioning y sincronización: no inferir grants desde studio.edit, no modificar overrides/revocaciones ni otorgar permisos nuevos silenciosamente a roles existentes. No actualizar datos de instalaciones en esta sesión.

## Recursos privados

Recorrer referencias del documento validado de manera recursiva, sin depender solo de imágenes en la lista raíz. Una referencia nueva requiere autorización Files o propiedad en la empresa; una referencia copiada de diseño requiere ACL vigente. Publicar una imagen propia constituye una concesión explícita de uso empresarial documentada en la aprobación/auditoría; imágenes ajenas recibidas por colaboración no se pueden redistribuir empresarialmente. No cambiar visibility ni copiar bytes.

Al usar una plantilla se revalidan todos los recursos y se crean referencias independientes `studio_design_asset` sin dependencia de la plantilla ni de su diseño fuente. Esto permite conservar diseños después del retiro de la plantilla. La revocación de membresía/Studio y la deshabilitación del archivo siguen siendo efectivas en cada lectura/exportación. No guardar tokens ni URLs firmadas; una firma temporal solo se obtiene mediante el endpoint autorizado del diseño. Ninguna concesión permite enumerar otros archivos del propietario.

## HTTP y contrato visual

Todos los resultados conservan `{data: ...}`. GET `/studio/templates` conserva `{data:{data:[],pagination,categories}}` para clientes actuales; filtros scope=all/runly/personal/company, q, category, page (12 por página). Cada tarjeta ofrece id/key, name, category, description, scope, ownerId/ownerName, source, revision, updatedAt, canEdit/canDelete/canPublish, preview acotada, width/height, objectCount. `document` en tarjetas es un alias del preview por compatibilidad; no es editable. No enviar el documento completo en tarjetas. Categorías disponibles mediante resumen de capacidades.

- GET `/:id`: documento validado y metadatos efectivos.
- POST: name, category?, description?, scope?=personal y exactamente uno de designId/document. Source de navegador siempre user.
- PUT `/:id`: metadata/document opcionales y revision obligatoria; no cambiar scope genéricamente. Update atómico; 409 ante revisión obsoleta.
- POST `/:id/publish`: revision obligatoria; solo personal propia y permiso publish; validar recursos y auditar.
- DELETE `/:id`: retiro lógico, con revision para concurrencia; no elimina diseños previos.
- POST `/:key/designs` y alias `/:key/use`: copia independiente; conserva ruta anterior.

Errores Studio 400/403/404/409, recursos ajenos indistinguibles de inexistentes. Auditoría AuditLog: crear, editar, publicar, retirar y usar, con revisión, scope y origen; no copiar documentos grandes a metadata.

## MCP y MirAI

Registrar runly.studio con scopes studio:read/write, herramientas runly_studio_query/prepare/commit. Consultas: studio_overview, studio_designs, studio_design_detail, studio_templates, studio_template_detail, studio_icon_search, studio_media, studio_composition_guide, studio_review_design. Overview entrega versión/objetos/fuentes/variantes/límites/guía/enlace, resúmenes paginados y recuentos accesibles; nunca cientos de documentos.

Acciones: studio_create_design, studio_update_design, studio_template_save, studio_template_update, studio_template_publish. Todas declaran readPermission studio.view explícito y llaman servicios comunes. Prepare valida datos, ACL, revisión y archivos; muestra nombre, alcance, dimensiones, recuento y cambios. Commit repite preparación y validaciones mediante el runtime actual. Fuente ai solo en acciones internas autenticadas; el input no admite owner/company/source. Company save/update/publish son sensibles. No debilitar la inferencia global de permisos: admitir el readPermission explícito del adaptador.

MirAI reutiliza consultas; el motor actual de propuestas no ofrece confirmación sensible equivalente, por lo que se registran solo consultas y se utiliza MCP aprobado para mutaciones. No introducir bypass directo.

Decisiones verificadas: Studio ya usa SQL parametrizado sin modelos Prisma para sus tablas oficiales; conservar esa convención y no alterar schema.prisma. El provisioning/sync crea definiciones de permisos y reserva la asignación automática al catálogo administrativo vigente; no agregar grants de roles normales. Las actualizaciones de plantilla MCP son siempre sensibles por conservadurismo, ya que el descriptor de sensibilidad opera sobre input antes de resolver el alcance. El destino Files studio.design es private-reference y nunca inserta automáticamente imágenes en el documento.

## Revisión determinista

Lint informativo tras validateDocument, para diseño/plantilla accesible o propuesta validada. Hallazgos `{objectId,severity,rule,message,suggestion}`. Geometría: AABB de cuatro esquinas rotadas con escalas; texto multilínea usa altura declarada y estimación conservadora, siempre identifica la medición aproximada dependiente del renderer. groupId es agrupación lógica plana; si aparecen transformaciones jerárquicas no reconocidas, advertir revisión manual en vez de afirmar exactitud.

Contraste WCAG AA 4.5:1 solo con color sólido, opacidad completa y fondo inequívoco. Evaluar capas inferiores/intersecciones; fotografía, vector, máscara, transparencia o geometría ambigua implica requires_manual_review. Textos ocultos no producen afirmaciones de contraste. Tamaño efectivo <24px cuando max(width,height)>1000: recomendación de legibilidad, puede ser texto secundario intencional. Avisar por más de tres familias, objetos enteramente fuera, texto parcialmente fuera y objetos ocultos/bloqueados. No bloquear guardado.

## Seguridad y límites

Validación canónica en servidor, límite oficial de bytes/objetos y bodyLimit existente. Paginación y preview limitadas también para geometría y texto. Queries parametrizadas; UUID validado antes de SQL. Locks de autorización y registro para mutaciones, CAS por revisión, transacción incluye referencias y auditoría. No acceder a base compartida, SSH, servidores Runly, publicaciones ni despliegues. Toda prueba SQL usa Docker local y nombre de base desechable explícito.

## Verificación y aceptación

Pruebas: scopes/propiedad/empresas, falta de view, manage sin publish, publish administrativo y revocado, catálogo inmutable, copia independiente, soft delete, CAS concurrente, imágenes privadas/ajenas/deshabilitadas, persistencia del acceso tras retiro, auditoría atómica, MCP aprobación/expiración/idempotencia/revalidación/sensibilidad, contratos MirAI y lint positivos/negativos. Regresiones Studio/MCP/permisos/Files, check:privacy. Registrar fallos heredados sin ocultarlos. Commits propios en main tras revisar diff e índice.

## Riesgos y decisiones

Desarrollo concurrente: volver a comprobar contrato/HEAD antes de commits; no tocar UI ni motor. No asumir que el esquema de grupos evolucionará igual: validar y recorrer el contrato vigente. Capabilities de fuentes/tipos deben derivarse de exportaciones existentes o ejemplos canónicos, sin inventar renderer. La autorización de compartir recursos ajenos se restringe deliberadamente a su propietario para publicación; futura delegación requerirá ACL explícita.

## Fase futura: preview gráfico para IA

No implementar studio_render_preview. Evaluar Chromium headless con renderer Fabric y fuentes reales como referencia de fidelidad; SVG/raster podría ser alternativa si reproduce todos los objetos. Sharp sirve para conversión/redimensionado, no reemplaza composición, fuentes, filtros y máscaras. Futuro pipeline aislado, autorizado, con cuotas, tiempo/memoria limitados y salida temporal; probar fidelidad contra editor.
