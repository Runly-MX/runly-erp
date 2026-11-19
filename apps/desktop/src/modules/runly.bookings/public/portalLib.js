import { useCallback, useState } from 'react'
import { runly } from '../../../lib/runly.js'
import { bookingsError } from '../lib/bookingsLabels.js'

export const portalApi = runly.bookings.portal
export const unwrap = (res) => res?.data ?? res

// Business accent applied to the shared button tokens, with readable text on it.
export function accentStyle(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex ?? '')) return undefined
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return { '--brand-primary': hex, '--brand-primary-hover': hex, '--brand-primary-foreground': luminance > 0.4 ? '#0b1220' : '#ffffff' }
}

const PORTAL_MESSAGES = {
  PAGE_UNAVAILABLE: 'Esta página de reservaciones no está disponible.',
  SERVICE_UNAVAILABLE: 'Ese servicio ya no está disponible.',
  POLICY_CHANGED: 'Las políticas cambiaron. Revísalas y acéptalas de nuevo.',
  LINK_INVALID: 'El enlace no es válido o ya venció.',
  RATE_LIMITED: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
  POLICY_WINDOW_CLOSED: 'Ya no es posible hacer este cambio en línea. Comunícate con el negocio.',
  RESCHEDULE_UNAVAILABLE: 'Esta reservación ya no se puede reprogramar en línea.',
  PHONE_REQUIRED: 'Escribe tu teléfono.',
}
export function portalError(error) {
  if (!error?.status && !error?.code) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'
  return PORTAL_MESSAGES[error.code] ?? bookingsError(error, 'No pudimos completar la solicitud. Inténtalo de nuevo.')
}
export const isNetworkError = (error) => !error?.status

// One key per attempt with the same data: a retry after a lost response is
// replayed by the server instead of booking twice; changed data gets a new key.
export function useAttemptKey() {
  const [session, setSession] = useState(() => crypto.randomUUID())
  const keyFor = useCallback((payload) => {
    let hash = 2166136261
    for (const ch of JSON.stringify(payload)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
    return `${session}-${(hash >>> 0).toString(36)}`
  }, [session])
  return [keyFor, () => setSession(crypto.randomUUID())]
}

export function formatPolicyMinutes(minutes) {
  if (minutes == null) return null
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'día' : 'días'}`
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'}`
  return `${minutes} minutos`
}
