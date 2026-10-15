// Deep link into the custody list that opens the "Nuevo resguardo" sheet
// prefilled (used by the item panel: Asignar -> DELIVERY, Devolver -> RETURN).
export const CUSTODY_LIST_PATH = '/app/m/runly.inventory/inventory/custodies'

export function buildNewCustodyPath({ kind = 'DELIVERY', employeeId = '', itemIds = [] } = {}) {
  const params = new URLSearchParams({ new: '1', kind })
  if (employeeId) params.set('employee', employeeId)
  const ids = itemIds.filter(Boolean)
  if (ids.length) params.set('items', ids.join(','))
  return `${CUSTODY_LIST_PATH}?${params.toString()}`
}

// Returns the sheet defaults when the URL asks for a new custody, else null.
export function parseNewCustodyParams(searchParams) {
  if (searchParams.get('new') !== '1') return null
  const kind = searchParams.get('kind') === 'RETURN' ? 'RETURN' : 'DELIVERY'
  return {
    kind,
    employeeId: searchParams.get('employee') ?? '',
    itemIds: (searchParams.get('items') ?? '').split(',').filter(Boolean),
  }
}
