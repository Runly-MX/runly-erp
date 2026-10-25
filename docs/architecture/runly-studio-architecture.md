# Runly Studio: arquitectura de la primera vertical

## Flujo implementado

El módulo oficial se registra en `manifests/official/studio.js` y el catálogo de core-modules; ModuleOutlet carga StudioScreen con React.lazy. La ruta es `/app/m/runly.studio/`, con `?design=<id>` para reabrir. No se modifica el resolver genérico de rutas.

StudioScreen ofrece creación en blanco, tres plantillas propias y una lista paginada de diseños privados. El workspace usa tres regiones: herramientas, página desplazable con zoom e inspector contextual con una lista de elementos accesible por teclado. El usuario puede insertar/modificar texto, formas e imágenes y confirmar la eliminación de elementos. Guardado explícito, aviso de cambios pendientes y confirmación al volver a Mis diseños. La protección beforeunload cubre recarga/cierre; la navegación externa del shell todavía necesita un bloqueo de router común.

El editor mantiene interacción Fabric fuera del estado React durante arrastres. React recibe cambios comprometidos y texto/selección; no se usa un store global de documentos. La carga de originales es asíncrona y un error de imagen impide dar por exportado un diseño incompleto.

El contrato y las rutas están descritos en [infraestructura compartida](runly-shared-graphics.md). La [auditoría](runly-studio-audit.md) contiene la sección **Integración de Runly Studio con los seis paquetes compartidos**, sus exports, matriz y consecuencias de publicación.

## Persistencia y seguridad

`studio_design` conserva identidad, empresa, propietario, revisión, JSON canónico y fechas. Las funciones del servicio viven dentro de su factory y reciben prisma. Se usa SQL parametrizado, sin accessor Prisma de una tabla de módulo ni cambios a schema.prisma.

Cada mutación y su AuditLog están en la misma transacción. El UPDATE compara revisión en la propia sentencia, de modo que dos clientes no pueden confirmar la misma revisión. No se describe este mecanismo como CRDT ni como colaboración en tiempo real.

La nueva tabla tiene RLS y no concede acceso a anon/authenticated. Los endpoints autenticados aplican permisos y filtran por empresa/propietario en cada consulta. El JSON no decide pertenencia empresarial ni puede indicar URLs arbitrarias para imágenes. No se incorpora fetch de URLs remotas en servidor, importación SVG/ZIP, HTML, proveedores de recursos ni endpoints públicos.

Las pruebas del servicio usan el cliente Prisma generado, PrismaPg y PostgreSQL desechable. El fixture UI sigue disponible para regresiones rápidas. La suite `scripts/verify-studio-supabase.mjs` usa además GoTrue, Storage, REST, Realtime, Kong y PostgreSQL reales, la API completa y un build del frontend, en un proyecto Compose desechable. No intercepta Auth/Files/Storage. Su configuración procede del instalador, con secretos nuevos, puertos loopback y volúmenes propios; no usa env files de una instalación.

## Recuperación e historial local

DesignEditor conserva borradores canónicos por empresa/usuario/diseño en este navegador, recuperables durante siete días. Un 409 permite revisar la versión actual y guardar el trabajo como un diseño independiente; no actualiza la revisión de base para pisar el servidor. Los errores temporales permiten reintento explícito. La copia se elimina después de un guardado confirmado sin cambios posteriores. Los borradores son almacenamiento local de datos del usuario, sujeto a cuota y limpieza del navegador; no son un respaldo en servidor.

El adaptador mantiene hasta 50 pasos y un presupuesto de 8 MB de strings UTF-16 de escenas, sin guardar bitmaps en el historial. Las transformaciones entran por object:modified; no por cada movimiento del puntero. Undo/redo prepara los objetos antes de sustituir la escena para no perder la actual ante un error de imagen. Incluye duplicado, clipboard de elementos dentro del editor, orden, bloqueo y visibilidad. Los atajos se limitan a la región del editor y respetan los controles de texto nativos. El historial se reinicia al reabrir o recuperar un documento; no se persiste como parte del diseño.

## Motor y exportación

Se selecciona Fabric 6.9.1 para edición de Studio, manteniendo Canvas2DRenderer para diagramas y POS. La evidencia y alternativas están en [el ADR](adr-runly-studio-renderer.md). No se añade Fabric a core, ui, sdk ni a API/worker.

El PNG actual se genera en navegador. Las pruebas también se ejecutan en Chrome headless, lo que demuestra viabilidad de esa ruta de renderizado, no una API de render servidor ya disponible. Un servicio futuro debe resolver archivos con identidad empresarial, fuentes instaladas y límites de CPU/memoria, dentro de la cola/worker existente cuando sea compatible. La opción fabric/node requiere evaluar dependencias nativas por separado.

## Integraciones futuras y propiedad de datos

Documents conserva versiones de plantillas documentales y GeneratedDocument. Studio conserva versiones de su esquema gráfico y revisiones de edición. Una futura generación debe entregar FileAsset + información de exportación al hub, evitando duplicar las versiones de una misma plantilla en ambos sistemas.

El certificado local contiene únicamente texto de ejemplo. No obtiene datos empresariales ni emite certificados oficiales LMS.

Las propuestas designs.render/templates.apply/exports.create no están registradas. Antes de hacerlo: validar SERVICE_CONTRACTS, permiso del actor, empresa de plantilla y archivos, clave idempotente de generación, almacenamiento, reintentos y fallos parciales. La aceptación debe demostrar un evento LMS autorizado que produce un único archivo con sus reintentos.

## Despliegue preparado, sin ejecutar

1. Revisar el diff de la migración `20261130000000_studio_design` y el estado de migraciones de la instalación. No se infiere ese estado de Git.
2. En un entorno de prueba autorizado, aplicar el flujo normal de migraciones forward y la sincronización del catálogo oficial/permisos. No se necesita regenerar Prisma por esta tabla SQL sin accessor generado.
3. Asignar permisos studio.view/create/edit y los permisos Files requeridos para originales privados. No hay grants automáticos a usuarios existentes.
4. Abrir `/app/m/runly.studio/`, crear, modificar, guardar, reabrir y exportar. Verificar empresa activa y denegación desde otra cuenta.
5. Antes de cualquier producción, completar comprobación con auth/storage reales y revisar los fallos globales de política heredados.

No se publicaron paquetes, imágenes ni instaladores y no se aplicaron migraciones a una instalación existente.
