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
  isolation_required: { title: 'No disponible en esta instalación', message: 'La importación de sitios ZIP necesita un dominio aislado que esta instalación todavía no tiene configurado.', tone: 'info' },
  retention_required: { title: 'No habilitado', message: 'Esta operación no está habilitada porque conservamos los datos del sitio.', tone: 'info' },
  ambiguous_site_identifier: { title: 'Pertenencia sin aclarar', message: 'Este elemento podría pertenecer a otra área, como Growth. No se publicará hasta que se aclare.', tone: 'warning' },
  route_conflict: { title: 'Esa dirección ya existe', message: 'Otra página de este sitio usa la misma ruta.', tone: 'warning' },
  hostname_taken: { title: 'Dirección no disponible', message: 'Esa dirección ya está en uso. Prueba con otra.', tone: 'warning' },
  hostname_reserved: { title: 'Dirección reservada', message: 'Esa dirección no se puede usar. Prueba con otra.', tone: 'warning' },
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
  release_not_ready: { title: 'La versión no está lista', message: 'Esa versión todavía no terminó de prepararse.', tone: 'warning', reload: true },
  rollback_not_published: { title: 'Versión nunca publicada', message: 'Solo se puede volver a versiones que estuvieron publicadas.', tone: 'warning' },
  runtime_unavailable: { title: 'Servicio de publicación no disponible', message: 'Tu sitio publicado no cambió. Intenta de nuevo en unos minutos.', tone: 'danger', retry: true },
  dependency_unavailable: { title: 'Servicio no disponible', message: 'Tu sitio publicado no cambió. Intenta de nuevo en unos minutos.', tone: 'danger', retry: true },
  integrity_failed: { title: 'No se pudo verificar la versión', message: 'Tu sitio publicado no cambió. Intenta preparar la versión de nuevo.', tone: 'danger', retry: true },
  preparation_failed: { title: 'No se pudo preparar la versión', message: 'Tu sitio publicado no cambió. Intenta de nuevo.', tone: 'danger', retry: true },
  snapshot_too_large: { title: 'El sitio es demasiado grande', message: 'La versión supera el tamaño permitido.', tone: 'warning' },
  import_not_ready: { title: 'La importación no está lista', message: 'Espera a que termine la validación del archivo.', tone: 'warning' },
  import_rejected: { title: 'Archivo rechazado', message: 'El archivo ZIP no cumple los requisitos.', tone: 'warning' },
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
