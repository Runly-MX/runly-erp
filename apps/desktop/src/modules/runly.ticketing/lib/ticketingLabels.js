// Spanish labels and helpers shared by the Boletos screens.
export const TICKETING_BASE = '/app/m/runly.ticketing'
export const ticketingPath = (sub = '') => `${TICKETING_BASE}${sub}`

export const ORDER_STATUS = {
  PENDING_PAYMENT: { label: 'Pendiente de pago', tone: 'warning' },
  CONFIRMED: { label: 'Confirmada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  EXPIRED: { label: 'Vencida', tone: 'neutral' },
  REFUNDED: { label: 'Reembolsada', tone: 'neutral' },
}
export const TICKET_STATUS = {
  PENDING_PAYMENT: { label: 'Por pagar', tone: 'warning' },
  ISSUED: { label: 'Vigente', tone: 'success' },
  USED: { label: 'Usado', tone: 'brand' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral' },
  EXPIRED: { label: 'Vencido', tone: 'neutral' },
}
export const CHANNEL = { box_office: 'Taquilla', portal: 'Portal', website: 'Sitio web', api: 'API' }
export const ROLE = { admin: 'Administrador', agent: 'Agente', viewer: 'Lector' }
export const ROLE_HINT = { admin: 'Configura el evento y su equipo', agent: 'Emite, cobra y cancela boletos', viewer: 'Consulta órdenes y asistentes' }
export const VISIBILITY = { public: 'Público', private: 'Privado (solo con enlace)', box_office: 'Solo en taquilla' }
export const optionsOf = (map) => Object.entries(map).map(([value, v]) => ({ value, label: typeof v === 'string' ? v : v.label }))
export const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

export function money(amount, currency) {
  if (amount == null) return '—'
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: currency || 'MXN' }).format(Number(amount)) } catch { return `${Number(amount).toFixed(2)} ${currency ?? ''}` }
}

// "Concierto de primavera" -> "concierto-de-primavera" (only while the slug is untouched).
export const slugOf = (title) => title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)

export function ticketingError(error, fallback = 'No se pudo completar la operación.') {
  return error?.message || error?.body?.error || fallback
}
