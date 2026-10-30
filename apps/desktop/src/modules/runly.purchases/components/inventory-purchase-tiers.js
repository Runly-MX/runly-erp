// The inventory item's "Compras" section in three tiers (no information is
// dropped, only placed):
//   1. current documents (relations to documents that are not cancelled)
//   2. historical relations (to cancelled documents: the item became free)
//   3. inherited data (pre-Compras fields) and custom fields that look like
//      purchase data, compared with tier 1. Nothing here edits, hides or
//      migrates a field: unifying them needs a census and approval first.

const TYPE_ORDER = ['purchase_case', 'purchase_request', 'purchase_order', 'purchase_receipt', 'purchase_invoice']

// Summary timeline (GET /purchases/inventory/:id/summary) -> unique documents.
export function splitPurchaseDocs(timeline = []) {
  const seen = new Map()
  for (const stage of timeline) for (const doc of stage?.docs ?? []) if (doc?.id && !seen.has(doc.id)) seen.set(doc.id, doc)
  const rank = (doc) => { const i = TYPE_ORDER.indexOf(doc.type); return i === -1 ? TYPE_ORDER.length : i }
  const docs = [...seen.values()].sort((a, b) => rank(a) - rank(b))
  return { current: docs.filter((d) => d.status !== 'CANCELLED'), historical: docs.filter((d) => d.status === 'CANCELLED') }
}

// Pre-Compras purchase fields of the item (read-only inventory data).
export function legacyPurchaseData(item = {}) {
  return [
    item.purchaseDate && { key: 'purchaseDate', label: 'Fecha de compra', value: String(item.purchaseDate).slice(0, 10), kind: 'date' },
    item.purchasePrice != null && { key: 'purchasePrice', label: 'Precio de compra', value: item.purchasePrice, kind: 'money' },
    item.vendorName && { key: 'vendorName', label: 'Proveedor', value: item.vendorName, kind: 'text' },
    item.invoiceNumber && { key: 'invoiceNumber', label: 'Número de factura', value: item.invoiceNumber, kind: 'text' },
  ].filter(Boolean)
}

const norm = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
// Label patterns of custom fields that duplicate what Compras records.
const CONCEPTS = [
  { concept: 'order', pattern: /\b(orden de compra|oc|po|purchase order)\b/ },
  { concept: 'invoice', pattern: /\b(factura|invoice|folio fiscal|uuid|cfdi)\b/ },
  { concept: 'supplier', pattern: /\b(proveedor|vendedor|vendor|supplier)\b/ },
  { concept: 'date', pattern: /\bfecha de (compra|adquisicion)\b/ },
  { concept: 'price', pattern: /\b(precio|costo|importe) de (compra|adquisicion)\b|\bcosto\b/ },
]

// Custom values whose label looks like purchase data, and whether their value
// matches the current documents or the inherited fields.
export function possibleDuplicates(customValues = [], current = [], legacy = []) {
  const numbers = (type) => current.filter((d) => d.type === type).map((d) => norm(d.number))
  const suppliers = current.map((d) => norm(d.supplierName)).filter(Boolean)
  const legacyValue = (key) => norm(legacy.find((l) => l.key === key)?.value)
  return customValues
    .filter((cv) => cv?.field && cv.value != null && String(cv.value).trim() !== '')
    .map((cv) => {
      const label = norm(cv.field.label)
      const hit = CONCEPTS.find((c) => c.pattern.test(label))
      if (!hit) return null
      const value = norm(cv.value)
      const same = {
        order: numbers('purchase_order').includes(value),
        invoice: numbers('purchase_invoice').includes(value) || legacyValue('invoiceNumber') === value,
        supplier: suppliers.includes(value) || legacyValue('vendorName') === value,
        date: legacyValue('purchaseDate') === value.slice(0, 10),
        price: legacyValue('purchasePrice') !== '' && Number(legacyValue('purchasePrice')) === Number(value),
      }[hit.concept]
      return { id: cv.fieldId ?? cv.field.id, label: cv.field.label, value: cv.value, concept: hit.concept, matches: Boolean(same) }
    })
    .filter(Boolean)
}
