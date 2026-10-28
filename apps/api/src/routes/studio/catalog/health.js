import { StudioError } from '../../../../../shared/studio/document.js'

// Per-provider failure isolation. Transport and 5xx failures open a bounded cooldown (30 s doubling to 5 min)
// so a stalled provider cannot hold request slots or be retried in a loop; after the cooldown a single probe
// decides whether it recovers. State is process-local and bounded by the fixed provider list.
const TRANSPORT = /^(CATALOG_(DNS|CONNECT|TLS|HEADERS|DOWNLOAD|TOTAL)_(FAILED|TIMEOUT)|CATALOG_TOTAL_TIMEOUT|CATALOG_UPSTREAM_(5\d\d|429))$/
export function createProviderHealth({ clock = Date.now, threshold = 3, baseMs = 30000, maxMs = 300000 } = {}) {
  const rows = new Map(), quotas = new Map()
  const row = id => { if (!rows.has(id)) rows.set(id, { failures: 0, openUntil: 0, cooldown: baseMs, probing: false, lastCode: null }); return rows.get(id) }
  const unavailable = (r, id) => new StudioError('El proveedor no está disponible temporalmente. Reintenta en unos minutos.', 503, 'CATALOG_PROVIDER_UNAVAILABLE')
  return {
    // Throws while the provider is cooling down; lets exactly one probe through once the cooldown ends.
    check(id) {
      const r = row(id)
      if (!r.openUntil) return
      if (r.openUntil > clock() || r.probing) throw unavailable(r, id)
      r.probing = true
    },
    success(id) { Object.assign(row(id), { failures: 0, openUntil: 0, cooldown: baseMs, probing: false, lastCode: null }) },
    failure(id, error) {
      const r = row(id), code = error?.code ?? ''
      if (code === 'CATALOG_CANCELLED') { r.probing = false; return }
      if (!TRANSPORT.test(code)) { if (r.probing || r.failures) this.success(id); return }
      r.failures++; r.lastCode = code
      if (r.probing || r.failures >= threshold) {
        if (r.probing) r.cooldown = Math.min(maxMs, r.cooldown * 2)
        r.openUntil = clock() + r.cooldown; r.probing = false
      }
    },
    // Fixed window quota for providers with a published request budget (Pixabay: 100 per minute per key).
    quota(id, limit, windowMs = 60000) {
      const now = clock(), q = quotas.get(id)
      if (!q || q.until <= now) { quotas.set(id, { count: 1, until: now + windowMs }); return }
      if (++q.count > limit) throw new StudioError('El proveedor limitó las solicitudes. Espera antes de reintentar.', 429, 'CATALOG_PROVIDER_QUOTA')
    },
    status(id) {
      const r = row(id), now = clock()
      if (r.openUntil > now) return { state: 'unavailable', retryAfterSec: Math.ceil((r.openUntil - now) / 1000), lastCode: r.lastCode }
      return { state: r.failures || r.openUntil ? 'degraded' : 'available', lastCode: r.lastCode }
    },
  }
}
