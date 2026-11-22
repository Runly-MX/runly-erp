// Customer links of runly.bookings. The manage token is an HMAC of (booking id,
// version): nothing secret is stored (only its SHA-256), emails can rebuild it,
// and rotating a link is bumping the version. Preview links are short-lived HMACs.
import crypto from 'node:crypto'
import { resolveApiBaseUrl, resolveAppBaseUrl } from '../../services/email-templates.js'

export const MANAGE_LINK_DAYS = 30
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

function secret(env = process.env) {
  const value = env.BOOKINGS_LINK_SECRET || env.JWT_SECRET || env.SUPABASE_JWT_SECRET
  if (!value) throw new Error('BOOKINGS_LINK_SECRET no configurado')
  return value
}

const hmac = (data, env) => crypto.createHmac('sha256', secret(env)).update(data).digest('base64url')
export const manageToken = (bookingId, version, env) => hmac(`booking-manage:${bookingId}:${version}`, env)
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')
export const isTokenShape = (token) => typeof token === 'string' && TOKEN_RE.test(token)
export const manageExpiry = (endsAt) => new Date(new Date(endsAt).getTime() + MANAGE_LINK_DAYS * 86400000)

// The token travels in the URL fragment: browsers never send it to the server,
// so it stays out of access logs and Referer headers.
export function manageUrl(token, env = process.env) {
  const base = resolveAppBaseUrl(env)
  return base ? `${base}/app/p/reservar/gestion#${token}` : null
}
export function pageUrl(slug, env = process.env) {
  const base = resolveAppBaseUrl(env)
  return base ? `${base}/app/p/reservar/${slug}` : null
}

// Calendar file link (v1.2 R3): its own HMAC, never the manage token (which cannot be
// derived from it). Tied to the manage link version, so rotating a leaked manage link
// also kills the calendar link; a reschedule keeps it (the file always shows the current time).
export const icsToken = (bookingId, manageVersion, env) => hmac(`booking-ics:${bookingId}:${manageVersion}`, env)
export function verifyIcsToken(token, bookingId, manageVersion, env) {
  if (!isTokenShape(token) || !(manageVersion > 0)) return false
  const expected = icsToken(bookingId, manageVersion, env)
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))
}
export function icsUrl(bookingId, token, env = process.env) {
  const base = resolveApiBaseUrl(env)
  return base ? `${base}/public/bookings/calendar/${bookingId}/${token}.ics` : null
}

// "<expiresEpochSeconds>.<hmac>" valid for one page for 30 minutes.
export function previewToken(pageId, env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + 30 * 60
  return `${exp}.${hmac(`booking-preview:${pageId}:${exp}`, env)}`
}
export function verifyPreview(token, pageId, env, now = Date.now()) {
  const [exp, sig] = String(token ?? '').split('.')
  if (!/^\d{10}$/.test(exp ?? '') || !sig || Number(exp) * 1000 < now) return false
  const expected = hmac(`booking-preview:${pageId}:${exp}`, env)
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
}
