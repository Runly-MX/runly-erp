// Public Booking Portal. Company, space, services and resources are resolved
// from the published page, never from ids sent by the browser; bookings go
// through the same Booking Engine commands as the backoffice.
import crypto from 'node:crypto'
import { BookingError, eligibleResources, policyOf } from './bookings-core.js'
import { createBookingsAvailabilityService } from './bookings-availability-service.js'
import { createBookingsCalendarFiles } from './bookings-ics.js'
import { hashToken, isTokenShape, manageToken, verifyPreview } from './bookings-links.js'

const OCCUPYING = new Set(['PENDING', 'CONFIRMED'])
const unavailable = () => new BookingError('Esta página de reservaciones no está disponible.', 404, 'PAGE_UNAVAILABLE')
const badLink = () => new BookingError('El enlace no es válido o ya venció.', 404, 'LINK_INVALID')

export function createBookingsPortalService({ prisma, commands, getBrand = async () => null, env = process.env, now = () => Date.now(), meetings = null }) {
  const availabilitySvc = createBookingsAvailabilityService({ prisma })
  const calendarFiles = createBookingsCalendarFiles({ prisma, env, meetings })

  const isLive = (p) => Boolean(p.published && p.space_published && p.space_enabled && p.company_enabled)
  const spaceOf = (p) => ({ id: p.space_id, timezone: p.timezone, policy: p.policy, enabled: p.space_enabled })

  // Published page by slug; a valid preview token shows it unpublished (read only).
  async function resolvePage(slug, preview = null) {
    if (typeof slug !== 'string' || !/^[a-z0-9-]{3,64}$/.test(slug)) throw unavailable()
    const row = (await prisma.$queryRaw`
      SELECT p.*, s.name AS space_name, s.timezone, s.policy, s.mode, s.enabled AS space_enabled, s.published AS space_published,
             c.name AS company_name, c.enabled AS company_enabled
        FROM booking_page p
        JOIN booking_space s ON s.id = p.space_id AND s.company_id = p.company_id
        JOIN company c ON c.id = p.company_id
       WHERE p.enabled = true AND p.slug = ${slug}`)[0]
    if (!row) throw unavailable()
    // Link expiry is wall-clock security, independent of the booking clock.
    const previewing = !isLive(row) && preview && verifyPreview(preview, row.id, env)
    if (!isLive(row) && !previewing) throw unavailable()
    return { ...row, live: isLive(row), previewing: Boolean(previewing) }
  }

  // Enabled services of the page; appointment services need a resource to exist.
  async function pageServices(page) {
    if (!page.service_ids?.length) return []
    const services = await prisma.$queryRaw`
      SELECT * FROM booking_service
       WHERE company_id = ${page.company_id}::uuid AND space_id = ${page.space_id}::uuid AND enabled = true AND id = ANY(${page.service_ids}::uuid[])
       ORDER BY name`
    const out = []
    for (const s of services) {
      const resources = s.kind === 'appointment' ? await eligibleResources(prisma, { companyId: page.company_id, spaceId: page.space_id, serviceId: s.id }) : []
      if (s.kind === 'appointment' && !resources.length) continue
      out.push({ ...s, resources })
    }
    return out
  }

  async function findService(page, serviceId) {
    const service = (await pageServices(page)).find((s) => s.id === serviceId)
    if (!service) throw new BookingError('Ese servicio no está disponible en esta página.', 404, 'SERVICE_UNAVAILABLE')
    return service
  }

  function publicPolicies(page) {
    const p = policyOf({ policy: page.policy })
    return {
      requiresApproval: p.requiresApproval, leadMinutes: p.leadMinutes, horizonDays: p.horizonDays,
      cancelUntilMinutes: p.cancelUntilMinutes, rescheduleUntilMinutes: p.rescheduleUntilMinutes,
      cancellationPolicy: page.cancellation_policy, reschedulePolicy: page.reschedule_policy,
      punctualityPolicy: page.punctuality_policy, privacyNotice: page.privacy_notice, version: page.policy_version,
    }
  }

  // Sites that may show a page inside an iframe: the ones the business listed plus
  // its own published Runly websites. The ERP origin itself is always allowed ('self').
  async function embedOrigins(page) {
    const domains = await prisma.$queryRaw`
      SELECT hostname FROM website_domain WHERE company_id = ${page.company_id}::uuid AND state = 'assigned' AND ready = true ORDER BY hostname`
    return [...new Set([...(page.embed_origins ?? []), ...domains.map((d) => `https://${d.hostname}`)])]
  }

  // CSP frame-ancestors for an HTML request of the portal (nginx asks before serving
  // the SPA). Manage links are never framed; only ?embed=1 pages admit other sites.
  async function frameAncestors(originalUri) {
    let url
    try { url = new URL(String(originalUri ?? ''), 'http://portal.invalid') } catch { return "'none'" }
    const match = /^\/app\/p\/reservar\/([^/]+)\/?$/.exec(url.pathname)
    if (!match || match[1] === 'gestion') return match ? "'none'" : "'self'"
    if (url.searchParams.get('embed') !== '1' || !/^[a-z0-9-]{3,64}$/.test(match[1])) return "'self'"
    const page = (await prisma.$queryRaw`SELECT company_id, embed_origins FROM booking_page WHERE enabled = true AND slug = ${match[1]}`)[0]
    return page ? ["'self'", ...await embedOrigins(page)].join(' ') : "'self'"
  }

  async function getPage(slug, preview) {
    const page = await resolvePage(slug, preview)
    const [services, brand, origins] = await Promise.all([pageServices(page), getBrand(page.company_id).catch(() => null), embedOrigins(page)])
    return {
      embed: { allowedOrigins: origins },
      slug: page.slug, title: page.title, description: page.description, location: page.location, instructions: page.instructions,
      company: { name: brand?.name || page.company_name, logoUrl: brand?.logoUrl ?? null },
      space: { name: page.space_name, timezone: page.timezone },
      accentColor: page.accent_color || brand?.primaryColor || null,
      requirePhone: page.require_phone, allowResourceChoice: page.allow_resource_choice,
      bookable: page.live, preview: page.previewing,
      policies: publicPolicies(page),
      services: services.map((s) => ({
        id: s.id, name: s.name, description: s.description, kind: s.kind, durationMinutes: s.duration_minutes, minParty: s.min_party, maxParty: s.max_party,
        ...(page.allow_resource_choice && s.kind === 'appointment' ? { resources: s.resources.map((r) => ({ id: r.id, name: r.name })) } : {}),
      })),
    }
  }

  // Only times and seats: never resource ids (unless the page lets customers
  // choose), never other customers or private events.
  async function availabilityFor(page, service, query) {
    if (query.resourceId && !(page.allow_resource_choice && service.resources.some((r) => r.id === query.resourceId))) {
      throw new BookingError('Ese profesional no está disponible para este servicio.', 404, 'RESOURCE_UNAVAILABLE')
    }
    const result = await availabilitySvc.availability({ companyId: page.company_id, space: spaceOf(page), query: { serviceId: service.id, from: query.from, to: query.to, resourceId: query.resourceId } })
    if (result.kind === 'session') return { kind: 'session', sessions: result.sessions.filter((s) => s.seatsLeft > 0).map((s) => ({ id: s.id, startsAt: s.startsAt, endsAt: s.endsAt, seatsLeft: s.seatsLeft })) }
    return { kind: 'appointment', slots: result.slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, ...(page.allow_resource_choice ? { resourceIds: s.resourceIds } : {}) })) }
  }

  async function availability(slug, query) {
    const page = await resolvePage(slug, query.vista)
    return availabilityFor(page, await findService(page, query.serviceId), query)
  }

  async function publicView(row, page) {
    const service = (await prisma.$queryRaw`SELECT name, duration_minutes, kind FROM booking_service WHERE id = ${row.service_id}::uuid AND company_id = ${row.company_id}::uuid`)[0]
    const resources = page?.allow_resource_choice ? await prisma.$queryRaw`
      SELECT r.name FROM booking_allocation a JOIN booking_resource r ON r.id = a.resource_id
       WHERE a.booking_id = ${row.id}::uuid AND a.active` : []
    return {
      reference: row.reference, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, holdExpiresAt: row.hold_expires_at,
      timezone: page?.timezone ?? row.timezone, service: service ? { name: service.name, durationMinutes: service.duration_minutes, kind: service.kind } : null,
      resourceNames: resources.map((r) => r.name), partySize: row.party_size,
      guestName: row.guest_name, guestEmail: row.guest_email, guestPhone: row.guest_phone, notes: row.notes,
      // Online appointment (v1.2 R2): only the guest lobby link, and only once confirmed.
      meeting: meetings ? await meetings.guestJoin(row.id, { ensure: true }) : null,
      // "Agregar a mi calendario" (v1.2 R3): confirmed bookings only; no manage token inside.
      calendar: await calendarFiles.linksFor(row.id),
    }
  }

  const ipHash = (ip) => crypto.createHmac('sha256', env.BOOKINGS_LINK_SECRET || env.JWT_SECRET || 'runly').update(String(ip ?? '')).digest('hex').slice(0, 16)

  async function create(slug, input, { idempotencyKey, ip }) {
    if (!idempotencyKey || !/^[A-Za-z0-9:_-]{20,200}$/.test(idempotencyKey)) throw new BookingError('Solicitud inválida.', 400, 'IDEMPOTENCY_KEY_REQUIRED')
    const page = await resolvePage(slug)
    if (!page.live) throw unavailable()
    const service = await findService(page, input.serviceId)
    if (page.require_phone && !input.guestPhone) throw new BookingError('Escribe tu teléfono.', 400, 'PHONE_REQUIRED')
    if (input.acceptedPolicyVersion !== page.policy_version) throw new BookingError('Las políticas cambiaron. Revísalas y acéptalas de nuevo.', 409, 'POLICY_CHANGED')
    if (input.resourceId && !(page.allow_resource_choice && service.resources.some((r) => r.id === input.resourceId))) {
      throw new BookingError('Ese profesional no está disponible para este servicio.', 404, 'RESOURCE_UNAVAILABLE')
    }
    const result = await commands.create({
      companyId: page.company_id, actorId: null, spaceId: page.space_id, channel: 'portal', idempotencyKey,
      input: {
        serviceId: service.id, startsAt: input.startsAt, sessionId: input.sessionId, resourceId: input.resourceId, partySize: input.partySize,
        guestName: input.guestName, guestEmail: input.guestEmail, guestPhone: input.guestPhone, notes: input.notes,
      },
      portal: { pageId: page.id, acceptance: { version: page.policy_version, acceptedAt: new Date(now()).toISOString(), ip: ipHash(ip) } },
    })
    const row = (await prisma.$queryRaw`SELECT * FROM booking WHERE id = ${result.booking.id}::uuid`)[0]
    return { booking: await publicView(row, page), manageToken: manageToken(row.id, row.manage_token_version, env), replayed: result.replayed }
  }

  // ---- Manage link ------------------------------------------------------------
  // View and cancel keep working after the page is unpublished (the customer
  // keeps control of what they booked); rescheduling needs the page live.
  async function resolveToken(token) {
    if (!isTokenShape(token)) throw badLink()
    const row = (await prisma.$queryRaw`
      SELECT b.*, s.timezone, s.policy, s.published AS space_published, s.enabled AS space_enabled
        FROM booking b JOIN booking_space s ON s.id = b.space_id AND s.company_id = b.company_id
       WHERE b.manage_token_hash = ${hashToken(token)} AND b.manage_token_expires_at > now()`)[0]
    if (!row) throw badLink()
    const page = row.page_id ? (await prisma.$queryRaw`
      SELECT p.*, s.timezone, s.policy, s.enabled AS space_enabled, s.published AS space_published, c.enabled AS company_enabled
        FROM booking_page p JOIN booking_space s ON s.id = p.space_id AND s.company_id = p.company_id JOIN company c ON c.id = p.company_id
       WHERE p.id = ${row.page_id}::uuid AND p.company_id = ${row.company_id}::uuid`)[0] ?? null : null
    return { row, page }
  }

  function actionsOf(row, page) {
    const policy = policyOf({ policy: row.policy })
    const before = (minutes) => minutes == null || now() <= new Date(row.starts_at).getTime() - minutes * 60000
    const actions = []
    if (OCCUPYING.has(row.status) && before(policy.cancelUntilMinutes)) actions.push('cancel')
    if (OCCUPYING.has(row.status) && page && page.enabled && isLive(page) && page.service_ids.includes(row.service_id) && before(policy.rescheduleUntilMinutes)) actions.push('reschedule')
    return actions
  }

  async function manage(token) {
    const { row, page } = await resolveToken(token)
    const brand = await getBrand(row.company_id).catch(() => null)
    const company = (await prisma.$queryRaw`SELECT name FROM company WHERE id = ${row.company_id}::uuid`)[0]
    const space = (await prisma.$queryRaw`SELECT name FROM booking_space WHERE id = ${row.space_id}::uuid`)[0]
    return {
      booking: await publicView(row, page ?? { timezone: row.timezone }),
      actions: actionsOf(row, page),
      company: { name: brand?.name || company?.name, logoUrl: brand?.logoUrl ?? null },
      space: { name: space?.name, timezone: row.timezone },
      page: page ? { slug: page.slug, title: page.title, location: page.location, instructions: page.instructions, accentColor: page.accent_color || brand?.primaryColor || null, allowResourceChoice: page.allow_resource_choice, policies: publicPolicies({ ...page, policy: row.policy }) } : null,
      serviceId: row.service_id,
    }
  }

  async function manageAvailability(token, query) {
    const { row, page } = await resolveToken(token)
    if (!actionsOf(row, page).includes('reschedule')) throw new BookingError('Esta reservación ya no se puede reprogramar en línea.', 409, 'RESCHEDULE_UNAVAILABLE')
    const fullPage = { ...page, timezone: row.timezone, policy: row.policy }
    return availabilityFor(fullPage, await findService(fullPage, row.service_id), query)
  }

  async function cancel(token, { idempotencyKey }) {
    // The engine checks the state after its idempotency claim, so a retried cancel replays.
    const { row } = await resolveToken(token)
    const policy = policyOf({ policy: row.policy })
    await commands.transition({ companyId: row.company_id, actorId: null, actorKind: 'portal', bookingId: row.id, to: 'CANCELLED', input: {}, idempotencyKey, customer: { cancelUntilMinutes: policy.cancelUntilMinutes } })
    return manage(token)
  }

  async function reschedule(token, input, { idempotencyKey }) {
    const { row, page } = await resolveToken(token)
    if (!actionsOf(row, page).includes('reschedule')) throw new BookingError('Esta reservación ya no se puede reprogramar en línea.', 409, 'RESCHEDULE_UNAVAILABLE')
    const fullPage = { ...page, timezone: row.timezone, policy: row.policy }
    const service = await findService(fullPage, row.service_id)
    if (input.resourceId && !(page.allow_resource_choice && service.resources.some((r) => r.id === input.resourceId))) {
      throw new BookingError('Ese profesional no está disponible para este servicio.', 404, 'RESOURCE_UNAVAILABLE')
    }
    const policy = policyOf({ policy: row.policy })
    await commands.reschedule({
      companyId: row.company_id, actorId: null, actorKind: 'portal', bookingId: row.id, idempotencyKey,
      input: { startsAt: input.startsAt, sessionId: input.sessionId, resourceId: input.resourceId },
      customer: { rescheduleUntilMinutes: policy.rescheduleUntilMinutes },
    })
    return manage(token)
  }

  return { getPage, availability, create, manage, manageAvailability, cancel, reschedule, frameAncestors, calendarFile: calendarFiles.file }
}
