// "Siguiente paso" of an order or invoice, derived only from what the API
// already decided: the document status, its receipt state and pending lines,
// linked invoices, pending approvals, the policy check and the actions the
// user really has (lib/document-actions.js, which mirrors the API rules).
// Nothing here enables an action; `cta` only names one already offered.
//   tone: action | urgent | blocked | waiting | done | info
//   cta / secondary: action keys from getDocumentActions (or null)
//   items: short lines (pending goods, blocking reasons); links: [{ label, kind, id }]
import { formatDate, formatMoney } from './format.js'
import { withUnit } from './units.js'
import { isDocumentaryDoc, missingDocumentaryData } from './documentary.js'

const days = (from, to) => {
  if (!from || !to) return null
  const a = Date.parse(String(from).slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(String(to).slice(0, 10) + 'T00:00:00Z')
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((b - a) / 86400000)
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const step = (tone, title, detail = null, extra = {}) => ({ tone, title, detail, cta: null, secondary: null, blockedCta: null, items: [], links: [], ...extra })

function approvalStep(doc, offered, noun, today) {
  const pending = (doc.approvals ?? []).find((a) => a.status === 'PENDING')
  const waited = pending ? days(pending.createdAt, today) : null
  const since = waited == null ? '' : waited <= 0 ? ' Desde hoy.' : ` Espera desde hace ${plural(waited, 'día', 'días')}.`
  const reason = pending?.reason ? `${pending.reason}.` : 'La política de compras pide aprobación.'
  if (offered('approve')) return step('action', `Decidir la aprobación de ${noun}`, `${reason}${since}`, { cta: 'approve', secondary: offered('reject') ? 'reject' : null })
  return step('waiting', 'Espera aprobación', `${reason}${since} La decide quien tiene permiso de aprobar.`)
}

function blockedByPolicy(doc, action) {
  const check = doc.policyCheck
  return check?.blocked && check.action === action ? check.reasons ?? [] : null
}

// Where each blocking requirement is resolved (policyCheck.blocking from the API).
function resolveLinks(doc) {
  const links = []
  const add = (link) => { if (link.id && !links.some((l) => l.id === link.id)) links.push(link) }
  const order = (doc.orders ?? [])[0]
  for (const blocker of doc.policyCheck?.blocking ?? []) {
    if (blocker.stage === 'RECEIPT' && order) add({ label: `Recibir en ${order.label ?? order.number ?? 'la orden'}`, kind: 'orders', id: order.id })
    else if (['REQUEST', 'QUOTES', 'APPROVAL'].includes(blocker.stage) && doc.caseId) add({ label: `Expediente ${doc.case?.number ?? ''}`.trim(), kind: 'cases', id: doc.caseId })
  }
  return links
}

function orderStep(doc, offered, today) {
  const s = doc.status
  if (s === 'DRAFT') {
    return offered('submit')
      ? step('action', 'Enviar la orden', 'Al enviarla se revisa tu política de compras: puede pedir aprobación antes de emitirse.', { cta: 'submit' })
      : step('waiting', 'Borrador en captura', 'La envía quien tiene permiso para editar órdenes.')
  }
  if (s === 'PENDING_APPROVAL') return approvalStep(doc, offered, 'la orden', today)
  if (s === 'APPROVED') {
    const reasons = blockedByPolicy(doc, 'issue')
    if (reasons?.length) return step('blocked', 'Antes de emitir falta cumplir la política', null, { items: reasons, links: resolveLinks(doc), blockedCta: offered('issue') ? 'issue' : null })
    return offered('issue')
      ? step('action', 'Emitir al proveedor', 'Con la orden emitida se puede recibir la mercancía y registrar la factura.', { cta: 'issue' })
      : step('waiting', 'Lista para emitir', 'La emite quien tiene permiso para editar órdenes.')
  }
  if (s === 'CLOSED') {
    return doc.receipt?.state === 'CLOSED_SHORT'
      ? step('done', 'Cerrada con faltantes', `Se cerró sin recibir ${plural(doc.receipt.pendingLines?.length ?? 0, 'partida', 'partidas')}; el motivo queda en el historial.`)
      : step('done', 'Orden cerrada', 'Ya no espera entregas ni facturas.')
  }
  // Issued, partially received or received.
  const receipt = doc.receipt ?? {}
  if (['PENDING', 'PARTIAL'].includes(receipt.state)) {
    const byId = new Map((doc.lines ?? []).map((line) => [line.id, line]))
    const items = (receipt.pendingLines ?? []).map((p) => {
      const unit = byId.get(p.id)?.unit
      return `${withUnit(p.pending, unit)} de ${p.description ?? 'sin concepto'}`
    })
    const title = items.length === 1 ? `Recibir ${items[0]}` : `Recibir ${plural(items.length, 'partida pendiente', 'partidas pendientes')}`
    const closeHint = offered('close') ? 'Si ya no llegarán, usa "Cerrar con faltantes" e indica el motivo.' : null
    if (offered('receive')) return step('action', title, closeHint, { cta: 'receive', items: items.length > 1 ? items : [] })
    return step('waiting', title, ['La registra quien tiene permiso de recepciones.', closeHint].filter(Boolean).join(' '), { items: items.length > 1 ? items : [] })
  }
  const invoices = (doc.invoices ?? []).filter((invoice) => invoice.status !== 'CANCELLED')
  if (!invoices.length) {
    return offered('invoice')
      ? step('action', 'Registrar la factura', 'Queda ligada a esta orden; una orden puede tener varias facturas.', { cta: 'invoice' })
      : step('waiting', 'Sin factura todavía', 'La registra quien tiene permiso para capturar facturas.')
  }
  const open = invoices.filter((invoice) => invoice.status !== 'PAID')
  if (open.length) {
    const links = open.map((invoice) => ({ label: invoice.number ?? invoice.label ?? 'Factura', kind: 'invoices', id: invoice.id }))
    return step('waiting', open.length === 1 ? 'Factura pendiente de pago' : `${plural(open.length, 'factura pendiente', 'facturas pendientes')} de pago`,
      'El pago se registra en cada factura.', { links, secondary: offered('invoice') ? 'invoice' : null })
  }
  return offered('close')
    ? step('action', 'Cerrar la orden', 'Ya se recibió lo que aplica y sus facturas están pagadas.', { cta: 'close' })
    : step('done', 'Recibida y facturada', 'Sus facturas están pagadas.')
}

function invoiceStep(doc, offered, today) {
  const s = doc.status
  if (s === 'DRAFT') {
    return offered('submit')
      ? step('action', 'Registrar la factura', 'Al registrarla queda por pagar, o en aprobación si la política lo pide.', { cta: 'submit' })
      : step('waiting', 'Factura en captura', 'La registra quien tiene permiso para editar facturas.')
  }
  if (s === 'PENDING_APPROVAL') return approvalStep(doc, offered, 'la factura', today)
  if (s === 'PAID') return step('done', 'Pagada por completo', doc.paidAt ? `Último pago el ${formatDate(doc.paidAt)}.` : null)
  // Pending or partially paid.
  const reasons = blockedByPolicy(doc, 'pay')
  if (reasons?.length) {
    return step('blocked', 'Antes de pagar falta cumplir la política', 'El pago se habilita cuando se cumpla el requisito.', { items: reasons, links: resolveLinks(doc), blockedCta: offered('pay') ? 'pay' : null })
  }
  const balance = formatMoney(doc.balance ?? Math.max(0, Number(doc.total) - Number(doc.paidAmount ?? 0)), doc.currency)
  const due = days(today, doc.dueDate)
  const title = due == null ? `Pagar ${balance} (sin fecha de vencimiento)` : due < 0 ? `Pagar ${balance} · vencida hace ${plural(-due, 'día', 'días')}` : due === 0 ? `Pagar ${balance} hoy` : `Pagar ${balance} antes del ${formatDate(doc.dueDate)}`
  const detail = 'Puedes registrar un abono parcial. Los pagos no se editan: si uno está mal, se reversa con motivo.'
  if (offered('pay')) return step(due != null && due < 0 ? 'urgent' : 'action', title, detail, { cta: 'pay' })
  return step('waiting', title, 'Lo registra quien gestiona pagos; los pagos deben estar activos en tu flujo.')
}

// Cases: the API's closure check (purchase-case-closure.js) decides; manual
// close only where the workflow uses cases, otherwise they close by themselves.
const CLOSURE_KIND = { requests: 'requests', orders: 'orders', invoices: 'invoices', approvals: null }
function caseStep(doc, offered) {
  const closure = doc.closure ?? {}
  const reopen = offered('reopen') ? 'reopen' : null
  if (doc.status === 'CANCELLED') return step('info', 'Expediente cancelado', 'Sus documentos se conservan como historial.', { secondary: reopen })
  if (doc.status === 'CLOSED') return step('done', 'Expediente cerrado', doc.closedAt ? `Se cerró el ${formatDate(doc.closedAt)}.` : null, { secondary: reopen })
  const open = closure.openDocuments ?? []
  const links = open.filter((d) => CLOSURE_KIND[d.kind] && d.id).map((d) => ({ label: d.number ?? 'Documento', kind: CLOSURE_KIND[d.kind], id: d.id }))
  if (closure.automatic) {
    return step('info', 'Se cierra solo', open.length
      ? `En tu flujo el expediente se cierra cuando sus documentos quedan finales. Falta: ${open.map((d) => d.reason).join('; ')}.`
      : 'En tu flujo el expediente se cierra cuando sus documentos quedan finales.', { links })
  }
  if (open.length) return step('waiting', `Para cerrar ${open.length === 1 ? 'falta 1 documento' : `faltan ${open.length} documentos`}`, null, { items: open.map((d) => d.reason), links, blockedCta: offered('close') ? 'close' : null })
  if (closure.blockers?.length) return step('blocked', 'Antes de cerrar falta cumplir la política', null, { items: closure.blockers, links: resolveLinks(doc), blockedCta: offered('close') ? 'close' : null })
  if (!closure.ready) return step('info', 'Sin documentos todavía', 'Las solicitudes, órdenes y facturas de esta compra aparecerán aquí.')
  return offered('close')
    ? step('action', 'Cerrar el expediente', 'Todos sus documentos están finales y la política se cumple.', { cta: 'close' })
    : step('waiting', 'Listo para cerrar', 'Lo cierra quien gestiona expedientes.')
}

// Control documental: no amounts, payments or receipts; only what is still
// unknown (supplier, document date) and the documents it can be related to.
function documentaryStep(kind, doc, offered) {
  const noun = kind === 'orders' ? 'orden' : 'factura'
  const other = kind === 'orders' ? 'factura' : 'orden de compra'
  if (doc.status === 'CANCELLED') return step('info', 'Referencia cancelada', 'Se conserva como historial con sus relaciones y archivos.')
  const missing = missingDocumentaryData(doc)
  if (missing.length && offered('correct')) {
    return step('action', 'Completar la referencia', `Sin capturar: ${missing.map((m) => m.label).join(' y ')}. Son opcionales; complétalos cuando tengas el documento.`, { cta: 'correct', secondary: offered('relate') ? 'relate' : null })
  }
  return step('info', 'Referencia registrada', `Puedes adjuntar el documento original y relacionar esta ${noun} con Inventarios o con su ${other}. Nada de eso es obligatorio.`, { secondary: offered('relate') ? 'relate' : null })
}

export function nextStep(kind, doc, actions = [], { today } = {}) {
  if (!doc || !['orders', 'invoices', 'cases'].includes(kind)) return null
  if (isDocumentaryDoc(doc)) {
    if (doc.capabilityEnabled === false) return step('info', 'Solo lectura', 'Este tipo de documento está desactivado en tu flujo; se conserva como historial.')
    const keys = new Set(actions.map((action) => action.key))
    return documentaryStep(kind, doc, (key) => keys.has(key))
  }
  if (kind === 'cases') {
    const keys = new Set(actions.map((action) => action.key))
    return caseStep(doc, (key) => keys.has(key))
  }
  const noun = kind === 'orders' ? 'Orden' : 'Factura'
  if (doc.status === 'CANCELLED') {
    return step('info', `${noun} cancelada`, kind === 'orders' ? 'No espera entregas ni facturas; sus vínculos con activos quedan como historial.' : 'No cuenta en saldos ni pagos.')
  }
  if (doc.capabilityEnabled === false) {
    return step('info', 'Solo lectura', `${kind === 'orders' ? 'Las órdenes de compra' : 'Las facturas'} están desactivadas en tu flujo; este documento se conserva como historial.`)
  }
  const keys = new Set(actions.map((action) => action.key))
  const offered = (key) => keys.has(key)
  return kind === 'orders' ? orderStep(doc, offered, today) : invoiceStep(doc, offered, today)
}
