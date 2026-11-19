// Shared pieces of runly.bookings: errors, per-space access and the SQL that
// turns weekly wall-clock rules into instants (Postgres handles DST).
import { resourceWindows } from './bookings-slots.js'

export class BookingError extends Error {
  constructor(message, status = 400, code = null) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFound = (what = 'Registro') => new BookingError(`${what} no encontrado.`, 404, 'NOT_FOUND')

const RANK = { viewer: 1, agent: 2, admin: 3 }

export function isBookingsAdmin(ctx) {
  return Boolean(ctx?.isAdmin || ctx?.permissionSet?.has?.('bookings.admin'))
}

export function canManageCatalog(ctx) {
  return isBookingsAdmin(ctx) || Boolean(ctx?.permissionSet?.has?.('bookings.spaces.manage'))
}

// Space of this company + the caller's role in it. 404 when the space belongs to
// another company (never reveals it exists), 403 when the role is too low.
export async function requireSpaceRole(db, { companyId, spaceId, userId, ctx, min = 'viewer' }) {
  const rows = await db.$queryRaw`
    SELECT s.*, m.role AS member_role
      FROM booking_space s
      LEFT JOIN booking_space_member m ON m.space_id = s.id AND m.company_id = s.company_id AND m.user_id = ${userId}::uuid
     WHERE s.id = ${spaceId}::uuid AND s.company_id = ${companyId}::uuid`
  const space = rows[0]
  if (!space) throw notFound('Sistema de reservaciones')
  const role = isBookingsAdmin(ctx) ? 'admin' : space.member_role
  if (!role || RANK[role] < RANK[min]) throw new BookingError('No tienes permiso para esta acción en este sistema.', 403, 'FORBIDDEN')
  return { space, role }
}

export function serializeBooking(row, resourceIds = undefined) {
  if (!row) return null
  return {
    id: row.id,
    spaceId: row.space_id,
    serviceId: row.service_id,
    sessionId: row.session_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    partySize: row.party_size,
    contactId: row.contact_id,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    notes: row.notes,
    channel: row.channel,
    holdExpiresAt: row.hold_expires_at,
    createdById: row.created_by_id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(resourceIds ? { resourceIds } : {}),
  }
}

const ms = (d) => new Date(d).getTime()
const range = (row) => ({ start: ms(row.starts_at), end: ms(row.ends_at) })
const DAY = 86400000

// Bookable windows per resource between from and to (instants), from the space and
// resource rules and exceptions. Nonexistent local times (DST gap) shift forward and
// ambiguous ones resolve to the later, standard-time occurrence, as Postgres does.
export async function loadResourceWindows(db, { companyId, space, resourceIds, from, to }) {
  const fromAt = new Date(ms(from) - DAY), toAt = new Date(ms(to) + DAY)
  const ids = resourceIds.length ? resourceIds : ['00000000-0000-0000-0000-000000000000']
  const [rules, exceptions] = await Promise.all([
    db.$queryRaw`
      SELECT r.space_id, r.resource_id,
             ((d::date + r.start_time) AT TIME ZONE ${space.timezone}) AS starts_at,
             ((d::date + r.end_time + CASE WHEN r.end_time <= r.start_time THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE ${space.timezone}) AS ends_at
        FROM booking_schedule_rule r
       CROSS JOIN generate_series((${fromAt}::timestamptz AT TIME ZONE ${space.timezone})::date,
                                  (${toAt}::timestamptz AT TIME ZONE ${space.timezone})::date, interval '1 day') d
       WHERE r.company_id = ${companyId}::uuid
         AND (r.space_id = ${space.id}::uuid OR r.resource_id = ANY(${ids}::uuid[]))
         AND extract(dow FROM d)::int = r.weekday`,
    db.$queryRaw`
      SELECT space_id, resource_id, kind, starts_at, ends_at FROM booking_exception
       WHERE company_id = ${companyId}::uuid
         AND (space_id = ${space.id}::uuid OR resource_id = ANY(${ids}::uuid[]))
         AND starts_at < ${toAt} AND ends_at > ${fromAt}`,
  ])
  const pick = (list, owner) => list.filter((row) => (owner ? row.resource_id === owner : row.space_id)).map(range)
  const spaceHours = { rules: pick(rules), open: pick(exceptions.filter((e) => e.kind === 'open')), closed: pick(exceptions.filter((e) => e.kind === 'closed')) }
  const windows = new Map()
  for (const id of resourceIds) {
    windows.set(id, resourceWindows({
      space: spaceHours,
      resource: { rules: pick(rules, id), open: pick(exceptions.filter((e) => e.kind === 'open'), id), closed: pick(exceptions.filter((e) => e.kind === 'closed'), id) },
    }))
  }
  return windows
}

// Resources that can deliver the service in this space (linked to both, enabled).
export async function eligibleResources(db, { companyId, spaceId, serviceId }) {
  const rows = await db.$queryRaw`
    SELECT r.id, r.name, r.type FROM booking_resource r
      JOIN booking_service_resource sr ON sr.resource_id = r.id AND sr.company_id = r.company_id AND sr.service_id = ${serviceId}::uuid
      JOIN booking_space_resource sp ON sp.resource_id = r.id AND sp.company_id = r.company_id AND sp.space_id = ${spaceId}::uuid
     WHERE r.company_id = ${companyId}::uuid AND r.enabled = true
     ORDER BY r.name, r.id`
  return rows
}

// Space policy with defaults (validated on write by bookingPolicySchema).
export function policyOf(space) {
  const p = space?.policy ?? {}
  return {
    leadMinutes: Number(p.leadMinutes ?? 0),
    horizonDays: Number(p.horizonDays ?? 90),
    requiresApproval: Boolean(p.requiresApproval),
    holdMinutes: p.holdMinutes == null ? null : Number(p.holdMinutes),
  }
}
