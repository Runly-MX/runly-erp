// Client for the public orders endpoints of a published site (same origin; the session is the httpOnly account cookie).
import { readAtlasConfig } from './catalogPublicClient.js'

const STATUS_LABELS = { pending: 'Pendiente de pago', paid: 'Pagado', cancelled: 'Cancelado' }
export const orderStatusLabel = (status) => STATUS_LABELS[status] ?? 'En proceso'

export function formatOrderTotal(total, currency, locale = 'es-MX') {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: String(currency).toUpperCase() }).format(total) } catch { return `${Number(total).toFixed(2)} ${String(currency ?? '').toUpperCase()}`.trim() }
}

async function call(path) {
  const cfg = readAtlasConfig()
  if (!cfg?.apiUrl || !cfg?.siteId) throw Object.assign(new Error('config-missing'), { code: 'CONFIG_MISSING' })
  const res = await fetch(`${cfg.apiUrl}/public/website${path}`, { credentials: 'same-origin', headers: { 'X-Site-Id': cfg.siteId } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status, code: json.code })
  return json.data
}

/** Orders of the signed-in customer, newest first. */
export const fetchMyOrders = () => call('/orders/mine')

/** Asks the server whether the Stripe session of the return URL was paid. Resolves to { number, status, total, currency }. */
export const confirmCheckout = (sessionId) => call(`/checkout/confirm?session_id=${encodeURIComponent(sessionId)}`)

/** The Stripe session id of the thanks page URL, or null (only well-formed ids are ever sent). */
export function sessionIdFromLocation(search = typeof window === 'undefined' ? '' : window.location.search) {
  const value = new URLSearchParams(search).get('session_id')
  return value && /^cs_[A-Za-z0-9_]{8,200}$/.test(value) ? value : null
}
