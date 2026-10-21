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
    // Supplier (guest) invitations. -> { guest, link, code?, sent, mailError }
    listAreaGuests: (areaId, token) => send('GET', `/inventory/areas/${id(areaId)}/guests`, undefined, token),
    // { email, name?, role: viewer|editor, contactId?, requireCode? }
    inviteAreaGuest: (areaId, data, token) => send('POST', `/inventory/areas/${id(areaId)}/guests`, data, token),
    updateAreaGuest: (areaId, guestId, data, token) => send('PATCH', `/inventory/areas/${id(areaId)}/guests/${id(guestId)}`, data, token),
    removeAreaGuest: (areaId, guestId, token) => send('DELETE', `/inventory/areas/${id(areaId)}/guests/${id(guestId)}`, undefined, token),
    // Restricted duplicates: values or an access request for an item the caller cannot open, reviewed per field.
    submitChangeProposal: (data, token) => send('POST', '/inventory/change-proposals', data, token),
    listChangeProposals: (query, token) => send('GET', `/inventory/change-proposals${query?.status ? `?status=${encodeURIComponent(query.status)}` : ''}`, undefined, token),
    reviewChangeProposal: (proposalId, data, token) => send('POST', `/inventory/change-proposals/${id(proposalId)}/review`, data, token),
    rotateGuestCode: (guestId, data, token) => send('POST', `/inventory/guests/${id(guestId)}/rotate-code`, data ?? {}, token),
    resendGuestInvite: (guestId, data, token) => send('POST', `/inventory/guests/${id(guestId)}/resend`, data ?? {}, token),
    revokeGuest: (guestId, token) => send('POST', `/inventory/guests/${id(guestId)}/revoke`, {}, token),
    // areaId null = General -> { data: { moved } }
    moveItems: (itemIds, areaId, token) => send('POST', '/inventory/items/move', { itemIds, areaId: areaId ?? null }, token),
    getAreasSettings: (token) => send('GET', '/inventory/areas-settings', undefined, token),
    // -> { data: { enabled, affectedRoles? } }
    // patch: { enabled?, includeOwn? } (a bare boolean means { enabled }).
    setAreasSettings: (patch, token) => send('PUT', '/inventory/areas-settings', typeof patch === 'boolean' ? { enabled: patch } : patch, token),
  }
}
