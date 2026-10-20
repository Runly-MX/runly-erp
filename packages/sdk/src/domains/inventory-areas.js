// runly.inventory areas (nested folders) and per-user area membership
// (spec 2026-10-20-inventory-areas-scoping). Raw `{ data }` responses are returned.
const id = (value) => encodeURIComponent(value)

export function createInventoryAreasDomain({ request, withAuthHeaders }) {
  const send = (method, path, data, token) => request(path, {
    method,
    headers: withAuthHeaders(token, data === undefined ? {} : { 'Content-Type': 'application/json' }),
    onlineOnly: method !== 'GET',
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  return {
    // [{ id, parentId, name, memberCount, itemCount, role }] visible to the caller.
    listAreas: (token) => send('GET', '/inventory/areas', undefined, token),
    createArea: (data, token) => send('POST', '/inventory/areas', data, token),
    // { name?, parentId? } - parentId null moves the area to the root.
    updateArea: (areaId, data, token) => send('PATCH', `/inventory/areas/${id(areaId)}`, data, token),
    // Soft delete: its items go back to General.
    deleteArea: (areaId, token) => send('DELETE', `/inventory/areas/${id(areaId)}`, undefined, token),
    listAreaMembers: (areaId, token) => send('GET', `/inventory/areas/${id(areaId)}/members`, undefined, token),
    // role: viewer | editor | manager
    setAreaMember: (areaId, userId, role, token) => send('PUT', `/inventory/areas/${id(areaId)}/members/${id(userId)}`, { role }, token),
    removeAreaMember: (areaId, userId, token) => send('DELETE', `/inventory/areas/${id(areaId)}/members/${id(userId)}`, undefined, token),
    // areaId null = General -> { data: { moved } }
    moveItems: (itemIds, areaId, token) => send('POST', '/inventory/items/move', { itemIds, areaId: areaId ?? null }, token),
    getAreasSettings: (token) => send('GET', '/inventory/areas-settings', undefined, token),
    // -> { data: { enabled, affectedRoles? } }
    // patch: { enabled?, includeOwn? } (a bare boolean means { enabled }).
    setAreasSettings: (patch, token) => send('PUT', '/inventory/areas-settings', typeof patch === 'boolean' ? { enabled: patch } : patch, token),
  }
}
