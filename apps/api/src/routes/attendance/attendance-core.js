// Pure helpers for runly.attendance: PIN hashing, signed phone-key payloads,
// punch sessions, quota compliance and clock-skew handling. No I/O here so the
// rules can be unit-tested and mirrored by the offline kiosk.
import crypto from 'node:crypto'

export const PRESENCE_WINDOW_MS = 24 * 60 * 60 * 1000
export const PHONE_QR_WINDOW_MS = 45_000
export const CLOCK_SKEW_TOLERANCE_MS = 2 * 60_000
export const PHONE_PAYLOAD_PREFIX = 'RA1'

export class AttendanceError extends Error {
  constructor(message, status = 400, code = null) {
    super(message)
    this.name = 'AttendanceError'
    this.status = status
    this.code = code
  }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url')
}

export function randomDigits(length = 6) {
  let out = ''
  while (out.length < length) out += String(crypto.randomInt(0, 10))
  return out
}

// PBKDF2 (not scrypt) so a paired kiosk can verify PINs offline with WebCrypto.
export const PIN_ITERATIONS = 100_000

export function hashPin(pin) {
  const salt = crypto.randomBytes(8).toString('hex')
  const hash = crypto.pbkdf2Sync(String(pin), salt, PIN_ITERATIONS, 32, 'sha256').toString('hex')
  return `p1$${PIN_ITERATIONS}$${salt}$${hash}`
}

export function verifyPin(pin, stored) {
  if (!stored || pin == null) return false
  const [version, iterations, salt, hash] = String(stored).split('$')
  if (version !== 'p1' || !salt || !hash) return false
  const candidate = crypto.pbkdf2Sync(String(pin), salt, Number(iterations), 32, 'sha256')
  const expected = Buffer.from(hash, 'hex')
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected)
}

export function normalizeUid(value) {
  return String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

// Phone-key payload: RA1.<personId>.<unixSeconds>.<base64url ES256 P1363 signature>
// signed over `<personId>.<unixSeconds>`. The phone rotates it every ~30 s.
export function phonePayloadMessage(personId, ts) {
  return `${personId}.${ts}`
}

export function parsePhonePayload(payload) {
  const parts = String(payload ?? '').trim().split('.')
  if (parts.length !== 4 || parts[0] !== PHONE_PAYLOAD_PREFIX) return null
  const [, personId, ts, sig] = parts
  if (!/^[0-9a-f-]{36}$/i.test(personId) || !/^\d{9,12}$/.test(ts) || !sig) return null
  return { personId, ts: Number(ts), sig }
}

export function verifyPhonePayload({ payload, jwk, now = Date.now(), windowMs = PHONE_QR_WINDOW_MS }) {
  const parsed = typeof payload === 'string' ? parsePhonePayload(payload) : payload
  if (!parsed || !jwk) return { ok: false, reason: 'malformed' }
  if (Math.abs(now - parsed.ts * 1000) > windowMs) return { ok: false, reason: 'expired' }
  try {
    const key = crypto.createPublicKey({ key: jwk, format: 'jwk' })
    const ok = crypto.verify(
      'sha256',
      Buffer.from(phonePayloadMessage(parsed.personId, parsed.ts)),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(parsed.sig, 'base64url'),
    )
    return ok ? { ok: true, personId: parsed.personId, ts: parsed.ts } : { ok: false, reason: 'bad_signature' }
  } catch {
    return { ok: false, reason: 'bad_key' }
  }
}

// Align a device timestamp with the server clock. `offsetMs` is the delta
// measured at sync time (serverNow - deviceNow); a punch is only corrected, and
// flagged, when the device clock was off by more than the tolerance.
export function resolvePunchTime({ deviceTime, offsetMs = 0, serverNow = new Date() }) {
  const device = deviceTime ? new Date(deviceTime) : serverNow
  if (Number.isNaN(device.getTime())) return { occurredAt: serverNow, skewMs: 0, flags: ['bad_time'] }
  const flags = []
  let occurredAt = device
  const skew = Math.round(offsetMs)
  if (Math.abs(skew) > CLOCK_SKEW_TOLERANCE_MS) {
    occurredAt = new Date(device.getTime() + skew)
    flags.push('clock_skew')
  }
  if (occurredAt.getTime() > serverNow.getTime() + CLOCK_SKEW_TOLERANCE_MS) {
    occurredAt = serverNow
    flags.push('future_time')
  }
  return { occurredAt, skewMs: skew, flags }
}

const byTime = (a, b) => new Date(a.occurredAt) - new Date(b.occurredAt)
const usable = (p) => p.status !== 'voided'

// Pair in -> out per person. An `in` without a later `out` stays open (end null).
export function buildSessions(punches) {
  const perPerson = new Map()
  for (const punch of [...punches].filter(usable).sort(byTime)) {
    if (!perPerson.has(punch.personId)) perPerson.set(punch.personId, [])
    perPerson.get(punch.personId).push(punch)
  }
  const sessions = []
  for (const [personId, list] of perPerson) {
    let open = null
    for (const punch of list) {
      if (punch.direction === 'in') {
        if (open) sessions.push({ personId, start: open.occurredAt, end: null, minutes: 0, siteId: open.siteId ?? null, open: true })
        open = punch
      } else if (open) {
        const minutes = Math.max(0, Math.round((new Date(punch.occurredAt) - new Date(open.occurredAt)) / 60_000))
        sessions.push({ personId, start: open.occurredAt, end: punch.occurredAt, minutes, siteId: open.siteId ?? null, open: false })
        open = null
      }
    }
    if (open) sessions.push({ personId, start: open.occurredAt, end: null, minutes: 0, siteId: open.siteId ?? null, open: true })
  }
  return sessions.sort((a, b) => new Date(a.start) - new Date(b.start))
}

// Who is inside at `at`: last non-voided punch within the presence window is an `in`.
export function presentAt(punches, at = new Date()) {
  const limit = new Date(at).getTime()
  const floor = limit - PRESENCE_WINDOW_MS
  const last = new Map()
  for (const punch of [...punches].filter(usable).sort(byTime)) {
    const t = new Date(punch.occurredAt).getTime()
    if (t > limit || t < floor) continue
    last.set(punch.personId, punch)
  }
  return [...last.values()].filter((p) => p.direction === 'in')
}

// Next direction for a kiosk in "both" mode, from the person's last punch.
export function nextDirection(lastPunch, mode = 'both', now = new Date()) {
  if (mode === 'in' || mode === 'out') return mode
  if (!lastPunch || lastPunch.status === 'voided') return 'in'
  if (new Date(now) - new Date(lastPunch.occurredAt) > PRESENCE_WINDOW_MS) return 'in'
  return lastPunch.direction === 'in' ? 'out' : 'in'
}

// Quota rows: required vs inside right now vs distinct people seen in the range.
export function computeCompliance({ quotas, people, punches, at = new Date(), from = null, to = null }) {
  const personById = new Map(people.map((p) => [p.id, p]))
  const inside = presentAt(punches, at)
  const day = new Date(at).getDay()
  const rangeStart = from ? new Date(from).getTime() : null
  const rangeEnd = to ? new Date(to).getTime() : null
  const seen = new Set()
  for (const punch of punches) {
    if (!usable(punch) || punch.direction !== 'in') continue
    const t = new Date(punch.occurredAt).getTime()
    if ((rangeStart == null || t >= rangeStart) && (rangeEnd == null || t <= rangeEnd)) seen.add(`${punch.personId}|${punch.siteId ?? ''}`)
  }
  return quotas.filter((q) => q.enabled !== false).map((quota) => {
    const matches = (personId, siteId) => {
      const person = personById.get(personId)
      if (!person || person.enabled === false) return false
      if (quota.groupId && person.groupId !== quota.groupId) return false
      if (quota.categoryId && person.categoryId !== quota.categoryId) return false
      if (quota.siteId && siteId !== quota.siteId) return false
      return true
    }
    const present = new Set(inside.filter((p) => matches(p.personId, p.siteId)).map((p) => p.personId)).size
    const attended = new Set([...seen].map((k) => k.split('|')).filter(([pid, sid]) => matches(pid, sid || null)).map(([pid]) => pid)).size
    const applies = !Array.isArray(quota.days) || quota.days.length === 0 || quota.days.includes(day)
    return {
      quotaId: quota.id, name: quota.name ?? null, groupId: quota.groupId ?? null, categoryId: quota.categoryId ?? null,
      siteId: quota.siteId ?? null, required: quota.minCount, present, attended, applies,
      missing: applies ? Math.max(0, quota.minCount - present) : 0,
      ok: !applies || present >= quota.minCount,
    }
  })
}

// Seal a short secret with a key derived from another secret (AES-256-GCM), so
// the server can hand a device token back to the one holder of the poll secret
// without keeping the token itself.
export function sealWithSecret(plain, secret) {
  const key = crypto.createHash('sha256').update(String(secret)).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.')
}

export function openWithSecret(sealed, secret) {
  try {
    const [iv, tag, body] = String(sealed).split('.').map((p) => Buffer.from(p, 'base64url'))
    const key = crypto.createHash('sha256').update(String(secret)).digest()
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)))
}

// 'outside_geofence' when the punch carries coordinates farther than the site radius.
export function geofenceFlag(site, latitude, longitude) {
  if (!site || site.latitude == null || site.longitude == null || !site.radiusM) return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return distanceMeters(site.latitude, site.longitude, latitude, longitude) > site.radiusM ? 'outside_geofence' : null
}
