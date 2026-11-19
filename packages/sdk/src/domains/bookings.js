// runly.bookings (/bookings/*). Every call is online only: a reservation is
// confirmed by the server's transaction, never replayed later from an offline queue.
const id = (value) => encodeURIComponent(value)

export function createBookingsDomain({ request, requestBlob, withAuthHeaders, toQueryString }) {
  const send = (method, path, data, token, idempotencyKey) => request(path, {
    method,
    onlineOnly: true,
    headers: { ...withAuthHeaders(token), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const space = (spaceId) => `/bookings/spaces/${id(spaceId)}`
  return {
    me: (token) => send('GET', '/bookings/me', undefined, token),
    // Spaces, members
    listSpaces: (token) => send('GET', '/bookings/spaces', undefined, token),
    createSpace: (data, token) => send('POST', '/bookings/spaces', data, token),
    getSpace: (spaceId, token) => send('GET', space(spaceId), undefined, token),
    updateSpace: (spaceId, data, token) => send('PATCH', space(spaceId), data, token),
    getSummary: (spaceId, token) => send('GET', `${space(spaceId)}/summary`, undefined, token),
    listMembers: (spaceId, token) => send('GET', `${space(spaceId)}/members`, undefined, token),
    setMember: (spaceId, userId, role, token) => send('PUT', `${space(spaceId)}/members/${id(userId)}`, { role }, token),
    removeMember: (spaceId, userId, token) => send('DELETE', `${space(spaceId)}/members/${id(userId)}`, undefined, token),
    // Resources
    listResources: (token) => send('GET', '/bookings/resources', undefined, token),
    createResource: (data, token) => send('POST', '/bookings/resources', data, token),
    updateResource: (resourceId, data, token) => send('PATCH', `/bookings/resources/${id(resourceId)}`, data, token),
    getResourceSchedule: (resourceId, token) => send('GET', `/bookings/resources/${id(resourceId)}/schedule`, undefined, token),
    setResourceSchedule: (resourceId, rules, token) => send('PUT', `/bookings/resources/${id(resourceId)}/schedule`, { rules }, token),
    listSpaceResources: (spaceId, token) => send('GET', `${space(spaceId)}/resources`, undefined, token),
    setSpaceResources: (spaceId, resourceIds, token) => send('PUT', `${space(spaceId)}/resources`, { resourceIds }, token),
    // Services, hours, exceptions, sessions
    listServices: (spaceId, token) => send('GET', `${space(spaceId)}/services`, undefined, token),
    createService: (spaceId, data, token) => send('POST', `${space(spaceId)}/services`, data, token),
    updateService: (serviceId, data, token) => send('PATCH', `/bookings/services/${id(serviceId)}`, data, token),
    listServiceResources: (serviceId, token) => send('GET', `/bookings/services/${id(serviceId)}/resources`, undefined, token),
    setServiceResources: (serviceId, resourceIds, token) => send('PUT', `/bookings/services/${id(serviceId)}/resources`, { resourceIds }, token),
    getSchedule: (spaceId, token) => send('GET', `${space(spaceId)}/schedule`, undefined, token),
    setSchedule: (spaceId, rules, token) => send('PUT', `${space(spaceId)}/schedule`, { rules }, token),
    listExceptions: (spaceId, query, token) => send('GET', `${space(spaceId)}/exceptions${toQueryString(query)}`, undefined, token),
    createException: (data, token) => send('POST', '/bookings/exceptions', data, token),
    deleteException: (exceptionId, token) => send('DELETE', `/bookings/exceptions/${id(exceptionId)}`, undefined, token),
    listSessions: (spaceId, query, token) => send('GET', `${space(spaceId)}/sessions${toQueryString(query)}`, undefined, token),
    createSession: (spaceId, data, token) => send('POST', `${space(spaceId)}/sessions`, data, token),
    cancelSession: (sessionId, token) => send('POST', `/bookings/sessions/${id(sessionId)}/cancel`, {}, token),
    availability: (spaceId, query, token) => send('GET', `${space(spaceId)}/availability${toQueryString(query)}`, undefined, token),
    // Reservations
    listReservations: (spaceId, query, token) => send('GET', `${space(spaceId)}/reservations${toQueryString(query)}`, undefined, token),
    exportReservations: (spaceId, query, token) => requestBlob(`${space(spaceId)}/reservations/export${toQueryString(query)}`, { headers: withAuthHeaders(token) }),
    createReservation: (spaceId, data, token, idempotencyKey) => send('POST', `${space(spaceId)}/reservations`, data, token, idempotencyKey),
    getReservation: (bookingId, token) => send('GET', `/bookings/reservations/${id(bookingId)}`, undefined, token),
    getHistory: (bookingId, token) => send('GET', `/bookings/reservations/${id(bookingId)}/history`, undefined, token),
    reschedule: (bookingId, data, token, idempotencyKey) => send('POST', `/bookings/reservations/${id(bookingId)}/reschedule`, data, token, idempotencyKey),
    // action: confirm | reject | cancel | complete | no-show
    transition: (bookingId, action, data, token, idempotencyKey) => send('POST', `/bookings/reservations/${id(bookingId)}/${action}`, data ?? {}, token, idempotencyKey),
  }
}
