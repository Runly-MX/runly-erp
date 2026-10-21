// fetch used by the shared RunlyTable inside the supplier portal. Guests are not Runly users: requests
// carry `Authorization: Guest <session>` instead of the Bearer the renderer builds, and the per-user
// table-preferences calls (no guest equivalent) are answered locally so the table uses its defaults.
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

// onUnauthorized() renews the session and resolves the new token (or null): the request is retried once with it.
export function createGuestTableTransport({ sessionToken, onUnauthorized = null, onExpire = null, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  const send = (url, init, token) => fetchImpl(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Guest ${token}` } })
  return {
    fetch: async (url, init = {}) => {
      if (String(url).includes('/profile/me/table-preferences/')) return json({ data: null })
      const response = await send(url, init, sessionToken)
      if (response.status !== 401) return response
      const next = onUnauthorized ? await onUnauthorized() : null
      if (next) return send(url, init, next)
      onExpire?.({ code: 'SESSION_INVALID' })
      return response
    },
  }
}
