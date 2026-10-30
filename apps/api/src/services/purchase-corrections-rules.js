// Which administrative fields of a REGISTERED order or invoice may be
// corrected, in which status and on which condition; and why the rest stay
// locked. Pure (no I/O). Drafts are edited with the normal editor instead.
// Spec: docs/superpowers/specs/2026-10-29-purchases-phase4-corrections.md §A.
import { PurchasesServiceError, asDate, cleanText, dateKey } from './purchases-shared.js'

const NOT_DRAFT_OR_CANCELLED = s => s !== 'DRAFT' && s !== 'CANCELLED'
const NOT_DRAFT = s => s !== 'DRAFT'

export const CORRECTABLE = {
  orders: {
    number: { label: 'Folio interno de la orden', type: 'text', max: 40, when: NOT_DRAFT_OR_CANCELLED, note: 'Debe ser único en la empresa. El proveedor puede conocer el folio anterior: avísale.' },
    supplierReference: { label: 'Referencia del proveedor', type: 'text', max: 100, when: NOT_DRAFT_OR_CANCELLED },
    notes: { label: 'Observaciones', type: 'textarea', max: 2000, when: NOT_DRAFT },
    expectedDate: { label: 'Fecha esperada de entrega', type: 'date', when: s => ['PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'PARTIALLY_RECEIVED'].includes(s), statusHint: 'solo mientras la orden espera entregas' },
    paymentTerms: { label: 'Condiciones de pago', type: 'text', max: 120, when: NOT_DRAFT_OR_CANCELLED, requires: 'noPayments', statusHint: 'solo si ninguna factura de la orden tiene pagos' },
  },
  invoices: {
    number: { label: 'Folio de la factura del proveedor', type: 'text', max: 100, when: NOT_DRAFT_OR_CANCELLED, note: 'Corrige un error de captura; debe coincidir con el comprobante del proveedor y ser único para ese proveedor.' },
    notes: { label: 'Observaciones', type: 'textarea', max: 2000, when: NOT_DRAFT },
    dueDate: { label: 'Fecha de vencimiento', type: 'date', when: s => ['PENDING_APPROVAL', 'PENDING', 'PARTIALLY_PAID'].includes(s), statusHint: 'solo mientras la factura tiene saldo' },
  },
}

// Locked after registration, with the correct procedure.
export const LOCKED = {
  supplierId: 'El proveedor no se corrige: cancela el documento y registra uno nuevo con el proveedor correcto.',
  currency: 'La moneda no se corrige: cambia los importes y las obligaciones; cancela y registra de nuevo.',
  lines: 'Las partidas y cantidades no se corrigen después del registro: afectan recepciones, inventario y pagos.',
  subtotal: 'Los importes no se corrigen después del registro.', tax: 'Los impuestos no se corrigen después del registro.', total: 'Los importes no se corrigen después del registro.',
  issueDate: 'La fecha de emisión no se corrige después del registro (afecta reportes del periodo).',
  fiscalUuid: 'El UUID fiscal (CFDI) no se corrige: identifica el comprobante emitido por el proveedor. Cancela la factura y registra el comprobante correcto.',
  status: 'El estado cambia con sus acciones (enviar, emitir, cerrar, cancelar), no con una corrección.',
  paidAmount: 'Los pagos se registran o reversan en la pestaña Pagos.', paidAt: 'Los pagos se registran o reversan en la pestaña Pagos.',
  paymentReference: 'Los pagos se registran o reversan en la pestaña Pagos.', paymentMethod: 'Los pagos se registran o reversan en la pestaña Pagos.',
}

const DATE_FIELDS = new Set(['expectedDate', 'dueDate'])
const valueOf = (doc, field) => (DATE_FIELDS.has(field) ? dateKey(doc[field]) : (doc[field] ?? null))

// { fields: [{ field, label, type, max, value, note }], locked: [{ field, reason }] }
// for the correction form of this document in its current status.
export function correctionPlan(kind, doc, context = {}) {
  const rules = CORRECTABLE[kind]
  if (!rules || !doc || doc.status === 'DRAFT') return { fields: [], locked: [], draft: doc?.status === 'DRAFT' }
  const fields = []
  const locked = []
  for (const [field, rule] of Object.entries(rules)) {
    const reason = blockedReason(rule, doc, context)
    if (reason) locked.push({ field, label: rule.label, reason })
    else fields.push({ field, label: rule.label, type: rule.type, max: rule.max ?? null, value: valueOf(doc, field), note: rule.note ?? null })
  }
  return { fields, locked, draft: false }
}

function blockedReason(rule, doc, context) {
  if (!rule.when(doc.status)) return `No se corrige en este estado${rule.statusHint ? ` (${rule.statusHint})` : ''}.`
  if (rule.requires === 'noPayments' && context.hasPayments) return 'Ya hay pagos registrados contra las facturas de esta orden.'
  return null
}

// Validates a corrections request against the plan. Returns
// { field: { before, after, data } } with only the fields that really change.
export function validateCorrection(kind, doc, changes, context = {}) {
  if (doc.status === 'DRAFT') throw new PurchasesServiceError('El documento está en borrador: usa "Editar borrador".', 409, 'INVALID_TRANSITION')
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length) {
    throw new PurchasesServiceError('Indica al menos un campo a corregir.', 400, 'VALIDATION')
  }
  const rules = CORRECTABLE[kind]
  const out = {}
  for (const [field, raw] of Object.entries(changes)) {
    const rule = rules?.[field]
    if (!rule) {
      throw new PurchasesServiceError(LOCKED[field] ?? `El campo «${field}» no se puede corregir.`, 422, 'FIELD_NOT_CORRECTABLE', { field })
    }
    const reason = blockedReason(rule, doc, context)
    if (reason) throw new PurchasesServiceError(`${rule.label}: ${reason}`, 409, 'FIELD_LOCKED_IN_STATUS', { field })
    let after
    if (rule.type === 'date') after = raw ? dateKey(asDate(raw)) : null
    else after = cleanText(raw, rule.max)
    if (field === 'number' && !after) throw new PurchasesServiceError('El folio no puede quedar vacío.', 400, 'VALIDATION', { field })
    const before = valueOf(doc, field)
    if ((before ?? null) === (after ?? null)) continue
    out[field] = { before, after, data: rule.type === 'date' ? (after ? asDate(after) : null) : after }
  }
  if (!Object.keys(out).length) throw new PurchasesServiceError('Los valores son iguales a los actuales: no hay nada que corregir.', 400, 'NO_CHANGES')
  return out
}
