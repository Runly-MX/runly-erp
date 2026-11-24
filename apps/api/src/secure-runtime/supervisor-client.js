// API-side client of the execution supervisor (apps/supervisor). The API has
// no Docker access: it can only ask the supervisor to run a closed job
// contract, signed with a shared secret (HMAC-SHA256 over method, path,
// timestamp, nonce and body) so requests cannot be forged or replayed.
import { createHmac, randomUUID } from 'node:crypto'

export function signSupervisorRequest({ secret, method, path, body, timestamp = Date.now(), nonce = randomUUID() }) {
  const signature = createHmac('sha256', secret).update(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}`).digest('base64url')
  return { 'x-runly-timestamp': String(timestamp), 'x-runly-nonce': nonce, 'x-runly-signature': signature }
}

export function createSupervisorClient({ url, secret, timeoutMs = 30_000 }) {
  if (!url || typeof secret !== 'string' || secret.length < 32) return null
  async function send(method, path, payload) {
    const body = payload ? JSON.stringify(payload) : ''
    const res = await fetch(`${url}${path}`, { method, headers: { 'content-type': 'application/json', ...signSupervisorRequest({ secret, method, path, body }) }, body: body || undefined, signal: AbortSignal.timeout(timeoutMs) })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }
  return {
    async run(job) {
      const { status, data } = await send('POST', '/v1/jobs', job)
      if (status === 200) return data
      return { ok: false, error: { code: data.error ?? 'RUNTIME_FAILED' } }
    },
    async cancelModule(moduleKey) { return send('POST', `/v1/modules/${encodeURIComponent(moduleKey)}/cancel`) },
  }
}
