// Match context for the Etiquetas asset picker. The search itself runs on the
// API (GET /inventory/items?search=, inventory-search-service); this only says
// which visible field matched when it is not the name or folio already shown.
const CONTEXT_FIELDS = [
  ['serialNumber', 'Serie'],
  ['assetTag', 'Activo'],
  ['partNumber', 'Parte'],
  ['modelName', 'Modelo'],
  ['model', 'Modelo'],
  ['brandName', 'Marca'],
  ['categoryName', 'Tipo'],
  ['locationName', 'Ubicación'],
  ['assignedToName', 'Asignado a'],
  ['purchaseInvoiceNumber', 'Factura'],
  ['purchaseOrderNumber', 'Orden de compra'],
  ['vendor', 'Proveedor'],
  ['invoiceNumber', 'Factura'],
  ['description', 'Descripción'],
  ['notes', 'Notas'],
]

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function assigneeName(item) {
  const a = item?.assignedTo
  return a ? [a.firstName, a.lastName].filter(Boolean).join(' ') : (item?.assignedToName ?? '')
}

// -> { label, value } for the first field (outside name/folio) that contains every
// search token, or null when the match is visible already or not on the row.
export function matchContext(item, term) {
  const tokens = fold(term).split(/\s+/).filter(Boolean)
  if (!item || !tokens.length) return null
  const hit = (value) => {
    const text = fold(value)
    return text && tokens.every((t) => text.includes(t))
  }
  if (hit(item.name) || hit(item.folio)) return null
  const row = { ...item, assignedToName: assigneeName(item) }
  for (const [key, label] of CONTEXT_FIELDS) {
    const value = row[key]
    if (value && typeof value !== 'object' && hit(value)) {
      const text = String(value)
      return { label, value: text.length > 60 ? `${text.slice(0, 59)}…` : text }
    }
  }
  return null
}
