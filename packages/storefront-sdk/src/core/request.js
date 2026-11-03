import { StorefrontError } from '../storefront-error.js'

const STATUS_TO_CODE = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  422: 'VALIDATION_ERROR',
}

export function createRequestCore({ baseUrl, company, getSession, fetchFn = fetch }) {
  return async function _request(method, path, body = null, options = {}) {
    const session = getSession()
    const headers = {
      'X-Runly-Company': company,
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(options.headers ?? {}),
    }

    const isFormData = body instanceof FormData
    if (body && !isFormData) {
      headers['Content-Type'] = 'application/json'
    }

    let response
    try {
      response = await fetchFn(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
        ...(options.credentials ? { credentials: options.credentials } : {}),
        ...(options.mode ? { mode: options.mode } : {}),
        ...(options.cache ? { cache: options.cache } : {}),
      })
    } catch {
      throw new StorefrontError('No se pudo conectar con el servidor', 'NETWORK_ERROR', 0)
    }

    if (response.ok) {
      if (options.responseType === 'response') return response
      const text = await response.text()
      if (!text) return null
      try { return JSON.parse(text) } catch { return text }
    }

    let errorMessage = `Error ${response.status}`
    let details = null,serverCode=null
    try {
      const parsed = await response.json()
      serverCode=parsed?.code??parsed?.error?.code??null
      const err = parsed?.error
      errorMessage = typeof err === 'string' ? err : (err?.message ?? errorMessage)
      details = err?.details ?? parsed?.details ?? null
    } catch {}

    const code = STATUS_TO_CODE[response.status] ?? 'UNKNOWN'
    const error=new StorefrontError(errorMessage, code, response.status, details)
    if(serverCode)error.serverCode=serverCode
    throw error
  }
}
