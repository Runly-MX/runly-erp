// Chronological events of a purchase, built only from documents the API
// returned (it already drops the kinds the user cannot read). Newest first.
//   { id, at, title, detail, kind, docId, tone }   tone: done | progress | warning | danger | neutral
import { formatMoney } from './format.js'
import { withUnit } from './units.js'

const APPROVAL_OWNER = { PURCHASE_REQUEST: ['requests', 'la solicitud'], PURCHASE_ORDER: ['orders', 'la orden'], PURCHASE_INVOICE: ['invoices', 'la factura'] }

const ev = (id, at, title, extra = {}) => (at ? { id, at: String(at), title, detail: null, kind: null, docId: null, tone: 'neutral', ...extra } : null)

export function caseTimeline(c = {}) {
  const orders = new Map((c.orders ?? []).map((o) => [o.id, o]))
  const invoices = new Map((c.invoices ?? []).map((i) => [i.id, i]))
  const owners = new Map([...(c.requests ?? []), ...(c.orders ?? []), ...(c.invoices ?? [])].map((d) => [d.id, d]))
  const events = [ev(`case:${c.id}`, c.createdAt, 'Expediente abierto', { detail: c.title ?? null, kind: 'cases', docId: c.id })]

  for (const r of c.requests ?? []) events.push(ev(`req:${r.id}`, r.createdAt, `Solicitud ${r.number ?? ''}`.trim(), { detail: r.title ?? null, kind: 'requests', docId: r.id }))
  for (const q of c.quotes ?? []) {
    events.push(ev(`quote:${q.id}`, q.createdAt, `Cotización${q.supplierName ? ` de ${q.supplierName}` : ''}`, {
      detail: q.total != null ? formatMoney(q.total, q.currency) : null, tone: q.status === 'SELECTED' ? 'done' : q.status === 'DISCARDED' ? 'neutral' : 'progress',
    }))
  }
  for (const a of c.approvals ?? []) {
    const [kind, noun] = APPROVAL_OWNER[a.ownerType] ?? [null, 'el documento']
    const owner = owners.get(a.ownerId)
    const of = `${noun}${owner?.number ? ` ${owner.number}` : ''}`
    events.push(ev(`apr:${a.id}`, a.createdAt, `Aprobación solicitada para ${of}`, { detail: a.reason ?? null, kind, docId: a.ownerId, tone: 'progress' }))
    if (a.decidedAt) {
      const approved = a.status === 'APPROVED'
      events.push(ev(`aprd:${a.id}`, a.decidedAt, `${approved ? 'Aprobación concedida' : 'Aprobación rechazada'} para ${of}`, { detail: a.comment ?? null, kind, docId: a.ownerId, tone: approved ? 'done' : 'danger' }))
    }
  }
  for (const o of c.orders ?? []) {
    const ref = { kind: 'orders', docId: o.id }
    events.push(ev(`ord:${o.id}`, o.createdAt, `Orden ${o.number ?? ''} creada`.replace(/\s+/g, ' '), { ...ref, detail: o.supplierName ?? null }))
    events.push(ev(`ordi:${o.id}`, o.issuedAt, `Orden ${o.number ?? ''} emitida`.replace(/\s+/g, ' '), { ...ref, tone: 'done', detail: o.total != null ? formatMoney(o.total, o.currency) : null }))
    events.push(ev(`ordc:${o.id}`, o.closedAt, `Orden ${o.number ?? ''} cerrada`.replace(/\s+/g, ' '), { ...ref, tone: 'done' }))
    events.push(ev(`ordx:${o.id}`, o.cancelledAt, `Orden ${o.number ?? ''} cancelada`.replace(/\s+/g, ' '), { ...ref, tone: 'danger' }))
  }
  for (const r of c.receipts ?? []) {
    const order = orders.get(r.orderId)
    events.push(ev(`rec:${r.id}`, r.receivedAt ?? r.createdAt, `Recepción ${r.number ?? ''}`.trim(), { kind: 'receipts', docId: r.id, tone: 'done', detail: order?.number ? `De la orden ${order.number}` : null }))
  }
  for (const i of c.invoices ?? []) {
    events.push(ev(`inv:${i.id}`, i.createdAt, `Factura ${i.number ?? ''} registrada`.replace(/\s+/g, ' '), { kind: 'invoices', docId: i.id, detail: i.total != null ? formatMoney(i.total, i.currency) : null, tone: i.status === 'CANCELLED' ? 'danger' : 'neutral' }))
  }
  for (const p of c.payments ?? []) {
    const invoice = invoices.get(p.invoiceId)
    const amount = formatMoney(Math.abs(Number(p.amount)), p.currency)
    const title = p.kind === 'REVERSAL' ? `Reverso de pago ${amount}` : p.kind === 'OPENING' ? `Pagado histórico ${amount}` : `Pago ${amount}`
    events.push(ev(`pay:${p.id}`, p.recordedAt, `${title}${invoice?.number ? ` · ${invoice.number}` : ''}`, {
      kind: 'invoices', docId: p.invoiceId, tone: p.kind === 'REVERSAL' ? 'warning' : 'done', detail: p.reason ? `Motivo: ${p.reason}` : null,
    }))
  }
  if (c.status === 'CLOSED') events.push(ev(`casec:${c.id}`, c.closedAt, 'Expediente cerrado', { tone: 'done' }))
  if (c.status === 'CANCELLED') events.push(ev(`casex:${c.id}`, c.closedAt ?? c.updatedAt, 'Expediente cancelado', { tone: 'danger' }))
  return events.filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))
}

// An order's receipts and their reversals, newest first.
export function receiptMovements(order = {}) {
  const lines = new Map((order.lines ?? []).map((l) => [l.id, l]))
  const receipts = new Map((order.receipts ?? []).map((r) => [r.id, r]))
  const events = (order.receipts ?? []).map((r) => ev(`rec:${r.id}`, r.receivedAt ?? r.createdAt, `Recepción ${r.number ?? ''}`.trim(), {
    kind: 'receipts', docId: r.id, tone: 'done',
    detail: (r.lines ?? []).map((l) => `${lines.get(l.orderLineId)?.description ?? 'Partida'}: ${withUnit(l.quantity, lines.get(l.orderLineId)?.unit)}`).join(' · ') || null,
  }))
  for (const v of order.receiptReversals ?? []) {
    const receipt = receipts.get(v.receiptId)
    events.push(ev(`rev:${v.id}`, v.createdAt ?? v.reversedAt, `Reverso de ${receipt?.number ?? 'una recepción'}`, {
      kind: 'receipts', docId: v.receiptId, tone: 'warning',
      detail: [v.reason ? `Motivo: ${v.reason}` : null, (v.lines ?? []).map((l) => `${lines.get(l.orderLineId)?.description ?? 'Partida'}: ${withUnit(l.quantity, lines.get(l.orderLineId)?.unit)}`).join(' · ')].filter(Boolean).join(' · ') || null,
    }))
  }
  return events.filter(Boolean).sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id))
}
