// apps/desktop/src/modules/runly.pos/retail/lib/retailRules.js
//
// Pure helpers for the retail screens. Amounts are server strings; the only
// arithmetic here is display previews explicitly labeled as such.

export function formatMoney(value, currency = 'MXN') {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  try {
    return n.toLocaleString('es-MX', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency ?? '') ? currency : 'MXN' })
  } catch {
    return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
  }
}

export function formatQuantity(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toLocaleString('es-MX', { maximumFractionDigits: 3 })
}

// Unit price the customer pays: catalog prices may exclude tax; the order
// adds it, so the tile and the line show it included. rate is a percent.
export function grossPrice(price, rate, included) {
  const n = Number(price)
  if (price === null || price === undefined || !Number.isFinite(n)) return price
  if (included !== false || !Number(rate)) return n.toFixed(2)
  return (Math.round(n * (1 + Number(rate) / 100) * 100) / 100).toFixed(2)
}

// Up to two initials from the words that start with a letter ("Huevo 12
// piezas" -> "HP"), for products and lines without a photo.
export function productInitials(name) {
  return String(name ?? '').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '#'
}

// Units of each product already in the sale (all its variants together), for
// the counter on the product cards.
export function quantitiesByProduct(order) {
  const totals = {}
  for (const line of order?.lines ?? []) {
    if (line.voided || !line.productId) continue
    totals[line.productId] = (totals[line.productId] ?? 0) + Number(line.quantity || 0)
  }
  return totals
}

// Contract format for money input: up to 9 integer digits and 2 decimals.
export function toMoneyString(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return n.toFixed(2)
}

// Change preview while typing; the confirmed figure is payment.changeAmount.
export function changePreview(applied, tendered) {
  const a = Math.round(Number(applied) * 100)
  const t = Math.round(Number(tendered) * 100)
  if (!Number.isFinite(a) || !Number.isFinite(t) || t < a) return null
  return ((t - a) / 100).toFixed(2)
}

// Quick tender buttons: exact amount plus the next common bills above it.
export function tenderSuggestions(remaining, bills = [20, 50, 100, 200, 500, 1000]) {
  const exact = Number(remaining)
  if (!Number.isFinite(exact) || exact <= 0) return []
  const above = bills.filter((b) => b > exact).slice(0, 3)
  const rounded = Math.ceil(exact / 10) * 10
  const list = [exact, ...(rounded > exact && !above.includes(rounded) ? [rounded] : []), ...above]
  return [...new Set(list.map((n) => n.toFixed(2)))].slice(0, 4)
}

export const OPEN_STATUSES = ['DRAFT', 'OPEN']

export function activeLines(order) {
  return (order?.lines ?? []).filter((line) => !line.voided)
}

export function itemCount(order) {
  return activeLines(order).reduce((n, line) => n + Number(line.quantity || 0), 0)
}

export const ORDER_STATUS_META = {
  DRAFT: { label: 'En curso', tone: 'neutral' },
  OPEN: { label: 'En curso', tone: 'neutral' },
  PAID: { label: 'Pagada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
  REFUNDED: { label: 'Devuelta', tone: 'warning' },
  SENT: { label: 'Enviada', tone: 'neutral' },
  PARTIALLY_SERVED: { label: 'En servicio', tone: 'neutral' },
  SERVED: { label: 'Servida', tone: 'neutral' },
}

export const PRINT_STATUS_META = {
  GENERATED: { label: 'Comprobante generado, sin imprimir', tone: 'neutral' },
  QUEUED: { label: 'Impresión solicitada', tone: 'neutral' },
  SUBMITTED: { label: 'Enviado a la impresora (sin confirmación del equipo)', tone: 'brand' },
  FAILED: { label: 'No se pudo imprimir', tone: 'danger' },
}

// Saved outlet/terminal per user + company; validated again by C0 on load.
export function selectionKey(userId, companyId) {
  return `runly.pos.retail.selection.${userId ?? 'anon'}.${companyId ?? 'none'}`
}

export function orderKey(companyId, terminalId) {
  return `runly.pos.retail.order.${companyId ?? 'none'}.${terminalId ?? 'none'}`
}
