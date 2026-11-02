// apps/desktop/src/modules/runly.pos/restaurant/lib/restaurantRules.js
//
// Pure helpers for the restaurant screens. Money stays as server strings; the
// only arithmetic is in integer cents to build a requested payment amount from
// amounts the server already calculated (the server validates every figure).

export const TABLE_STATUS_META = {
  AVAILABLE: { label: 'Libre', tone: 'success' },
  OCCUPIED: { label: 'Ocupada', tone: 'warning' },
  BILL_REQUESTED: { label: 'Pidió la cuenta', tone: 'brand' },
  DIRTY: { label: 'Por limpiar', tone: 'neutral' },
  RESERVED: { label: 'Reservada', tone: 'neutral' },
  DISABLED: { label: 'Deshabilitada', tone: 'neutral' },
}

export const TERMINAL_ORDER_STATUSES = ['PAID', 'CANCELLED', 'REFUNDED']

export function toCents(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function fromCents(cents) {
  return (cents / 100).toFixed(2)
}

export function elapsedMinutes(from, now = Date.now()) {
  const t = new Date(from).getTime()
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now - t) / 60000))
}

export function elapsedLabel(from, now = Date.now()) {
  const m = elapsedMinutes(from, now)
  if (m === null) return '—'
  if (m < 1) return 'Ahora'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

export function clockLabel(value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

export function activeLines(order) {
  return (order?.lines ?? []).filter((l) => !l.voided)
}

// draft = not sent yet (editable); the rest mirror the kitchen status the
// server keeps on the order line.
export function lineStage(line) {
  if (!line.dispatchedAt) return 'draft'
  if (line.kitchenStatus === 'IN_PREPARATION') return 'preparing'
  if (line.kitchenStatus === 'READY') return 'ready'
  if (line.kitchenStatus === 'DELIVERED') return 'delivered'
  return 'sent'
}

export const STAGE_META = {
  draft: { label: 'Sin enviar', tone: 'neutral' },
  sent: { label: 'Enviado', tone: 'brand' },
  preparing: { label: 'Preparando', tone: 'warning' },
  ready: { label: 'Lista', tone: 'success' },
  delivered: { label: 'Entregada', tone: 'neutral' },
}

export function splitStages(order) {
  const lines = activeLines(order)
  return {
    draft: lines.filter((l) => lineStage(l) === 'draft'),
    sent: lines.filter((l) => lineStage(l) !== 'draft'),
  }
}

// Dispatch number of a sent line, taken from the order's own dispatch history.
export function dispatchSequenceOf(order, line) {
  if (!line.dispatchedAt) return null
  const at = new Date(line.dispatchedAt).getTime()
  const match = (order?.dispatches ?? []).find((d) => new Date(d.dispatchedAt).getTime() === at)
  return match?.sequence ?? null
}

export function lineModifiersText(line) {
  return (line.modifiers ?? []).map((m) => m.optionName).filter(Boolean).join(', ')
}

// Outstanding amount per order line = line total minus what the server has
// already attributed to it (seat-totals allocations).
export function lineOutstanding(line, allocations = []) {
  const paid = allocations.filter((a) => a.orderLineId === line.id).reduce((s, a) => s + toCents(a.amount), 0)
  return Math.max(0, toCents(line.totalAmount) - paid)
}

// Allocations for a set of lines, plus the total they add up to.
export function buildAllocations(lines, allocations = []) {
  const rows = lines
    .map((l) => ({ orderLineId: l.id, cents: lineOutstanding(l, allocations) }))
    .filter((r) => r.cents > 0)
  return {
    allocations: rows.map((r) => ({ orderLineId: r.orderLineId, amount: fromCents(r.cents) })),
    amount: fromCents(rows.reduce((s, r) => s + r.cents, 0)),
  }
}

// Wire-level error codes the restaurant flow adds on top of the shared POS ones.
export const RESTAURANT_ERRORS = {
  TABLE_OCCUPIED: { kind: 'conflict', message: 'La mesa ya tiene una cuenta abierta. Se recargó: retómala desde Mesas.' },
  TABLE_NAME_CONFLICT: { kind: 'validation', message: 'Ya existe una mesa con ese nombre.' },
  RESOURCE_VERSION_CONFLICT: { kind: 'conflict', message: 'Otro dispositivo cambió esto primero. Ya se recargó: revisa y vuelve a intentarlo.' },
  NO_PENDING_LINES: { kind: 'validation', message: 'No hay productos nuevos por enviar.' },
  PREPARATION_ALREADY_DISPATCHED: { kind: 'validation', message: 'Este producto ya está en cocina. Agrega otra línea para un extra.' },
  UNDO_NOT_ALLOWED: { kind: 'validation', message: 'Ya no se puede deshacer: solo quien hizo el cambio, dentro de cinco segundos.' },
  PREPARATION_STATION_REQUIRED: { kind: 'config', message: 'Falta una estación de cocina habilitada en esta sucursal. Un administrador debe configurarla.' },
  ALLOCATION_CONFLICT: { kind: 'conflict', message: 'Esa parte de la cuenta ya está cubierta. Se recargó el saldo.' },
}

// How far the screen can be trusted, most urgent first (see ConnectionNotice).
export function connectionState({ online, isError, hasData, isFetching, pending }) {
  if (!online) return 'offline'
  if (pending > 0) return 'pending'
  if (isError && hasData) return 'stale'
  if (isFetching && !hasData) return 'recovering'
  if (isError) return 'stale'
  return 'confirmed'
}
