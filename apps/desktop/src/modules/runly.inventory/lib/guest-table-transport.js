// fetch used by the shared RunlyTable inside the supplier portal. Guests are not Runly users: requests
// carry `Authorization: Guest <session>` instead of the Bearer the renderer builds, and the per-user
// table-preferences calls (no guest equivalent) are answered locally so the table uses its defaults.
const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

export function createGuestTableTransport({ sessionToken, onExpire = null, fetchImpl = (...args) => globalThis.fetch(...args) }) {
  return {
    fetch: async (url, init = {}) => {
      if (String(url).includes('/profile/me/table-preferences/')) return json({ data: null })
      const response = await fetchImpl(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Guest ${sessionToken}` } })
      if (response.status === 401) onExpire?.({ code: 'SESSION_INVALID' })
      return response
    },
  }
}
