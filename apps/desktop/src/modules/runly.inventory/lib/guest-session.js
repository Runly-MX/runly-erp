// Pure helpers for the supplier portal (guest) session. No React, no globals:
// storage is injected so the logic is testable and survives blocked storage.

const KEY_PREFIX = 'runly-inv-guest:'
const REFRESH_LEAD_MS = 5 * 60 * 1000
const MIN_REFRESH_DELAY_MS = 30 * 1000

export const guestSessionKey = (token) => `${KEY_PREFIX}${token}`

// Portal URL shape shared with the invitation emails: /app/p/inventory/<token>.
export function buildPortalUrl(origin, token) {
  return `${String(origin ?? '').replace(/\/+$/, '')}/app/p/inventory/${encodeURIComponent(token)}`
}

// The invitation link carries the token as its last path segment.
export function tokenFromLink(link) {
  const match = String(link ?? '').match(/\/inventory\/([^/?#]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function isSessionExpired(session, now = Date.now()) {
  const at = Date.parse(session?.expiresAt ?? '')
  return !session?.sessionToken || Number.isNaN(at) || at <= now
}

// Delay before the proactive refresh (a few minutes ahead of expiry, never tighter than 30s).
export function msUntilRefresh(session, now = Date.now()) {
  const at = Date.parse(session?.expiresAt ?? '')
  if (Number.isNaN(at)) return MIN_REFRESH_DELAY_MS
  return Math.max(MIN_REFRESH_DELAY_MS, at - now - REFRESH_LEAD_MS)
}

// `store` is sessionStorage-like. Falls back to the in-memory Map when storage is unavailable.
export function createSessionStore(store, memory = new Map()) {
  const safe = (fn, fallback) => { try { return fn() } catch { return fallback } }
  return {
    read(token) {
      const raw = safe(() => store?.getItem(guestSessionKey(token)), null) ?? memory.get(token) ?? null
      if (!raw) return null
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return parsed?.sessionToken ? parsed : null
      } catch { return null }
    },
    write(token, session) {
      memory.set(token, JSON.stringify(session))
      safe(() => store?.setItem(guestSessionKey(token), JSON.stringify(session)))
    },
    clear(token) {
      memory.delete(token)
      safe(() => store?.removeItem(guestSessionKey(token)))
    },
  }
}

export const GUEST_STATUS = {
  pending: { label: 'Pendiente', variant: 'warning' },
  active: { label: 'Activo', variant: 'success' },
  expired: { label: 'Vencido', variant: 'secondary' },
  revoked: { label: 'Revocado', variant: 'destructive' },
}

export const guestStatusLabel = (status) => GUEST_STATUS[status]?.label ?? 'Desconocido'
export const guestStatusVariant = (status) => GUEST_STATUS[status]?.variant ?? 'secondary'

export const GUEST_ROLE_LABEL = { viewer: 'Lector', editor: 'Editor' }
export const GUEST_ROLE_OPTIONS = [
  { value: 'viewer', label: 'Lector: solo puede ver los items' },
  { value: 'editor', label: 'Editor: puede crear y editar items y subir fotos' },
]

// Item statuses a supplier may see / set.
export const GUEST_STATUS_LABEL = {
  available: 'Disponible', maintenance: 'En mantenimiento', assigned: 'Asignado', in_use: 'En uso', retired: 'Baja', lost: 'Extraviado',
}
export const GUEST_WRITABLE_STATUS_OPTIONS = [
  { value: 'available', label: 'Disponible' },
  { value: 'maintenance', label: 'En mantenimiento' },
]

// Spanish message for the typed errors the guest API returns.
export function guestErrorMessage(err) {
  switch (err?.code) {
    case 'INVALID_LINK': return 'Este enlace no es válido o fue revocado.'
    case 'SESSION_INVALID': return 'Tu sesión terminó. Abre de nuevo el enlace de tu correo.'
    case 'CODE_REQUIRED': return 'Ingresa el código de acceso que recibiste.'
    case 'INVALID_CODE': return 'El código no es correcto.'
    case 'INVITE_LOCKED': return 'Demasiados intentos. Espera unos minutos o pide una nueva invitación.'
    case 'RATE_LIMITED': return 'Demasiadas solicitudes. Intenta de nuevo en un momento.'
    case 'READ_ONLY': return 'Tu acceso es de solo lectura.'
    case 'AREA_NOT_WRITABLE': return 'No puedes agregar items en esta carpeta.'
    case 'SERIAL_EXISTS': return 'Ya existe un item con ese número de serie.'
    case 'ASSET_TAG_EXISTS': return 'Ya existe un item con ese número de activo.'
    default: return err?.message ?? 'Ocurrió un error. Intenta de nuevo.'
  }
}

// Capability labels shown as badges for an invited guest (viewers never carry capabilities).
export function guestCapabilityLabels(guest) {
  if (!guest || guest.role !== 'editor') return []
  return [
    ...(guest.canCreateModels ? ['Crea modelos'] : []),
    ...(guest.canImport ? ['Importa Excel'] : []),
  ]
}

// PATCH body for the permissions dialog: capabilities only travel for editors.
export function buildGuestPermissionsPatch({ role, canCreateModels, canImport }) {
  return role === 'editor'
    ? { role, canCreateModels: Boolean(canCreateModels), canImport: Boolean(canImport) }
    : { role }
}
