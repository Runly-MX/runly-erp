// runly.ticketing F6E public links (bookings pattern): the buyer's personal link to an order
// is an HMAC of (order id, version), only its SHA-256 is stored, rotating it is bumping the
// version, and it travels in the URL fragment (never in server logs or Referer headers).
import crypto from 'node:crypto'
import { resolveAppBaseUrl } from '../../services/email-templates.js'

export const ORDER_LINK_DAYS = 30
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

function secret(env = process.env) {
  const value = env.TICKETING_LINK_SECRET || env.BOOKINGS_LINK_SECRET || env.JWT_SECRET || env.SUPABASE_JWT_SECRET
  if (!value) throw new Error('TICKETING_LINK_SECRET no configurado')
  return value
}
// Issuing never depends on the link: without a secret an order simply has no personal link.
export const canSignLinks = (env = process.env) => Boolean(env.TICKETING_LINK_SECRET || env.BOOKINGS_LINK_SECRET || env.JWT_SECRET || env.SUPABASE_JWT_SECRET)
export const orderToken = (orderId, version, env) => crypto.createHmac('sha256', secret(env)).update(`ticket-order:${orderId}:${version}`).digest('base64url')
export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')
export const isTokenShape = (token) => typeof token === 'string' && TOKEN_RE.test(token)
// Valid until a month after the function ends (enough to resend and to check what happened).
export const orderLinkExpiry = (endsAt) => new Date(new Date(endsAt).getTime() + ORDER_LINK_DAYS * 86400000)

export function eventUrl(slug, env = process.env) {
  const base = resolveAppBaseUrl(env)
  return base ? `${base}/app/p/boletos/${slug}` : null
}
export function orderUrl(token, env = process.env) {
  const base = resolveAppBaseUrl(env)
  // Its own path, so no event slug can ever shadow it.
  return base ? `${base}/app/p/mis-boletos#${token}` : null
}
