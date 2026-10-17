// Email invitations to a shared course (accessMode 'invite', spec §17.5): access
// codes, personal link tokens, invite list input and the failed-attempt guard.
// Pure except for crypto randomness.
import crypto from 'node:crypto'
import { LmsError } from './lms-error.js'
import { sharePath } from './lms-share-core.js'

// No 0/O, 1/I/L: the code is typed from an email.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ACCESS_CODE_LENGTH = 8
export const INVITE_LINK_RE = /^[A-Za-z0-9_-]{32}$/
export const MAX_INVITES_PER_REQUEST = 200
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function newAccessCode(randomInt = crypto.randomInt) {
  let code = ''
  for (let i = 0; i < ACCESS_CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

// 24 random bytes -> 32 url-safe characters.
export const newInviteLinkToken = () => crypto.randomBytes(24).toString('base64url')

// What the guest typed -> canonical code ("abcd-efgh " -> "ABCDEFGH"), or null.
export function normalizeAccessCode(value) {
  const code = String(value ?? '').toUpperCase().replace(/[\s-]/g, '')
  return code.length === ACCESS_CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null
}

// Shown as ABCD-EFGH.
export const formatAccessCode = (code) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : '')

// sha256 hex of the code salted with the invite's link token: equal codes on two
// invites never share a hash. Only this hash is stored.
export const hashAccessCode = (code, salt) => crypto.createHash('sha256').update(`lms-invite:${salt}:${code}`).digest('hex')

// Constant-time comparison of the typed code against the stored hash.
export function verifyAccessCode(typed, salt, storedHash) {
  const code = normalizeAccessCode(typed)
  const expected = Buffer.from(String(storedHash ?? ''), 'utf8')
  // Hash even a malformed code so both paths cost the same.
  const actual = Buffer.from(hashAccessCode(code ?? 'INVALID!', salt), 'utf8')
  return Boolean(code) && expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export const invitePath = (shareToken, linkToken) => `${sharePath(shareToken)}?i=${linkToken}`
export const inviteUrl = (base, shareToken, linkToken) => `${base ?? ''}${invitePath(shareToken, linkToken)}`

export function inviteStatus(invite) {
  if (invite?.revokedAt) return 'revoked'
  return invite?.learnerId ? 'active' : 'pending'
}

// POST /share/invites body -> [{ email, name }] deduplicated by email. Throws LmsError 400.
export function normalizeInviteList(body = {}) {
  const list = Array.isArray(body?.invites) ? body.invites : null
  if (!list || !list.length) throw new LmsError('Escribe al menos un correo.', 400)
  if (list.length > MAX_INVITES_PER_REQUEST) throw new LmsError(`Invita como máximo ${MAX_INVITES_PER_REQUEST} personas a la vez.`, 400)
  const byEmail = new Map()
  for (const raw of list) {
    const email = String(raw?.email ?? '').trim().toLowerCase()
    if (!email || email.length > 200 || !EMAIL_RE.test(email)) throw new LmsError(`Correo inválido: ${String(raw?.email ?? '').slice(0, 60) || '(vacío)'}`, 400)
    const name = String(raw?.name ?? '').replace(/\s+/g, ' ').trim()
    if (name.length > 80) throw new LmsError(`El nombre de ${email} no puede pasar de 80 caracteres.`, 400)
    if (!byEmail.has(email)) byEmail.set(email, { email, name: name || null })
  }
  return [...byEmail.values()]
}

// POST /access body -> { linkToken | email, code } (shape only; the code is
// checked against the invite). Throws LmsError 400.
export function normalizeAccessInput(body = {}) {
  const linkToken = body?.i ? String(body.i) : null
  if (linkToken && !INVITE_LINK_RE.test(linkToken)) throw accessDenied()
  const email = linkToken ? null : String(body?.email ?? '').trim().toLowerCase()
  if (!linkToken && (!email || email.length > 200 || !EMAIL_RE.test(email))) throw new LmsError('Escribe el correo con el que te invitaron.', 400)
  if (!String(body?.code ?? '').trim()) throw new LmsError('Escribe tu código de acceso.', 400)
  return { linkToken, email, code: String(body.code).slice(0, 32) }
}

// One generic answer for an unknown email, wrong code or wrong link: no enumeration.
export const accessDenied = () => new LmsError('El correo o el código de acceso no son correctos.', 401, 'INVALID_CODE')
export const inviteRevoked = () => new LmsError('Tu invitación a este curso fue retirada.', 403, 'GUEST_REMOVED')

// Failed code attempts per invite (in memory, per API process): after `max`
// failures inside `windowMs` the invite is locked for `lockMs`, even with the
// right code. A success clears the counter.
export function createAttemptGuard({ max = 5, windowMs = 15 * 60_000, lockMs = 15 * 60_000, now = () => Date.now(), maxEntries = 10_000 } = {}) {
  const entries = new Map()
  const fresh = (key) => {
    const entry = entries.get(key)
    if (!entry) return null
    const t = now()
    if (entry.lockedUntil && entry.lockedUntil <= t) { entries.delete(key); return null }
    if (!entry.lockedUntil && t - entry.firstAt > windowMs) { entries.delete(key); return null }
    return entry
  }
  return {
    // Seconds to wait, or 0 when the key may try.
    lockedFor(key) {
      const entry = fresh(key)
      return entry?.lockedUntil ? Math.ceil((entry.lockedUntil - now()) / 1000) : 0
    },
    fail(key) {
      if (entries.size >= maxEntries && !entries.has(key)) entries.delete(entries.keys().next().value)
      const entry = fresh(key) ?? { count: 0, firstAt: now(), lockedUntil: 0 }
      entry.count += 1
      if (entry.count >= max) entry.lockedUntil = now() + lockMs
      entries.set(key, entry)
      return entry.count
    },
    failures: (key) => fresh(key)?.count ?? 0,
    clear: (key) => entries.delete(key),
  }
}

export const inviteLocked = (seconds) => new LmsError(`Demasiados intentos con este código. Intenta de nuevo en ${Math.max(1, Math.ceil(seconds / 60))} min.`, 429, 'INVITE_LOCKED')
