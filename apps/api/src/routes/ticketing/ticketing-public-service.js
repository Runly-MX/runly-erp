// runly.ticketing F6E public portal: event page, free tickets without an account, the
// buyer's personal link and resend. The company is resolved from a published event slug,
// never from ids the browser sends; orders go through the same transactional reserve as
// the box office (quota + engine seats in one transaction), so the portal can never oversell.
import crypto from 'node:crypto'
import { TicketingError, notFound, policyOf, serializeTicket } from './ticketing-core.js'
import { hashToken, isTokenShape, orderToken } from './ticketing-links.js'

const unavailable = () => new TicketingError('Este evento no está disponible.', 404, 'EVENT_UNAVAILABLE')
const badLink = () => new TicketingError('El enlace no es válido o ya venció.', 404, 'LINK_INVALID')
const LOW = 10

// Short-lived preview of an unpublished event for its team: "<exp>.<hmac>", 30 minutes.
function previewSecret(env) { return env.TICKETING_LINK_SECRET || env.BOOKINGS_LINK_SECRET || env.JWT_SECRET || env.SUPABASE_JWT_SECRET || '' }
export function eventPreviewToken(eventId, env = process.env, now = Date.now()) {
  const exp = Math.floor(now / 1000) + 30 * 60
  return `${exp}.${crypto.createHmac('sha256', previewSecret(env)).update(`ticket-preview:${eventId}:${exp}`).digest('base64url')}`
}
function verifyPreview(token, eventId, env, now = Date.now()) {
  const [exp, sig] = String(token ?? '').split('.')
  if (!/^\d{10}$/.test(exp ?? '') || !sig || Number(exp) * 1000 < now || !previewSecret(env)) return false
  const expected = crypto.createHmac('sha256', previewSecret(env)).update(`ticket-preview:${eventId}:${exp}`).digest('base64url')
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
}

export function createTicketingPublicService({ prisma, commands, signFile = async () => null, getBrand = async () => null, env = process.env, now = () => Date.now() }) {
  async function resolveEvent(slug, preview = null) {
    if (typeof slug !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/.test(slug)) throw unavailable()
    const event = (await prisma.$queryRaw`
      SELECT e.*, sp.timezone, c.name AS company_name, c.enabled AS company_enabled
        FROM ticket_event e JOIN booking_space sp ON sp.id = e.space_id AND sp.company_id = e.company_id
        JOIN company c ON c.id = e.company_id
       WHERE e.slug = ${slug}`)[0]
    if (!event || !event.company_enabled) throw unavailable()
    const live = event.published && event.enabled
    const previewing = !live && verifyPreview(preview, event.id, env)
    // Unpublished and disabled events look exactly like missing ones (no enumeration).
    if (!live && !previewing && !(event.published && !event.enabled)) throw unavailable()
    return { ...event, live, previewing }
  }

  async function sessionsOf(event) {
    return prisma.$queryRaw`
      SELECT s.id, s.status, s.doors_open_at, b.starts_at, b.ends_at, b.capacity, b.seats_taken
        FROM ticket_session s JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
       WHERE s.event_id = ${event.id}::uuid AND s.company_id = ${event.company_id}::uuid AND s.status <> 'cancelled'
       ORDER BY b.starts_at`
  }
  async function typesOf(event) {
    return prisma.$queryRaw`
      SELECT t.*, p.price, p.currency AS product_currency, p.enabled AS product_enabled
        FROM ticket_type t LEFT JOIN catalog_product p ON p.id = t.catalog_product_id AND p.company_id = t.company_id
       WHERE t.event_id = ${event.id}::uuid AND t.company_id = ${event.company_id}::uuid AND t.enabled = true AND t.visibility = 'public'
       ORDER BY t.sort, t.name`
  }

  // Availability is informative: reserve re-checks both limits in its transaction.
  // Exact counts only when few are left (a bot learns nothing useful from "disponible").
  const shown = (left) => (left <= 0 ? { state: 'sold_out', left: 0 } : left <= LOW ? { state: 'few', left } : { state: 'available', left: null })
  function saleState(type, at) {
    if (type.sales_start && at < new Date(type.sales_start).getTime()) return 'not_started'
    if (type.sales_end && at >= new Date(type.sales_end).getTime()) return 'ended'
    return 'open'
  }

  async function getEvent(slug, preview = null) {
    const event = await resolveEvent(slug, preview)
    const at = now()
    const [sessions, types, quotas, brand, cover] = await Promise.all([
      sessionsOf(event), typesOf(event),
      prisma.$queryRaw`SELECT q.ticket_type_id, q.session_id, q.quota, q.issued FROM ticket_quota q JOIN ticket_type t ON t.id = q.ticket_type_id WHERE t.event_id = ${event.id}::uuid`,
      getBrand(event.company_id).catch(() => null), event.image_file_id ? signFile(event.image_file_id, 'full').catch(() => null) : null,
    ])
    const policy = policyOf(event)
    const upcoming = sessions.filter((s) => s.status === 'scheduled' && new Date(s.ends_at).getTime() > at)
    const status = !event.enabled ? 'cancelled' : !upcoming.length ? 'ended' : !event.sales_open ? 'closed' : 'on_sale'
    const domains = await prisma.$queryRaw`SELECT hostname FROM website_domain WHERE company_id = ${event.company_id}::uuid AND state = 'assigned' AND ready = true`
    return {
      embed: { allowedOrigins: [...new Set([...(event.embed_origins ?? []), ...domains.map((d) => `https://${d.hostname}`)])] },
      slug: event.slug, title: event.title, description: event.description, venue: event.venue, timezone: event.timezone,
      coverUrl: cover, company: { name: brand?.name || event.company_name, logoUrl: brand?.logoUrl ?? null, accentColor: brand?.primaryColor ?? null },
      status, preview: event.previewing, salesOpen: event.sales_open,
      policies: { version: event.policy_version, maxPerOrder: policy.maxPerOrder, holderNameRequired: policy.holderNameRequired, transferAllowed: policy.transferAllowed, refundText: policy.refundText },
      sessions: upcoming.map((s) => ({ id: s.id, startsAt: s.starts_at, endsAt: s.ends_at, doorsOpenAt: s.doors_open_at, ...shown(s.capacity - s.seats_taken) })),
      types: types.map((t) => ({
        id: t.id, name: t.name, description: t.description, free: t.price_mode === 'free',
        price: t.price_mode === 'free' ? null : t.price != null ? Number(t.price).toFixed(2) : null, currency: t.product_currency ?? t.currency ?? null,
        perOrderMax: Math.min(t.per_order_max, policy.maxPerOrder), sale: saleState(t, at), salesStart: t.sales_start, salesEnd: t.sales_end,
        availability: Object.fromEntries(upcoming.map((s) => {
          const q = quotas.find((x) => x.ticket_type_id === t.id && x.session_id === s.id)
          const typeLeft = q?.quota == null ? Infinity : q.quota - q.issued
          return [s.id, shown(Math.min(typeLeft, s.capacity - s.seats_taken))]
        })),
      })),
    }
  }

  async function createOrder(slug, input, { idempotencyKey, channel = 'portal' }) {
    if (!idempotencyKey || !/^[A-Za-z0-9:_-]{20,200}$/.test(idempotencyKey)) throw new TicketingError('Solicitud inválida.', 400, 'IDEMPOTENCY_KEY_REQUIRED')
    const event = await resolveEvent(slug)
    if (!event.live) throw unavailable()
    if (input.acceptedPolicyVersion !== event.policy_version) throw new TicketingError('Las condiciones del evento cambiaron. Revísalas y acéptalas de nuevo.', 409, 'POLICY_CHANGED')
    const session = (await prisma.$queryRaw`SELECT s.id FROM ticket_session s WHERE s.id = ${input.sessionId}::uuid AND s.event_id = ${event.id}::uuid`)[0]
    if (!session) throw notFound('Función')
    const types = await typesOf(event)
    for (const item of input.items) {
      const type = types.find((t) => t.id === item.typeId)
      if (!type) throw notFound('Tipo de boleto')
      // No online payment exists yet (Commerce D1): paid tickets are sold at the box office only.
      if (type.price_mode !== 'free') throw new TicketingError(`«${type.name}» se compra en taquilla.`, 409, 'PAID_AT_BOX_OFFICE')
    }
    const result = await commands.reserve({
      companyId: event.company_id, actorId: null, actorKind: 'portal', scope: `portal:${event.id}`, idempotencyKey,
      input: { sessionId: input.sessionId, channel, items: input.items, buyer: { name: input.buyer.name, email: input.buyer.email, phone: input.buyer.phone ?? null }, holders: input.holders },
    })
    const order = (await prisma.$queryRaw`SELECT * FROM ticket_order WHERE id = ${result.order.id}::uuid`)[0]
    return { order: await publicOrder(order, event), credentials: result.credentials, manageToken: result.manageToken ?? (order.manage_token_version > 0 ? orderToken(order.id, order.manage_token_version, env) : null), replayed: result.replayed }
  }

  // What the link holder sees: no codes, no QR, no hashes (credentials leave only by email).
  async function publicOrder(order, event) {
    const rows = await prisma.$queryRaw`
      SELECT t.*, ty.name AS type_name, (s.ticket_id IS NOT NULL AND s.credential_version = t.credential_version) AS sealed
        FROM ticket t JOIN ticket_type ty ON ty.id = t.type_id AND ty.company_id = t.company_id
        LEFT JOIN ticket_credential_secret s ON s.ticket_id = t.id
       WHERE t.order_id = ${order.id}::uuid ORDER BY t.created_at, t.id`
    const session = (await prisma.$queryRaw`SELECT b.starts_at, b.ends_at, s.status FROM ticket_session s JOIN booking_session b ON b.id = s.booking_session_id WHERE s.id = ${order.session_id}::uuid`)[0]
    return {
      reference: order.reference, status: order.status, quantity: order.quantity, buyerName: order.buyer_name, createdAt: order.created_at,
      event: { slug: event.slug, title: event.title, venue: event.venue, timezone: event.timezone },
      session: { startsAt: session.starts_at, endsAt: session.ends_at, status: session.status },
      tickets: rows.map((t) => {
        const s = serializeTicket(t)
        return { id: s.id, type: t.type_name, holderName: s.holderName, status: s.status, replaced: s.credentialVersion > 1, resendable: s.status === 'ISSUED' && t.sealed }
      }),
    }
  }

  async function resolveOrder(token) {
    if (!isTokenShape(token)) throw badLink()
    const order = (await prisma.$queryRaw`SELECT * FROM ticket_order WHERE manage_token_hash = ${hashToken(token)} AND manage_token_expires_at > now()`)[0]
    if (!order) throw badLink()
    const event = (await prisma.$queryRaw`SELECT e.*, sp.timezone FROM ticket_event e JOIN booking_space sp ON sp.id = e.space_id WHERE e.id = ${order.event_id}::uuid AND e.company_id = ${order.company_id}::uuid`)[0]
    return { order, event }
  }

  async function manage(token) {
    const { order, event } = await resolveOrder(token)
    const brand = await getBrand(order.company_id).catch(() => null)
    const company = (await prisma.$queryRaw`SELECT name FROM company WHERE id = ${order.company_id}::uuid`)[0]
    return { ...(await publicOrder(order, event)), company: { name: brand?.name || company?.name, logoUrl: brand?.logoUrl ?? null } }
  }

  // Same reply whether or not an email went out, so the link reveals nothing about addresses.
  async function resend(token, { ticketIds = null } = {}) {
    const { order } = await resolveOrder(token)
    await commands.resend({ companyId: order.company_id, orderId: order.id, ticketIds, stamp: `m${Math.floor(now() / 60000)}`, actorKind: 'portal' })
    return { ok: true }
  }

  // nginx asks before serving /app/p/boletos/<slug>: the ERP always, other sites only
  // with ?embed=1 and only those the event lists or the company's own Runly websites.
  async function frameAncestors(originalUri) {
    let url
    try { url = new URL(String(originalUri ?? ''), 'http://portal.invalid') } catch { return "'none'" }
    const match = /^\/app\/p\/boletos\/([^/]+)\/?$/.exec(url.pathname)
    if (!match) return "'self'"
    if (url.searchParams.get('embed') !== '1') return "'self'"
    const event = (await prisma.$queryRaw`SELECT company_id, embed_origins FROM ticket_event WHERE slug = ${match[1]} AND published = true AND enabled = true`)[0]
    if (!event) return "'self'"
    const domains = await prisma.$queryRaw`SELECT hostname FROM website_domain WHERE company_id = ${event.company_id}::uuid AND state = 'assigned' AND ready = true ORDER BY hostname`
    return ["'self'", ...new Set([...(event.embed_origins ?? []), ...domains.map((d) => `https://${d.hostname}`)])].join(' ')
  }

  return { getEvent, createOrder, manage, resend, frameAncestors }
}
