// Small fetch client for the supplier portal. Guests are not Runly users, so this
// bypasses the SDK client (no Bearer / company headers) and sends
// `Authorization: Guest <sessionToken>` instead.
import { getApiUrl } from '../../../lib/runtimeConfig.js'

export class GuestApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message)
    this.name = 'GuestApiError'
    this.status = status
    this.code = code
  }
}

async function call(method, path, { sessionToken, body, form, query, blob } = {}) {
  const qs = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : ''
  const headers = {}
  if (sessionToken) headers.Authorization = `Guest ${sessionToken}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(`${getApiUrl()}${path}${qs ? `?${qs}` : ''}`, {
      method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  } catch {
    throw new GuestApiError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.', { code: 'NETWORK' })
  }
  if (blob && res.ok) return res.blob()
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new GuestApiError(payload?.error ?? 'Ocurrió un error. Intenta de nuevo.', { status: res.status, code: payload?.code ?? null })
  return payload
}

const unwrap = (p) => p?.data ?? p
const id = encodeURIComponent

export const guestApi = {
  startSession: (token, code) => call('POST', '/public/inventory/guest/session', { body: { token, ...(code ? { code } : {}) } }).then(unwrap),
  me: (s) => call('GET', '/inventory/guest/me', { sessionToken: s }).then(unwrap),
  refresh: (s) => call('POST', '/inventory/guest/session/refresh', { sessionToken: s }).then(unwrap),
  logout: (s) => call('POST', '/inventory/guest/session/logout', { sessionToken: s }).then(unwrap),
  catalogs: (s) => call('GET', '/inventory/guest/catalogs', { sessionToken: s }).then(unwrap),
  // Returns the full { data, pagination } payload.
  listItems: (s, query) => call('GET', '/inventory/guest/items', { sessionToken: s, query }),
  getItem: (s, itemId) => call('GET', `/inventory/guest/items/${id(itemId)}`, { sessionToken: s }).then(unwrap),
  createItem: (s, body) => call('POST', '/inventory/guest/items', { sessionToken: s, body }).then(unwrap),
  updateItem: (s, itemId, body) => call('PATCH', `/inventory/guest/items/${id(itemId)}`, { sessionToken: s, body }).then(unwrap),
  // Suppliers only PROPOSE a baja; the team approves or rejects it. Never deletes.
  proposeDeregistration: (s, itemId, reason) => call('POST', `/inventory/guest/items/${id(itemId)}/propose-deregistration`, { sessionToken: s, body: { reason } }).then(unwrap),
  listFiles: (s, itemId) => call('GET', `/inventory/guest/items/${id(itemId)}/files`, { sessionToken: s }).then(unwrap),
  uploadFile: (s, itemId, file, label) => {
    const form = new FormData()
    form.append('file', file)
    if (label) form.append('label', label)
    return call('POST', `/inventory/guest/items/${id(itemId)}/files`, { sessionToken: s, form }).then(unwrap)
  },
  deleteFile: (s, itemId, docId) => call('DELETE', `/inventory/guest/items/${id(itemId)}/files/${id(docId)}`, { sessionToken: s }).then(unwrap),
  // Catalog for the model selector and "+ Crear" options (creating needs the canCreateModels capability).
  models: (s, query) => call('GET', '/inventory/guest/models', { sessionToken: s, query }).then(unwrap),
  createModel: (s, body) => call('POST', '/inventory/guest/models', { sessionToken: s, body }).then(unwrap),
  createEntry: (s, kind, body) => call('POST', `/inventory/guest/${kind}`, { sessionToken: s, body }).then(unwrap),
  // Values or an access request for an item the supplier cannot open (restricted duplicate).
  submitProposal: (s, body) => call('POST', '/inventory/guest/change-proposals', { sessionToken: s, body }).then(unwrap),
  checkIdentifiers: (s, query) => call('GET', '/inventory/guest/items/check-identifiers', { sessionToken: s, query }).then(unwrap),
  // Excel import (needs the canImport capability). Same shapes as the main /inventory/item-import/*.
  importTemplate: (s) => call('GET', '/inventory/guest/item-import/template', { sessionToken: s, blob: true }),
  importCall: (s, path, body) => call('POST', `/inventory/guest/item-import${path}`, body instanceof FormData ? { sessionToken: s, form: body } : { sessionToken: s, body }).then(unwrap),
}
