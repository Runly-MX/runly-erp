// Option label of a purchase document in the inventory item form pickers:
// "number · supplier".
export function documentOptionLabel(doc) {
  const number = doc?.number ?? 'Sin folio'
  const supplier = doc?.supplierName
  return supplier ? `${number} · ${supplier}` : number
}

// Body for the quick-create call (POST /purchases/orders|invoices): only the
// folio is required; supplier and date are optional and omitted when empty.
export function quickCreatePayload({ number, supplierId, issueDate }) {
  const folio = String(number ?? '').trim()
  if (!folio) return null
  return {
    number: folio,
    ...(supplierId ? { supplierId } : {}),
    ...(issueDate ? { issueDate } : {}),
  }
}
