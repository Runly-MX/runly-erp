// Client-side column sorting for the ledger register. Cycle per column:
// asc -> desc -> unsorted (natural register order, which is what the running
// balance and drag-to-reorder depend on).

export function nextSort(sort, key) {
  if (sort?.key !== key) return { key, dir: 'asc' }
  if (sort.dir === 'asc') return { key, dir: 'desc' }
  return null
}

function flattenCategories(categories, map = new Map()) {
  for (const category of categories ?? []) {
    map.set(String(category.id), category.name ?? '')
    flattenCategories(category.children, map)
  }
  return map
}

const NUMERIC = new Set(['consecutive', 'deposito', 'retiro', 'saldo'])
const TEXT_OPTS = { numeric: true, sensitivity: 'base' }

export function sortRows(rows, sort, { types = [], categories = [] } = {}) {
  if (!sort) return rows
  const typeCode = new Map(types.map((t) => [String(t.id), t.code ?? '']))
  const categoryName = flattenCategories(categories)

  const valueOf = (row) => {
    switch (sort.key) {
      case 'consecutive': return Number(row.consecutive ?? 0)
      case 'deposito': return Number(row.deposito ?? 0)
      case 'retiro': return Number(row.retiro ?? 0)
      case 'saldo': return Number(row.saldo_actual ?? 0)
      case 'fecha': return String(row.fecha ?? '').slice(0, 10)
      case 'tipo': return typeCode.get(String(row.tipo_id ?? '')) ?? ''
      case 'categoria': return categoryName.get(String(row.category_id ?? '')) ?? ''
      default: return String(row[sort.key] ?? '')
    }
  }

  const factor = sort.dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const va = valueOf(a)
    const vb = valueOf(b)
    const cmp = NUMERIC.has(sort.key) ? va - vb : String(va).localeCompare(String(vb), 'es', TEXT_OPTS)
    return cmp * factor
  })
}
