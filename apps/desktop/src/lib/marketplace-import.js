// Presentation of the E3a Marketplace import contract (docs/architecture/2026-11-08-erp-e3a-marketplace-imports.md).
// The server decides everything (trust, eligibility, cleaning, consent); this file only maps its
// codes to words and to what the person can do next. A security verdict is never turned into a
// warning that lets the import continue.

const ERRORS = {
  RESOURCE_FEED_NOT_CONFIGURED: { kind: 'not_configured', title: 'Marketplace no configurado', message: 'Esta instancia todavía no tiene un catálogo de recursos. Pide a un administrador que lo configure.' },
  RESOURCE_FEED_UNAVAILABLE: { kind: 'unavailable', title: 'Marketplace no disponible', message: 'No hay una copia verificada del catálogo. Vuelve a intentarlo en unos minutos.', retryable: true },
  RESOURCE_FEED_UNREACHABLE: { kind: 'unavailable', title: 'Marketplace no disponible', message: 'No se pudo conectar con el catálogo. Vuelve a intentarlo en unos minutos.', retryable: true },
  RESOURCE_FEED_UNVERIFIED: { kind: 'unavailable', title: 'No se pudo confirmar la vigencia', message: 'No se pudo comprobar ahora en el catálogo que la publicación sigue vigente. No se creó nada; vuelve a intentarlo cuando haya conexión.', retryable: true },
  RESOURCE_FEED_EXPIRED: { kind: 'expired', title: 'Catálogo caducado', message: 'La copia verificada del catálogo caducó. No se puede importar hasta que se actualice.', retryable: true },
  RESOURCE_FEED_STALE: { kind: 'expired', title: 'Catálogo demasiado antiguo', message: 'La copia del catálogo es demasiado antigua para importar.', retryable: true },
  RESOURCE_ACKNOWLEDGEMENT_REQUIRED: { kind: 'stale', title: 'El catálogo no está al día', message: 'La copia verificada del catálogo tiene más de un día. Puedes continuar con ella si lo aceptas explícitamente.', acknowledge: true },
  RESOURCE_WITHDRAWN: { kind: 'withdrawn', title: 'Publicación retirada', message: 'Su autor retiró esta versión. No se puede importar.' },
  RESOURCE_REVOKED: { kind: 'revoked', title: 'Publicación revocada', message: 'Esta versión fue revocada por seguridad. No se puede importar.' },
  RESOURCE_KEY_UNTRUSTED: { kind: 'untrusted', title: 'Firma no confiable', message: 'La firma de esta publicación no es de una clave de confianza. No se puede importar.' },
  RESOURCE_PACKAGE_MISMATCH: { kind: 'untrusted', title: 'El paquete no coincide', message: 'El paquete descargado no coincide con su huella publicada. Se descartó sin usarlo.' },
  RESOURCE_PACKAGE_URL_REJECTED: { kind: 'untrusted', title: 'Paquete rechazado', message: 'La dirección del paquete no es válida. Se descartó sin usarlo.' },
  RESOURCE_PACKAGE_UNAVAILABLE: { kind: 'temporary', title: 'No se pudo descargar', message: 'El paquete no se pudo descargar ahora. Vuelve a intentarlo.', retryable: true },
  RESOURCE_RUNLY_VERSION: { kind: 'incompatible', title: 'Recurso incompatible', message: 'Este recurso no es compatible con tu versión de Runly.' },
  RESOURCE_FORMAT_UNSUPPORTED: { kind: 'incompatible', title: 'Recurso incompatible', message: 'Este recurso usa un formato más nuevo. Actualiza Runly para importarlo.' },
  RESOURCE_NOT_FOUND: { kind: 'missing', title: 'Recurso no encontrado', message: 'El recurso ya no está en el catálogo verificado.' },
  MARKETPLACE_RELEASE_MISMATCH: { kind: 'changed', title: 'La publicación cambió', message: 'Esa versión ya no corresponde a lo que elegiste. Vuelve a elegir el recurso.' },
  MARKETPLACE_TYPE_MISMATCH: { kind: 'changed', title: 'Tipo de recurso incorrecto', message: 'Este recurso no es del tipo que estás importando.' },
  STUDIO_PACKAGE_BLOCKED: { kind: 'blocked', title: 'Importación bloqueada', message: 'El paquete tiene problemas que impiden importarlo.' },
  AUTOMATION_IMPORT_BLOCKED: { kind: 'blocked', title: 'Importación bloqueada', message: 'La automatización no se puede importar en esta instancia.' },
  AUTOMATION_IMPORT_EXPIRED: { kind: 'prepare_expired', title: 'Preparación caducada', message: 'La preparación caducó o se canceló. Vuelve a prepararla.' },
  AUTOMATION_IMPORT_DIGEST_MISMATCH: { kind: 'prepare_expired', title: 'La automatización cambió', message: 'Lo que confirmaste no coincide con lo preparado. Vuelve a revisarla.' },
  AUTOMATION_IMPORT_CONSENT_MISMATCH: { kind: 'prepare_expired', title: 'Los servicios cambiaron', message: 'La lista de servicios no coincide con la preparada. Vuelve a revisarla.' },
  AUTOMATION_IMPORT_NOT_FOUND: { kind: 'prepare_expired', title: 'Preparación no encontrada', message: 'Esta preparación ya no existe. Vuelve a prepararla.' },
  AUTOMATION_KEY_TAKEN: { kind: 'conflict', title: 'Clave en uso', message: 'Ya existe una automatización con esa clave. Vuelve a intentarlo para asignar otra.', retryable: true },
  AUTOMATION_IMPORT_QUOTA: { kind: 'conflict', title: 'Demasiadas importaciones pendientes', message: 'Confirma o cancela las importaciones pendientes y vuelve a intentarlo.' },
  AUTOMATION_LIMIT: { kind: 'conflict', title: 'Límite de automatizaciones', message: 'La empresa alcanzó el máximo de automatizaciones.' },
  STUDIO_IMPORT_QUOTA: { kind: 'conflict', title: 'Demasiadas importaciones pendientes', message: 'Confirma o cancela las importaciones pendientes y vuelve a intentarlo.' },
}
// Kinds that are a security or compatibility verdict: never offered as "continue anyway".
export const TERMINAL_KINDS = new Set(['withdrawn', 'revoked', 'untrusted', 'incompatible', 'blocked', 'missing', 'not_configured'])

const errorCode = (error) => error?.code ?? error?.details?.code ?? null

// error -> { kind, title, message, retryable, acknowledge, code, details }
export function marketplaceError(error) {
  const code = errorCode(error), status = Number(error?.status)
  const known = code ? ERRORS[code] : null
  if (known) return { code, retryable: false, acknowledge: false, ...known, details: error?.details?.details ?? null }
  if (status === 401) return { kind: 'session', title: 'Sesión terminada', message: 'Vuelve a iniciar sesión e inténtalo de nuevo.', retryable: false, code }
  if (status === 403) return { kind: 'forbidden', title: 'Sin permiso', message: 'No tienes permiso para importar en este destino.', retryable: false, code }
  if (status === 429) return { kind: 'conflict', title: 'Demasiadas importaciones', message: 'Hay importaciones en curso. Confirma o cancela las pendientes y vuelve a intentarlo.', retryable: true, code }
  if (status === 409) return { kind: 'prepare_expired', title: 'La importación cambió o caducó', message: 'Vuelve a prepararla.', retryable: false, code }
  if (status >= 500 || error?.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(String(error?.message))) {
    return { kind: 'temporary', title: 'Error temporal', message: 'No se pudo completar ahora. Vuelve a intentarlo en unos minutos.', retryable: true, code }
  }
  const message = String(error?.message ?? '').replace(/\s+/g, ' ').trim()
  return { kind: 'unknown', title: 'No se pudo importar', message: message && message.length <= 220 ? message : 'No se pudo completar la importación.', retryable: false, code }
}
export const isTerminal = (state) => TERMINAL_KINDS.has(state?.kind)

// Catalog state from a list response: { blocking, stale, message }.
export function catalogState(catalog) {
  if (!catalog) return { blocking: false, stale: false }
  if (catalog.installable) return { blocking: false, stale: false, acknowledged: Boolean(catalog.requiresAcknowledgement) }
  if (catalog.reason === 'RESOURCE_ACKNOWLEDGEMENT_REQUIRED') return { blocking: false, stale: true, ...ERRORS.RESOURCE_ACKNOWLEDGEMENT_REQUIRED }
  const known = ERRORS[catalog.reason] ?? ERRORS.RESOURCE_FEED_UNAVAILABLE
  return { blocking: true, stale: false, ...known }
}

// Why one listed release cannot be imported (first server reason), or null.
export function resourceBlock(item) {
  if (item?.eligible) return null
  const code = item?.blockedBy?.find((reason) => reason !== 'RESOURCE_ACKNOWLEDGEMENT_REQUIRED') ?? item?.blockedBy?.[0]
  if (!code) return null
  return { code, ...(ERRORS[code] ?? { kind: 'blocked', title: 'No disponible', message: 'Este recurso no se puede importar ahora.' }) }
}

export function compatibilityLabel(item) {
  const runly = item?.compatibility?.runly
  if (!runly) return 'Compatibilidad no declarada'
  return runly.max ? `Runly ${runly.min} a ${runly.max}` : `Runly ${runly.min} o superior`
}
export const publisherLabel = (item) => item?.official === true ? 'Runly' : item?.publisher?.displayName || item?.publisher?.handle || 'Publicador desconocido'
export const releaseRef = (item, acknowledgeStale = false) => ({ resourceKey: item.resourceKey, version: item.version, releaseId: item.releaseId, ...(acknowledgeStale ? { acknowledgeStale: true } : {}) })
