// Shared pieces of the public Boletos portal (F6E): API, error messages, formatting and
// the iframe height report used by the Website block.
import { useEffect } from 'react'
import { runly } from '../../../lib/runly.js'

export const ticketsApi = runly.ticketing.portal
export const unwrap = (res) => res?.data ?? res

const MESSAGES = {
  EVENT_UNAVAILABLE: 'Este evento no está disponible.',
  SALES_CLOSED: 'La venta de este evento no está abierta.',
  SOLD_OUT: 'Ya no quedan suficientes boletos de ese tipo. Ajusta la cantidad o elige otro.',
  SESSION_FULL: 'Esa función ya no tiene lugares suficientes.',
  SESSION_UNAVAILABLE: 'Esa función ya no está disponible.',
  OUTSIDE_SALES_WINDOW: 'Ese boleto no está a la venta en este momento.',
  ORDER_LIMIT: 'Elegiste más boletos de los permitidos por orden.',
  TYPE_ORDER_LIMIT: 'Elegiste más boletos de ese tipo de los permitidos por orden.',
  HOLDER_REQUIRED: 'Escribe el nombre de cada asistente.',
  PAID_AT_BOX_OFFICE: 'Los boletos con precio se compran en taquilla.',
  POLICY_CHANGED: 'Las condiciones del evento cambiaron. Revísalas y acéptalas de nuevo.',
  LINK_INVALID: 'El enlace no es válido o ya venció.',
  REISSUE_REQUIRED: 'Este boleto no se puede reenviar por correo; pide al organizador que lo reemita.',
  RATE_LIMITED: 'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
  TOO_SOON: 'Esa función ya empezó o está por empezar.',
  CONFLICT_RETRY: 'Mucha gente está pidiendo boletos al mismo tiempo. Inténtalo de nuevo.',
}
export const isNetworkError = (error) => !error?.status
export function ticketsError(error) {
  if (isNetworkError(error) && !error?.code) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'
  return MESSAGES[error?.code] ?? error?.message ?? 'No pudimos completar la solicitud. Inténtalo de nuevo.'
}

export function money(amount, currency) {
  if (amount == null) return null
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency || 'MXN' }).format(Number(amount)) } catch { return `$${amount}` }
}

const fmt = (timeZone, options) => new Intl.DateTimeFormat('es-MX', { timeZone, ...options })
// Sentence case ("Domingo, 22 de noviembre de 2026"), never Title Case.
const upperFirst = (text) => text.charAt(0).toUpperCase() + text.slice(1)
export const longDate = (date, tz) => upperFirst(fmt(tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date)))
export const dayLabel = (date, tz) => upperFirst(fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date)))
export const shortDate = (date, tz) => fmt(tz, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(date))
export const time = (date, tz) => fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))
export const dayNumber = (date, tz) => fmt(tz, { day: 'numeric' }).format(new Date(date))
export const monthShort = (date, tz) => fmt(tz, { month: 'short' }).format(new Date(date)).replace('.', '')

// Inside an iframe: report the content height to the embedding page (Website block).
export function useReportHeight(active, ref) {
  useEffect(() => {
    const node = ref.current
    if (!active || !node || typeof ResizeObserver === 'undefined') return undefined
    const send = () => window.parent.postMessage({ type: 'runly-tickets:height', height: Math.ceil(node.getBoundingClientRect().height) }, '*')
    const observer = new ResizeObserver(send)
    observer.observe(node)
    send()
    return () => observer.disconnect()
  }, [active, ref])
}

// Which site frames the page and whether the event authorizes it (the CSP frame-ancestors
// served by nginx is the real guard; this explains the refusal where the browser tells).
export function embedBlocked(allowedOrigins = []) {
  if (typeof window === 'undefined') return false
  let framed = false
  try { framed = window.self !== window.top } catch { framed = true }
  if (!framed) return false
  let parent = window.location.ancestorOrigins?.[0] ?? null
  if (!parent && document.referrer) { try { parent = new URL(document.referrer).origin } catch { parent = null } }
  return Boolean(parent) && parent !== window.location.origin && !allowedOrigins.includes(parent)
}
