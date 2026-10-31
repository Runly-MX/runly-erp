// Option label of a purchase document in the inventory item form pickers:
// "number · supplier".
export function documentOptionLabel(doc) {
  // Documentary references are known by their reference, not the internal folio.
  const number = doc?.reference ?? doc?.number ?? 'Sin folio'
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

// Documents seen by the two pickers, shared so that filling the order from the
// chosen invoice can show its label without another request.
export const purchaseDocCache = { order: new Map(), invoice: new Map() }

// An order has many invoices, an invoice belongs to one order. Decides what the
// item form does after the order or the invoice changes. `invoice.order` is
// undefined when unknown (never ask), null when the invoice has no order yet.
//   fill-order -> the invoice already belongs to `order`: use that one
//   ask-relate -> both chosen but unrelated: offer to relate them
export function planPurchaseLinkRule({ invoice, orderId }) {
  if (!invoice || invoice.order === undefined) return { type: 'none' }
  if (invoice.order) return invoice.order.id === orderId ? { type: 'none' } : { type: 'fill-order', order: invoice.order }
  return orderId ? { type: 'ask-relate' } : { type: 'none' }
}
