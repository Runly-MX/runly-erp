// Plain-fetch client for /public/attendance/kiosk/:link/*. No SDK, no session.
import { getApiUrl } from '../../../../lib/runtimeConfig.js'

export class KioskApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function call(path, { method = 'GET', headers = {}, body, form } = {}) {
  let response
  try {
    response = await fetch(`${getApiUrl()}/public/attendance/${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new KioskApiError('Sin conexión', 0, 'NETWORK')
  }
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new KioskApiError(json.error ?? 'Error del servidor', response.status, json.code ?? null)
  return json.data
}

const base = (link) => `kiosk/${encodeURIComponent(link)}`
const auth = (token) => ({ Authorization: `Kiosk ${token}` })

export const kioskApi = {
  info: (link) => call(base(link)),
  requestPair: (link, label) => call(`${base(link)}/pair`, { method: 'POST', body: { label } }),
  pairStatus: (link, secret) => call(`${base(link)}/pair-status`, { headers: { 'x-pair-secret': secret } }),
  roster: (link, token) => call(`${base(link)}/roster`, { headers: auth(token) }),
  recent: (link, token, since) => call(`${base(link)}/recent?since=${encodeURIComponent(since)}`, { headers: auth(token) }),
  sync: (link, token, punches) => call(`${base(link)}/sync`, { method: 'POST', headers: auth(token), body: { deviceNow: new Date().toISOString(), punches } }),
  // Multipart evidence photo for a punch that is already on the server.
  uploadSelfie: (link, token, punchId, blob) => {
    const form = new FormData()
    form.append('file', blob, 'selfie.jpg')
    return call(`${base(link)}/punches/${encodeURIComponent(punchId)}/selfie`, { method: 'POST', headers: auth(token), form })
  },
  enroll: (payload) => call('enroll', { method: 'POST', body: payload }),
}
