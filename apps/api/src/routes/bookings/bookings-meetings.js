// Online meetings of runly.bookings (v1.2 R2). A confirmed booking of a service with
// meeting.kind = 'runly' owns one private Runly Chat channel (metadata.origin 'meeting',
// so the existing archive job tidies it) and one lobby guest link. Like the calendar
// mirror, this is a projection of the booking row: run after each commit and by the
// worker, under a per-booking advisory lock and a version check. The channel, its link
// and booking_meeting are written in one transaction, so a crash leaves no orphan room.
// Nothing here starts a call: a host starts it from the channel and admits guests.
import crypto from 'node:crypto'
import { createCallLinksService, generateCallCode } from '../calls/call-links-service.js'
import { createCallGuestService } from '../calls/call-guest-service.js'
import { readLiveKitConfig } from '../calls/call-service.js'
import { createChatPermissionsService } from '../chat/chat-permissions-service.js'

// Guests can still join a little after the end (a meeting that runs over).
export const MEETING_GRACE_MS = 2 * 3600000
const meetingOf = (service) => (service && typeof service === 'object' ? service : { kind: 'none' })

export function createBookingsMeetings({ prisma, env = process.env, kickGuests = null, log = console.error }) {
  const roles = createChatPermissionsService({ prisma })
  const links = createCallLinksService({ prisma, env })
  const kick = kickGuests ?? ((args) => createCallGuestService({ prisma, env, linksService: links }).kickGuestsForLink(args))

  // Who hosts: the person behind the booked resource, else the space's agents and admins.
  async function hostsOf(tx, row) {
    if (row.resource_user_id) return [row.resource_user_id]
    const members = await tx.$queryRaw`
      SELECT user_id FROM booking_space_member
       WHERE company_id = ${row.company_id}::uuid AND space_id = ${row.space_id}::uuid AND role IN ('admin', 'agent')
       ORDER BY (role = 'admin') DESC, created_at`
    return members.map((m) => m.user_id)
  }

  async function addMembers(tx, conversationId, userIds, roleId) {
    for (const userId of userIds) {
      await tx.$executeRaw`
        INSERT INTO chat_conversation_members (conversation_id, user_id, role, role_id)
        SELECT ${conversationId}::uuid, ${userId}::uuid, 'member', ${roleId}::uuid
         WHERE NOT EXISTS (SELECT 1 FROM chat_conversation_members WHERE conversation_id = ${conversationId}::uuid AND user_id = ${userId}::uuid AND left_at IS NULL)`
    }
  }

  async function open(tx, row, hosts, expiresAt) {
    const [owner, ...others] = hosts
    const title = `Cita · ${row.service_name} · ${row.guest_name || row.reference}`
    const conv = (await tx.$queryRaw`
      INSERT INTO chat_conversations (type, title, created_by_user_id, company_id, is_public, metadata)
      VALUES ('channel', ${title}, ${owner}::uuid, ${row.company_id}::uuid, false, ${JSON.stringify({ origin: 'meeting', bookingId: row.id })}::jsonb)
      RETURNING id`)[0]
    const roleIds = await roles.seedDefaultRoles(conv.id, tx)
    await tx.$executeRaw`INSERT INTO chat_conversation_members (conversation_id, user_id, role, role_id) VALUES (${conv.id}::uuid, ${owner}::uuid, 'owner', ${roleIds.Owner}::uuid)`
    await addMembers(tx, conv.id, others, roleIds.Member)
    const link = (await tx.$queryRaw`
      INSERT INTO call_link (id, conversation_id, token, code, require_lobby, access_mode, expires_at, created_by_user_id)
      VALUES (uuidv7(), ${conv.id}::uuid, ${crypto.randomBytes(32).toString('hex')}, ${generateCallCode()}, true, 'LOBBY', ${expiresAt}, ${owner}::uuid)
      RETURNING id`)[0]
    await tx.$executeRaw`
      INSERT INTO booking_meeting (booking_id, company_id, conversation_id, call_link_id, version)
      VALUES (${row.id}::uuid, ${row.company_id}::uuid, ${conv.id}::uuid, ${link.id}::uuid, ${row.version})`
  }

  async function project(bookingId) {
    let revokedLink = null
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`bookings.meeting:${bookingId}`}, 0))::text`
      const row = (await tx.$queryRaw`
        SELECT b.id, b.company_id, b.space_id, b.status::text AS status, b.ends_at, b.version, b.reference, b.guest_name,
               sv.name AS service_name, sv.meeting,
               (SELECT r.user_id FROM booking_allocation a JOIN booking_resource r ON r.id = a.resource_id
                 WHERE a.booking_id = b.id AND a.active ORDER BY a.id DESC LIMIT 1) AS resource_user_id
          FROM booking b JOIN booking_service sv ON sv.id = b.service_id AND sv.company_id = b.company_id
         WHERE b.id = ${bookingId}::uuid`)[0]
      if (!row) return 'missing'
      const meeting = (await tx.$queryRaw`SELECT * FROM booking_meeting WHERE booking_id = ${bookingId}::uuid`)[0]
      const expiresAt = new Date(new Date(row.ends_at).getTime() + MEETING_GRACE_MS)
      const live = meetingOf(row.meeting).kind === 'runly' && row.status === 'CONFIRMED' && expiresAt.getTime() > Date.now()
      if (!live) {
        if (!meeting) return 'none'
        if (meeting.revoked_at) {
          if (meeting.version < row.version) await tx.$executeRaw`UPDATE booking_meeting SET version = ${row.version}, updated_at = now() WHERE booking_id = ${bookingId}::uuid`
          return 'none'
        }
        // Cancelled, rejected, finished or no longer online: the link stops working and guests leave.
        await tx.$executeRaw`UPDATE call_link SET revoked_at = now(), updated_at = now() WHERE id = ${meeting.call_link_id}::uuid AND revoked_at IS NULL`
        await tx.$executeRaw`UPDATE booking_meeting SET revoked_at = now(), version = ${row.version}, updated_at = now() WHERE booking_id = ${bookingId}::uuid`
        revokedLink = meeting.call_link_id
        return 'revoked'
      }
      const hosts = await hostsOf(tx, row)
      if (!meeting) {
        if (!hosts.length) return 'no-host'
        await open(tx, row, hosts, expiresAt)
        return 'created'
      }
      if (meeting.version >= row.version && !meeting.revoked_at) return 'current'
      // Moved (or back online): same channel and link, new window, the new host joins.
      await tx.$executeRaw`UPDATE call_link SET expires_at = ${expiresAt}, revoked_at = NULL, updated_at = now() WHERE id = ${meeting.call_link_id}::uuid`
      const member = (await tx.$queryRaw`SELECT id FROM chat_channel_roles WHERE conversation_id = ${meeting.conversation_id}::uuid AND name = 'Member' LIMIT 1`)[0]
      if (member) await addMembers(tx, meeting.conversation_id, hosts, member.id)
      await tx.$executeRaw`UPDATE booking_meeting SET version = ${row.version}, revoked_at = NULL, updated_at = now() WHERE booking_id = ${bookingId}::uuid`
      return 'updated'
    }, { maxWait: 15000, timeout: 30000 })
    if (revokedLink) await kick({ linkId: revokedLink }).catch((error) => log('[runly.bookings] meeting guests not removed:', error?.message ?? error))
    return outcome
  }

  async function projectQuietly(bookingId) {
    try { return await project(bookingId) } catch (error) { log('[runly.bookings] meeting sync failed:', error?.message ?? error); return 'error' }
  }

  // Worker: confirmed online bookings still without a room, rooms behind their booking's
  // version, and rooms of services that stopped being online.
  async function syncDue({ limit = 200 } = {}) {
    const due = await prisma.$queryRaw`
      SELECT b.id FROM booking b
        JOIN booking_service sv ON sv.id = b.service_id AND sv.company_id = b.company_id
        LEFT JOIN booking_meeting m ON m.booking_id = b.id
       WHERE (m.booking_id IS NULL AND sv.meeting->>'kind' = 'runly' AND b.status = 'CONFIRMED' AND b.ends_at > now())
          OR (m.booking_id IS NOT NULL AND m.version < b.version)
          OR (m.booking_id IS NOT NULL AND m.revoked_at IS NULL AND (sv.meeting->>'kind' IS DISTINCT FROM 'runly' OR b.ends_at < now() - interval '1 day'))
       ORDER BY b.updated_at LIMIT ${limit}`
    const counts = { processed: due.length, failed: 0 }
    for (const { id } of due) {
      const outcome = await projectQuietly(id)
      const k = outcome === 'error' ? 'failed' : outcome
      counts[k] = (counts[k] ?? 0) + 1
    }
    return counts
  }

  // What a guest may see: the lobby link, only while the booking is confirmed and the
  // link is live. Never the channel, the meeting ID or anything internal.
  async function guestJoin(bookingId, { ensure = false } = {}) {
    const read = async () => (await prisma.$queryRaw`
      SELECT b.status::text AS status, sv.meeting, l.token, l.revoked_at, l.expires_at
        FROM booking b JOIN booking_service sv ON sv.id = b.service_id AND sv.company_id = b.company_id
        LEFT JOIN booking_meeting m ON m.booking_id = b.id
        LEFT JOIN call_link l ON l.id = m.call_link_id
       WHERE b.id = ${bookingId}::uuid`)[0]
    let row = await read()
    if (!row || row.status !== 'CONFIRMED') return null
    const meeting = meetingOf(row.meeting)
    if (meeting.kind === 'external') return { kind: 'external', url: meeting.url }
    // Without calls configured on the instance a guest link would only show an error.
    if (meeting.kind !== 'runly' || !readLiveKitConfig(env).enabled) return null
    if (!row.token && ensure) { await projectQuietly(bookingId); row = await read() }
    if (!row?.token || row.revoked_at || (row.expires_at && new Date(row.expires_at) < new Date())) return null
    return { kind: 'runly', url: links.joinUrl(row.token) }
  }

  // Staff: the meeting channel to open from the booking, for its members only.
  async function staffMeeting(companyId, bookingId, userId, { ensure = true } = {}) {
    const row = (await prisma.$queryRaw`
      SELECT b.status::text AS status, sv.meeting, m.conversation_id, m.revoked_at,
             EXISTS (SELECT 1 FROM chat_conversation_members cm WHERE cm.conversation_id = m.conversation_id AND cm.user_id = ${userId}::uuid AND cm.left_at IS NULL) AS member
        FROM booking b JOIN booking_service sv ON sv.id = b.service_id AND sv.company_id = b.company_id
        LEFT JOIN booking_meeting m ON m.booking_id = b.id
       WHERE b.id = ${bookingId}::uuid AND b.company_id = ${companyId}::uuid`)[0]
    const kind = meetingOf(row?.meeting).kind
    if (!row || kind === 'none') return null
    if (kind === 'external') return row.status === 'CONFIRMED' ? { kind, url: row.meeting.url } : null
    // Just confirmed: the after-commit projection may still be running.
    if (!row.conversation_id && row.status === 'CONFIRMED' && ensure) { await projectQuietly(bookingId); return staffMeeting(companyId, bookingId, userId, { ensure: false }) }
    if (!row.conversation_id || row.revoked_at) return { kind, conversationId: null }
    return { kind, conversationId: row.member ? row.conversation_id : null }
  }

  return { project, projectQuietly, syncDue, guestJoin, staffMeeting }
}
