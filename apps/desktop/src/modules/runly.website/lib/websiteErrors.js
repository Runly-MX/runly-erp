// Single map from backend error codes to user-facing Spanish copy.
// `tone`: how the UI should present it. `reload`: the user must refresh state
// before retrying. Codes come from the S1-S4 closure reports; nothing here
// decides authority, it only explains what the server already decided.

const MAP = {
  network: { title: 'Sin conexión', message: 'No pudimos comunicarnos con el servidor. Tu trabajo se conserva en este equipo.', tone: 'warning', retry: true },
  permission_denied: { title: 'No tienes permiso', message: 'Tu rol no permite esta acción.', tone: 'warning' },
  resource_not_found: { title: 'Ya no está disponible', message: 'Este elemento no existe o ya no tienes acceso a él.', tone: 'warning' },
  revision_conflict: { title: 'Esta página cambió', message: 'Otra persona, u otra pestaña, guardó una versión más reciente.', tone: 'warning', reload: true },
  draft_changed: { title: 'Se guardaron cambios', message: 'Se guardaron cambios mientras preparábamos esta versión. Prepárala de nuevo.', tone: 'warning', reload: true },
  publication_conflict: { title: 'Otra persona publicó', message: 'La publicación cambió mientras trabajabas. Revisa el estado actual y vuelve a intentarlo.', tone: 'warning', reload: true },
  idempotency_conflict: { title: 'Intento duplicado', message: 'Este intento ya se registró con otros datos. Vuelve a intentarlo.', tone: 'warning' },
  publication_requires_explicit_action: { title: 'Usa Publicar', message: 'El estado público solo cambia desde el flujo de publicación.', tone: 'warning' },
  isolation_required: { title: 'Dominio pendiente de configurar', message: 'Reserva la dirección del sitio en Dominios. El modo con almacenamiento y sesión, y las vistas previas privadas, necesitan un dominio independiente del ERP. Para publicar scripts locales en la dirección del sitio, elige Sitio HTML, CSS y JavaScript.', tone: 'info' },
  static_content_required: { title: 'La plantilla contiene código no permitido', message: 'El modo HTML y CSS no admite scripts, eventos como onclick ni documentos incrustados. Para una exportación con scripts locales, elige Sitio HTML, CSS y JavaScript. No se eliminó código del ZIP.', tone: 'warning' },
  retention_required: { title: 'No habilitado', message: 'Esta operación no está habilitada porque conservamos los datos del sitio.', tone: 'info' },
  ambiguous_site_identifier: { title: 'Pertenencia sin aclarar', message: 'Este elemento podría pertenecer a otra área, como Growth. No se publicará hasta que se aclare.', tone: 'warning' },
  route_conflict: { title: 'Esa dirección ya existe', message: 'Otra página de este sitio usa la misma ruta.', tone: 'warning' },
  hostname_taken: { title: 'Dirección no disponible', message: 'Esa dirección ya está en uso. Prueba con otra.', tone: 'warning' },
  hostname_reserved: { title: 'Dirección reservada', message: 'Esa dirección no se puede usar. Prueba con otra.', tone: 'warning' },
  invalid_hostname: { title: 'Dominio no válido', message: 'Escribe un dominio válido, por ejemplo www.mitienda.mx.', tone: 'warning' },
  claim_in_progress: { title: 'Conexión en curso', message: 'Ese dominio tiene una conexión en curso. Inténtalo de nuevo más tarde.', tone: 'warning' },
  limit_reached: { title: 'Límite alcanzado', message: 'Se alcanzó el máximo de dominios propios de esta empresa.', tone: 'warning' },
  not_verified: { title: 'Falta verificar', message: 'Verifica primero que el dominio es tuyo.', tone: 'info' },
  custom_domains_unavailable: { title: 'No disponible', message: 'Esta instalación no tiene dominios propios habilitados.', tone: 'info' },
  namespace_unavailable: { title: 'Direcciones no disponibles', message: 'Esta instalación todavía no ofrece direcciones automáticas.', tone: 'info' },
  feature_unavailable: { title: 'Aún no disponible', message: 'Esta función todavía no está disponible.', tone: 'info' },
  validation_failed: { title: 'Revisa los datos', message: 'Algunos datos no son válidos.', tone: 'warning' },
  schema_unsupported: { title: 'Formato no compatible', message: 'Esta página usa un formato más nuevo que este editor.', tone: 'danger' },
  unknown_block_type: { title: 'Bloques desconocidos', message: 'La página tiene bloques que ya no existen. Se conservan, pero no se podrá publicar hasta resolverlos.', tone: 'warning' },
  unknown_block_property: { title: 'Propiedades no soportadas', message: 'Un bloque tiene propiedades que no se pueden publicar.', tone: 'warning' },
  invalid_block_property: { title: 'Propiedad inválida', message: 'Un bloque tiene una propiedad con un valor no válido.', tone: 'warning' },
  unsafe_link: { title: 'Enlace no permitido', message: 'Hay un enlace que no se puede publicar.', tone: 'warning' },
  unsafe_content: { title: 'Contenido no permitido', message: 'Hay contenido que no se puede publicar.', tone: 'warning' },
  asset_not_publishable: { title: 'Imagen no publicable', message: 'Una imagen es privada, externa o no se puede publicar.', tone: 'warning' },
  asset_requires_pinning: { title: 'Recurso externo', message: 'Un recurso externo no se puede fijar en la publicación.', tone: 'warning' },
  asset_too_large: { title: 'Imagen demasiado grande', message: 'Una imagen supera el tamaño permitido.', tone: 'warning' },
  asset_type_mismatch: { title: 'Tipo de archivo no válido', message: 'Un archivo no coincide con su tipo declarado.', tone: 'warning' },
  asset_path_conflict: { title: 'Un archivo cambió con el mismo nombre', message: 'Vuelve a compilar el sitio para que los archivos cambiados tengan nombres nuevos.', tone: 'warning' },
  menu_reference_invalid: { title: 'Menú con enlaces inválidos', message: 'Un menú apunta a una página que no existe.', tone: 'warning' },
  settings_not_publishable: { title: 'Configuración no publicable', message: 'Hay ajustes del sitio que no se pueden publicar.', tone: 'warning' },
  page_not_public: { title: 'Página no pública', message: 'Una página seleccionada no es pública.', tone: 'warning' },
  form_scope_unresolved: { title: 'Formulario sin propietario resuelto', message: 'Una página usa un formulario que todavía no se puede publicar: falta resolver a quién pertenece.', tone: 'warning', blocker: true },
  dynamic_binding_unavailable: { title: 'Calendar aún no disponible', message: 'Una página usa reservas de Calendar, que todavía no se pueden publicar.', tone: 'warning', blocker: true },
  booking_page_required: { title: 'Reservaciones sin página', message: 'Un bloque de Reservaciones no tiene página elegida. Elige una página de reservaciones publicada o quita el bloque.', tone: 'warning', blocker: true },
  booking_page_unpublished: { title: 'Página de reservaciones sin publicar', message: 'Un bloque de Reservaciones usa una página que no está en línea. Publícala en Reservaciones > Reservas online.', tone: 'warning', blocker: true },
  booking_service_unavailable: { title: 'Servicio no disponible', message: 'Un bloque de Reservaciones eligió un servicio que su página ya no ofrece.', tone: 'warning', blocker: true },
  ticket_event_required: { title: 'Bloque de boletos sin evento', message: 'Un bloque «Evento con boletos» no tiene evento elegido. Elige un evento publicado o quita el bloque.', tone: 'warning', blocker: true },
  ticket_event_unpublished: { title: 'Evento sin publicar', message: 'Un bloque «Evento con boletos» usa un evento que no está publicado. Publícalo en Eventos > Publicación.', tone: 'warning', blocker: true },
  release_not_ready: { title: 'La versión no está lista', message: 'Esa versión todavía no terminó de prepararse.', tone: 'warning', reload: true },
  rollback_not_published: { title: 'Versión nunca publicada', message: 'Solo se puede volver a versiones que estuvieron publicadas.', tone: 'warning' },
  runtime_unavailable: { title: 'Servicio de publicación no disponible', message: 'Tu sitio publicado no cambió. Intenta de nuevo en unos minutos.', tone: 'danger', retry: true },
  dependency_unavailable: { title: 'Servicio no disponible', message: 'Tu sitio publicado no cambió. Intenta de nuevo en unos minutos.', tone: 'danger', retry: true },
  integrity_failed: { title: 'No se pudo verificar la versión', message: 'Tu sitio publicado no cambió. Intenta preparar la versión de nuevo.', tone: 'danger', retry: true },
  preparation_failed: { title: 'No se pudo preparar la versión', message: 'Tu sitio publicado no cambió. Intenta de nuevo.', tone: 'danger', retry: true },
  snapshot_too_large: { title: 'El sitio es demasiado grande', message: 'La versión supera el tamaño permitido.', tone: 'warning' },
  import_not_ready: { title: 'La importación no está lista', message: 'Espera a que termine la validación del archivo.', tone: 'warning' },
  import_rejected: { title: 'Archivo rechazado', message: 'El archivo ZIP no cumple los requisitos.', tone: 'warning' },
  unexpected_archive_file: { title: 'El ZIP contiene un archivo no permitido', message: 'Revisa el archivo y el motivo indicados abajo. Vuelve a crear el ZIP con la exportación del sitio, sin archivos del proyecto, metadatos ni carpetas de servidor.', tone: 'warning' },
  unsafe_archive_path: { title: 'Nombre o ruta no permitidos', message: 'Usa rutas relativas y nombres simples dentro del ZIP, sin rutas absolutas, caracteres especiales ni segmentos «..».', tone: 'warning' },
  archive_too_large: { title: 'ZIP demasiado grande', message: 'El archivo ZIP supera el límite de 100 MB. Reduce su tamaño antes de subirlo.', tone: 'warning' },
  archive_expansion_limit: { title: 'El ZIP se expande demasiado', message: 'Reduce los archivos del sitio: el ZIP supera los límites de tamaño descomprimido o de compresión permitidos.', tone: 'warning' },
  archive_file_limit: { title: 'Demasiados archivos en el ZIP', message: 'Incluye solo los archivos publicados del sitio. El límite es de 10 000 entradas.', tone: 'warning' },
  ambiguous_archive_root: { title: 'No encontramos una raíz única', message: 'Coloca index.html en la raíz del ZIP o dentro de una única carpeta que contenga todo el sitio.', tone: 'warning' },
  archive_root_mismatch: { title: 'La estructura del ZIP no es válida', message: 'Incluye index.html y todos los archivos del sitio en la misma carpeta raíz, sin archivos fuera de ella.', tone: 'warning' },
  duplicate_archive_path: { title: 'Archivos con nombres duplicados', message: 'El ZIP contiene rutas repetidas o nombres que solo difieren en mayúsculas. Renombra los archivos y actualiza sus referencias.', tone: 'warning' },
  archive_link_or_special_file: { title: 'El ZIP contiene enlaces o archivos especiales', message: 'Exporta los archivos reales del sitio, sin enlaces simbólicos ni archivos especiales.', tone: 'warning' },
  unsupported_archive_encoding: { title: 'Formato de ZIP no compatible', message: 'Crea un ZIP estándar, sin contraseña ni cifrado, con compresión normal.', tone: 'warning' },
  invalid_archive: { title: 'No pudimos leer el ZIP', message: 'El archivo está dañado o no es un ZIP compatible. Vuelve a comprimir la exportación e inténtalo de nuevo.', tone: 'warning' },
  archive_integrity_failed: { title: 'El ZIP no pasó la verificación', message: 'Los bytes del archivo no coinciden con su información de integridad. Vuelve a generar el ZIP.', tone: 'warning' },
  overlapping_archive_entries: { title: 'La estructura interna del ZIP no es válida', message: 'Vuelve a generar el archivo con una herramienta de compresión estándar.', tone: 'warning' },
  archive_timeout: { title: 'La validación tardó demasiado', message: 'Reduce el tamaño o la cantidad de archivos del ZIP y vuelve a intentarlo.', tone: 'warning' },
  reference_budget_exceeded: { title: 'No pudimos analizar el sitio', message: 'Los archivos del sitio superan el presupuesto de análisis. Reduce su tamaño o complejidad y vuelve a exportarlos.', tone: 'warning' },
  external_artifact_dependency: { title: 'El sitio depende de archivos externos no admitidos', message: 'Google Fonts está permitido desde sus dominios oficiales. Incluye los demás estilos, imágenes, fuentes y scripts dentro del ZIP y cambia sus referencias a rutas locales.', tone: 'warning' },
  missing_artifact_dependency: { title: 'Falta un archivo del sitio', message: 'El HTML, CSS o JavaScript referencia un archivo que no está en el ZIP. Inclúyelo o corrige su ruta.', tone: 'warning' },
  unsafe_artifact_reference: { title: 'Una referencia usa una ruta no permitida', message: 'Corrige las referencias de los archivos: usa rutas locales sin barras invertidas ni rutas codificadas.', tone: 'warning' },
  unsupported_artifact_base: { title: 'La base o redirección del sitio no es compatible', message: 'Exporta el sitio para publicarlo desde la raíz y elimina las redirecciones automáticas del HTML.', tone: 'warning' },
  server_artifact_not_supported: { title: 'El sitio necesita código de servidor', message: 'Sube una exportación estática ya compilada. No se ejecutan servidores Node.js ni dependencias de backend.', tone: 'warning' },
  bare_import_not_supported: { title: 'Faltan dependencias compiladas', message: 'Compila el sitio antes de exportarlo. Los imports de paquetes deben resolverse a archivos locales incluidos en el ZIP.', tone: 'warning' },
  import_capacity: { title: 'Hay demasiadas importaciones', message: 'Espera unos minutos e inténtalo de nuevo.', tone: 'warning', retry: true },
  preview_not_publishable: { title: 'Vista previa no disponible', message: 'Esta versión solo se puede ver, no publicar.', tone: 'info' },
  rate_limited: { title: 'Demasiados intentos', message: 'Espera un momento antes de volver a intentarlo.', tone: 'warning', retry: true },
}

const BY_STATUS = {
  401: { title: 'Tu sesión caducó', message: 'Inicia sesión de nuevo. Tu trabajo se conserva en este equipo.', tone: 'warning' },
  403: MAP.permission_denied,
  404: MAP.resource_not_found,
  413: { title: 'Archivo demasiado grande', message: 'El archivo supera el tamaño permitido.', tone: 'warning' },
  415: { title: 'Tipo de archivo no permitido', message: 'Este tipo de archivo no se puede usar aquí.', tone: 'warning' },
  429: MAP.rate_limited,
  503: MAP.dependency_unavailable,
}

const FALLBACK = { title: 'Algo salió mal', message: 'No pudimos completar la acción. Inténtalo de nuevo.', tone: 'danger', retry: true }

export function describeError(error) {
  const code = error?.code ?? null
  const status = error?.status ?? 0
  const entry = (code && MAP[code]) || BY_STATUS[status] || (status === 0 && error?.code === 'network' ? MAP.network : null) || FALLBACK
  return { ...entry, code, status, requestId: error?.requestId ?? null, fields: error?.fields ?? null }
}

export function describeCode(code) {
  return MAP[code] ?? null
}

export function isRevisionConflict(error) {
  return error?.status === 409 && error?.code === 'revision_conflict'
}

// Preparation failures are stored as `failureCode` on the release row.
export function describeFailure(failureCode) {
  return MAP[failureCode] ?? MAP.preparation_failed
}
