// Print queue for the Etiquetas screen: pure reducer, quantity rules, label
// state text and the deep link that preloads items. Mirrors the API limits in
// apps/api/src/services/inventory-labels/layout.js (MAX_QUANTITY, MAX_LABELS_PER_RENDER).
export const LABELS_PATH = '/app/m/runly.inventory/inventory/labels'
export const MAX_QUANTITY = 500
export const MAX_LABELS = 1000
// MAX_QUEUE_ITEMS caps the ?items= deep link (URL length); the studio selection
// itself goes up to MAX_SELECTION items (still at most MAX_LABELS per render).
export const MAX_QUEUE_ITEMS = 200
export const MAX_SELECTION = 1000

export function clampQuantity(value) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, MAX_QUANTITY)
}

// Keeps only the fields the queue shows and the label preview prints; label stats stay undefined when the
// source row did not carry them (the screen fills them from the item history).
export function toQueueRow(item, quantity = 1) {
  return {
    id: item.id,
    name: item.name ?? null,
    folio: item.folio ?? null,
    assetTag: item.assetTag ?? null,
    serialNumber: item.serialNumber ?? null,
    categoryName: item.categoryName ?? null,
    locationName: item.locationName ?? null,
    // Printed by some label fields (client preview); absent when the source did not carry them.
    model: item.model ?? item.modelName ?? null,
    brandName: item.brandName ?? item.brand?.name ?? null,
    assigneeName: item.assigneeName ?? null,
    coverImageFileId: item.coverImageFileId ?? null,
    labelPrintCount: item.labelPrintCount,
    labelPrintedAt: item.labelPrintedAt,
    // Rows reloaded from the print log are known to be labeled before their stats load.
    knownLabeled: Boolean(item.knownLabeled),
    quantity: clampQuantity(quantity),
  }
}

export function queueReducer(state, action) {
  switch (action.type) {
    case 'add': {
      const known = new Set(state.map((row) => row.id))
      const room = MAX_SELECTION - state.length
      const added = action.items.filter((item) => item?.id && !known.has(item.id) && known.add(item.id)).slice(0, Math.max(0, room))
      return added.length ? [...state, ...added.map((item) => toQueueRow(item, action.quantity ?? 1))] : state
    }
    case 'remove':
      return state.filter((row) => row.id !== action.id)
    case 'toggle':
      return state.some((row) => row.id === action.item.id)
        ? state.filter((row) => row.id !== action.item.id)
        : queueReducer(state, { type: 'add', items: [action.item], quantity: action.quantity })
    case 'removeMany': {
      const drop = new Set(action.ids)
      return state.filter((row) => !drop.has(row.id))
    }
    // Reprint: the selection becomes exactly these items with their quantities.
    case 'replace': {
      const seen = new Set()
      return action.items
        .filter((item) => item?.id && !seen.has(item.id) && seen.add(item.id))
        .slice(0, MAX_SELECTION)
        .map((item) => toQueueRow(item, item.quantity ?? 1))
    }
    case 'quantity':
      return state.map((row) => (row.id === action.id ? { ...row, quantity: clampQuantity(action.quantity) } : row))
    case 'applyAll': {
      const quantity = clampQuantity(action.quantity)
      return state.map((row) => ({ ...row, quantity }))
    }
    // Merges label stats ({ [id]: { labelPrintCount, labelPrintedAt } }) without touching quantities.
    case 'stats':
      return state.map((row) => (action.stats[row.id] ? { ...row, ...action.stats[row.id] } : row))
    case 'clear':
      return []
    default:
      return state
  }
}

export const totalLabels = (rows) => rows.reduce((sum, row) => sum + clampQuantity(row.quantity), 0)

export const toRenderItems = (rows) => rows.map((row) => ({ itemId: row.id, quantity: clampQuantity(row.quantity) }))

export const labeledRows = (rows) => rows.filter((row) => Number(row.labelPrintCount) > 0 || row.knownLabeled)

// Stats after a logged print of these rows (count + 1, printed now).
export function statsAfterPrint(rows, now = new Date()) {
  return Object.fromEntries(rows.map((row) => [row.id, { labelPrintCount: (Number(row.labelPrintCount) || 0) + 1, labelPrintedAt: now.toISOString() }]))
}

const formatDay = (value) => new Date(value).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

// { labeled, text } for a row or item ({ labelPrintCount, labelPrintedAt }); null while unknown.
export function labelState({ labelPrintCount, labelPrintedAt } = {}) {
  if (labelPrintCount === undefined || labelPrintCount === null) return null
  const count = Number(labelPrintCount) || 0
  if (!count) return { labeled: false, text: 'Sin etiquetar' }
  const times = count === 1 ? '1 vez' : `${count} veces`
  return { labeled: true, text: `Etiquetada ${times}`, detail: labelPrintedAt ? `Última: ${formatDay(labelPrintedAt)}` : '' }
}

// History rows (GET /inventory/items/:id/labels, newest first) -> label stats.
export function statsFromHistory(history = []) {
  return { labelPrintCount: history.length, labelPrintedAt: history[0]?.printedAt ?? null }
}

export function buildLabelsPath({ itemIds = [], quantity } = {}) {
  const ids = itemIds.filter(Boolean)
  if (!ids.length) return LABELS_PATH
  const params = new URLSearchParams({ items: ids.slice(0, MAX_QUEUE_ITEMS).join(',') })
  if (quantity && clampQuantity(quantity) > 1) params.set('qty', String(clampQuantity(quantity)))
  return `${LABELS_PATH}?${params.toString()}`
}

export function parseLabelsParams(searchParams) {
  const itemIds = [...new Set((searchParams.get('items') ?? '').split(',').map((id) => id.trim()).filter(Boolean))].slice(0, MAX_QUEUE_ITEMS)
  return { itemIds, quantity: clampQuantity(searchParams.get('qty') ?? 1) }
}
