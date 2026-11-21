// runly.ticketing (/ticketing/*). Online only: issuing, confirming and cancelling are
// decided by the server's transaction, never replayed later from an offline queue.
const id = (value) => encodeURIComponent(value)

export function createTicketingDomain({ request, withAuthHeaders, toQueryString }) {
  const send = (method, path, data, token, idempotencyKey) => request(path, {
    method,
    onlineOnly: true,
    headers: { ...withAuthHeaders(token), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const event = (eventId) => `/ticketing/events/${id(eventId)}`
  const order = (orderId) => `/ticketing/orders/${id(orderId)}`
  return {
    listEvents: (token) => send('GET', '/ticketing/events', undefined, token),
    createEvent: (data, token) => send('POST', '/ticketing/events', data, token),
    getEvent: (eventId, token) => send('GET', event(eventId), undefined, token),
    updateEvent: (eventId, data, token) => send('PATCH', event(eventId), data, token),
    createSession: (eventId, data, token) => send('POST', `${event(eventId)}/sessions`, data, token),
    createType: (eventId, data, token) => send('POST', `${event(eventId)}/types`, data, token),
    updateType: (typeId, data, token) => send('PATCH', `/ticketing/types/${id(typeId)}`, data, token),
    setQuota: (typeId, sessionId, quota, token) => send('PUT', `/ticketing/types/${id(typeId)}/quotas/${id(sessionId)}`, { quota }, token),
    listMembers: (eventId, token) => send('GET', `${event(eventId)}/members`, undefined, token),
    setMember: (eventId, userId, role, token) => send('PUT', `${event(eventId)}/members/${id(userId)}`, { role }, token),
    removeMember: (eventId, userId, token) => send('DELETE', `${event(eventId)}/members/${id(userId)}`, undefined, token),
    listOrders: (eventId, query, token) => send('GET', `${event(eventId)}/orders${toQueryString(query)}`, undefined, token),
    createOrder: (data, token, idempotencyKey) => send('POST', '/ticketing/orders', data, token, idempotencyKey),
    getOrder: (orderId, token) => send('GET', order(orderId), undefined, token),
    orderHistory: (orderId, token) => send('GET', `${order(orderId)}/history`, undefined, token),
    orderSale: (orderId, token) => send('GET', `${order(orderId)}/sale`, undefined, token),
    paymentCandidates: (orderId, token) => send('GET', `${order(orderId)}/payment-candidates`, undefined, token),
    confirmPayment: (orderId, posOrderId, token, idempotencyKey) => send('POST', `${order(orderId)}/confirm-payment`, { posOrderId }, token, idempotencyKey),
    cancelOrder: (orderId, data, token, idempotencyKey) => send('POST', `${order(orderId)}/cancel`, data, token, idempotencyKey),
    reissue: (ticketId, token, idempotencyKey) => send('POST', `/ticketing/tickets/${id(ticketId)}/reissue`, {}, token, idempotencyKey),
    transfer: (ticketId, data, token, idempotencyKey) => send('POST', `/ticketing/tickets/${id(ticketId)}/transfer`, data, token, idempotencyKey),
  }
}
