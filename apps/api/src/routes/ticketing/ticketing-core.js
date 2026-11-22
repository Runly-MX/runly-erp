// runly.ticketing shared pieces: errors, QR credentials, per-event roles, serializers.
import crypto from 'node:crypto'
import { BookingError } from '../bookings/bookings-core.js'

// Subclass of the engine's error so engine and ticketing failures roll back and
// reach the client the same way inside one transaction.
export class TicketingError extends BookingError {}
export const notFound = (what = 'Registro') => new TicketingError(`${what} no encontrado.`, 404, 'NOT_FOUND')

export const SOURCE_MODULE = 'runly.ticketing'
// Ticket channels map to the engine's booking channels.
export const ENGINE_CHANNEL = { box_office: 'backoffice', portal: 'portal', website: 'website', api: 'api' }

// ---- QR credential ---------------------------------------------------------------
// The QR carries RT1.<ticketId>.<secret>; only SHA-256(secret) is stored, so the
// database alone never yields a valid QR. A new secret replaces the old one.
const QR = /^RT1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')
export const hashSecret = sha256

export function newSecret() {
  const secret = crypto.randomBytes(32).toString('base64url')
  return { secret, hash: sha256(secret) }
}
export const qrText = (ticketId, secret) => `RT1.${ticketId}.${secret}`

export function parseCredential(text) {
  const match = QR.exec(String(text ?? '').trim())
  return match ? { ticketId: match[1], secret: match[2] } : null
}

// Constant-time; a missing hash still costs one comparison.
export function credentialMatches(secret, storedHash) {
  const given = Buffer.from(sha256(secret), 'hex')
  const stored = Buffer.from(storedHash ?? '0'.repeat(64), 'hex')
  return crypto.timingSafeEqual(given, stored.length === given.length ? stored : Buffer.alloc(given.length)) && Boolean(storedHash)
}

// ---- Roles -------------------------------------------------------------------------
// Event roles reuse the membership of the event's booking space (admin|agent|viewer).
const RANK = { viewer: 1, agent: 2, admin: 3 }
export const isTicketingAdmin = (ctx) => Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.('ticketing.admin'))
export const canCreateEvents = (ctx) => isTicketingAdmin(ctx) || Boolean(ctx?.permissionSet?.has?.('ticketing.events.manage'))

// 404 for another company's event (never reveals it exists), 403 when the role is too low.
export async function requireEventRole(db, { companyId, eventId, userId, ctx, min = 'viewer' }) {
  const event = (await db.$queryRaw`
    SELECT e.*, sp.timezone, m.role AS member_role FROM ticket_event e
      JOIN booking_space sp ON sp.id = e.space_id AND sp.company_id = e.company_id
      LEFT JOIN booking_space_member m ON m.space_id = e.space_id AND m.company_id = e.company_id AND m.user_id = ${userId}::uuid
     WHERE e.id = ${eventId}::uuid AND e.company_id = ${companyId}::uuid`)[0]
  if (!event) throw notFound('Evento')
  const role = isTicketingAdmin(ctx) ? 'admin' : event.member_role
  if (!role || RANK[role] < RANK[min]) throw new TicketingError('No tienes permiso para esta acción en este evento.', 403, 'FORBIDDEN')
  return { event, role }
}

// ---- Policy and serializers -----------------------------------------------------------
export function policyOf(event) {
  const p = event?.policy ?? {}
  return {
    transferAllowed: p.transferAllowed !== false,
    transferCutoffMinutes: p.transferCutoffMinutes == null ? null : Number(p.transferCutoffMinutes),
    maxPerOrder: Number(p.maxPerOrder ?? 10),
    holderNameRequired: Boolean(p.holderNameRequired),
    holdMinutes: Number(p.holdMinutes ?? 15),
    refundText: p.refundText ?? null,
  }
}

export const serializeEvent = (e) => e && ({
  id: e.id, spaceId: e.space_id, title: e.title, slug: e.slug, description: e.description, venue: e.venue, timezone: e.timezone ?? null,
  published: e.published, salesOpen: e.sales_open, policy: policyOf(e), policyVersion: e.policy_version, enabled: e.enabled,
  imageFileId: e.image_file_id ?? null, embedOrigins: e.embed_origins ?? [], publishedAt: e.published_at ?? null,
  version: e.version, createdAt: e.created_at, updatedAt: e.updated_at,
})

export const serializeTicket = (t) => t && ({
  id: t.id, orderId: t.order_id, sessionId: t.session_id, typeId: t.type_id, code: t.code, status: t.status,
  holderName: t.holder_name, holderEmail: t.holder_email, credentialVersion: t.credential_version,
  issuedAt: t.issued_at, cancelledAt: t.cancelled_at, version: t.version,
})

export const serializeOrder = (o, tickets = undefined) => o && ({
  id: o.id, eventId: o.event_id, sessionId: o.session_id, status: o.status, channel: o.channel, reference: o.reference,
  quantity: o.quantity, contactId: o.contact_id, buyerName: o.buyer_name, buyerEmail: o.buyer_email, buyerPhone: o.buyer_phone,
  bookingId: o.booking_id, holdExpiresAt: o.hold_expires_at, totals: o.totals, policyVersion: o.policy_version,
  version: o.version, createdAt: o.created_at, updatedAt: o.updated_at,
  ...(tickets ? { tickets: tickets.map(serializeTicket) } : {}),
})

// Outbox payloads: ids, counts and states only (no names, emails, phones or contacts).
export const orderEvent = (o) => ({ id: o.id, eventId: o.event_id, sessionId: o.session_id, status: o.status, quantity: o.quantity, channel: o.channel })
export const ticketEvent = (t, eventId) => ({ id: t.id, orderId: t.order_id, eventId, sessionId: t.session_id, typeId: t.type_id, credentialVersion: t.credential_version })
