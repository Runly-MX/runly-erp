// runly.ticketing check-in (F6D). Validating a scan only reads; admitting it consumes the
// entry right. Both run in one transaction that locks the ticket row, so concurrent gates,
// reissues and transfers serialize on it; the partial unique index ticket_admission_once_key
// backs the lock. Every committed scan, admitted or rejected, is appended to ticket_admission.
import { pgCode } from '../bookings/bookings-command-service.js'
import { credentialMatches, hashSecret, notFound, parseCredential } from './ticketing-core.js'
import { createTicketingTx } from './ticketing-tx.js'

const M = 60000

// Doors open at doors_open_at (or admit_before_minutes before the start) and close
// admit_after_minutes after the start.
export function admissionWindow(s) {
  const starts = new Date(s.starts_at).getTime()
  const opens = s.doors_open_at ? new Date(s.doors_open_at).getTime() : starts - s.admit_before_minutes * M
  return { opensAt: new Date(opens), closesAt: new Date(starts + s.admit_after_minutes * M) }
}

// Order matters: a dead credential says so before anything else; a ticket of another
// function says so even if it was already used there.
export function decide(state, session, at) {
  if (state.reason) return state.reason
  const t = state.row
  if (t.status === 'CANCELLED' || t.status === 'EXPIRED') return 'cancelled'
  if (t.status === 'PENDING_PAYMENT') return 'not_issued'
  if (t.session_id !== session.id) return 'wrong_session'
  if (t.status === 'USED') return 'already_used'
  const w = admissionWindow(session)
  if (session.status !== 'scheduled' || at < w.opensAt.getTime() || at >= w.closesAt.getTime()) return 'outside_window'
  return 'ok'
}

export function createTicketingCheckinService({ prisma, now = () => Date.now() }) {
  const { inTx, history, emit } = createTicketingTx({ prisma })

  async function sessionOf(db, companyId, sessionId) {
    const s = (await db.$queryRaw`
      SELECT s.*, b.starts_at, b.ends_at, b.capacity, e.title, e.venue, sp.timezone FROM ticket_session s
        JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
        JOIN ticket_event e ON e.id = s.event_id AND e.company_id = s.company_id
        JOIN booking_space sp ON sp.id = e.space_id AND sp.company_id = s.company_id
       WHERE s.id = ${sessionId}::uuid AND s.company_id = ${companyId}::uuid`)[0]
    if (!s) throw notFound('Función')
    return s
  }
  const serializeSession = (s) => ({
    id: s.id, eventId: s.event_id, title: s.title, venue: s.venue, timezone: s.timezone, status: s.status,
    startsAt: s.starts_at, endsAt: s.ends_at, capacity: s.capacity, ...admissionWindow(s),
  })

  // Ticket rows of this company only, locked: a reissue or another gate waits for us.
  const byId = (tx, companyId, id) => tx.$queryRaw`
    SELECT t.id, t.order_id, t.type_id, t.session_id, t.status, t.code, t.holder_name, t.credential_hash, t.credential_version, ty.name AS type_name, ts.event_id
      FROM ticket t JOIN ticket_type ty ON ty.id = t.type_id AND ty.company_id = t.company_id
      JOIN ticket_session ts ON ts.id = t.session_id AND ts.company_id = t.company_id
     WHERE t.id = ${id}::uuid AND t.company_id = ${companyId}::uuid FOR UPDATE OF t`
  const byCode = (tx, companyId, code) => tx.$queryRaw`
    SELECT t.id, t.order_id, t.type_id, t.session_id, t.status, t.code, t.holder_name, t.credential_hash, t.credential_version, ty.name AS type_name, ts.event_id
      FROM ticket t JOIN ticket_type ty ON ty.id = t.type_id AND ty.company_id = t.company_id
      JOIN ticket_session ts ON ts.id = t.session_id AND ts.company_id = t.company_id
     WHERE t.code = ${code} AND t.company_id = ${companyId}::uuid FOR UPDATE OF t`

  // trusted: the credential (or the typed code) designates this ticket. A wrong secret
  // is "revoked"/"cancelled" only when it is the hash of a credential this ticket had.
  async function credentialState(tx, companyId, { text, code }) {
    if (code) {
      const row = (await byCode(tx, companyId, code))[0] ?? null
      return row ? { row, trusted: true, method: 'code' } : { row: null, trusted: false, reason: 'unknown', method: 'code' }
    }
    const parsed = parseCredential(text)
    const row = parsed ? (await byId(tx, companyId, parsed.ticketId))[0] ?? null : null
    if (credentialMatches(parsed?.secret ?? 'x', row?.credential_hash ?? null)) return { row, trusted: true, method: 'qr', version: row.credential_version }
    if (row) {
      const revoked = (await tx.$queryRaw`
        SELECT reason, credential_version FROM ticket_credential_revoked
         WHERE ticket_id = ${row.id}::uuid AND company_id = ${companyId}::uuid AND credential_hash = ${hashSecret(parsed.secret)}`)[0]
      if (revoked) return { row, trusted: true, method: 'qr', version: revoked.credential_version, reason: ['cancelled', 'expired'].includes(revoked.reason) ? 'cancelled' : 'revoked' }
    }
    // Forged or unknown: the row (if any) is kept only for the audit, never shown.
    return { row, trusted: false, reason: 'unknown', method: 'qr' }
  }

  // What the gate may see: ticket details only when the credential was genuine and the
  // ticket belongs to this event (another event's attendee stays private).
  async function view(tx, { reason, state, session }) {
    const own = state.trusted && state.row.event_id === session.event_id
    const t = state.row
    const out = { reason, ticket: own ? { id: t.id, code: t.code, typeName: t.type_name, holderName: t.holder_name, credentialVersion: t.credential_version } : null }
    if (reason === 'wrong_session') {
      if (own) out.ticketSession = (await tx.$queryRaw`SELECT b.starts_at AS "startsAt" FROM ticket_session s JOIN booking_session b ON b.id = s.booking_session_id WHERE s.id = ${t.session_id}::uuid`)[0] ?? null
      else out.otherEvent = true
    }
    if (reason === 'already_used' && own) {
      const first = (await tx.$queryRaw`
        SELECT a.scanned_at, a.device_id, a.method, p.display_name FROM ticket_admission a LEFT JOIN user_profile p ON p.id = a.operator_id
         WHERE a.ticket_id = ${t.id}::uuid AND a.result = 'admitted'`)[0]
      if (first) out.firstAdmission = { at: first.scanned_at, deviceId: first.device_id, method: first.method, operatorName: first.display_name }
    }
    if (reason === 'outside_window') out.window = admissionWindow(session)
    return out
  }

  // admit = false validates without consuming. Rejections are recorded only when admitting.
  async function scan({ companyId, operatorId, sessionId, text = null, code = null, deviceId = null, admit = true }, retried = false) {
    try {
      return await inTx(async (tx) => {
        const session = await sessionOf(tx, companyId, sessionId)
        const state = await credentialState(tx, companyId, { text, code })
        const at = now()
        const reason = decide(state, session, at)
        const result = reason !== 'ok' ? 'rejected' : admit ? 'admitted' : 'valid'
        let admittedAt = null
        if (admit) {
          const row = (await tx.$queryRaw`
            INSERT INTO ticket_admission (company_id, ticket_id, session_id, result, reason, method, credential_version, device_id, operator_id, scanned_at)
            VALUES (${companyId}::uuid, ${state.row?.id ?? null}::uuid, ${session.id}::uuid, ${result === 'admitted' ? 'admitted' : 'rejected'}, ${reason},
                    ${state.method}, ${state.version ?? null}, ${deviceId}, ${operatorId}::uuid, ${new Date(at)})
            RETURNING scanned_at`)[0]
          if (result === 'admitted') {
            admittedAt = row.scanned_at
            await tx.$executeRaw`UPDATE ticket SET status = 'USED', version = version + 1, updated_at = now() WHERE id = ${state.row.id}::uuid`
            await history(tx, { companyId, entity: 'ticket', entityId: state.row.id, action: 'admit', actorId: operatorId, before: { status: 'ISSUED' }, after: { status: 'USED', sessionId: session.id, method: state.method, deviceId } })
            // F6E: a used ticket is never resent, so its sealed copy goes; Automations learn of the entry (ids only).
            await tx.$executeRaw`DELETE FROM ticket_credential_secret WHERE ticket_id = ${state.row.id}::uuid`
            await emit(tx, companyId, 'ticketing.ticket.admitted', { id: state.row.id, orderId: state.row.order_id, eventId: session.event_id, sessionId: session.id, typeId: state.row.type_id, credentialVersion: state.row.credential_version, method: state.method })
          }
        }
        return { result, admittedAt, ...(await view(tx, { reason, state, session })) }
      })
    } catch (error) {
      // The row lock makes this unreachable in practice; the index still wins if it is not.
      if (!retried && pgCode(error) === '23505') return scan({ companyId, operatorId, sessionId, text, code, deviceId, admit }, true)
      throw error
    }
  }

  async function sessionBoard({ companyId, sessionId }) {
    const session = await sessionOf(prisma, companyId, sessionId)
    const [counts, rejected, recent] = await Promise.all([
      prisma.$queryRaw`
        SELECT count(*) FILTER (WHERE status = 'USED')::int AS admitted, count(*) FILTER (WHERE status = 'ISSUED')::int AS pending
          FROM ticket WHERE company_id = ${companyId}::uuid AND session_id = ${sessionId}::uuid`,
      prisma.$queryRaw`SELECT count(*)::int AS n FROM ticket_admission WHERE company_id = ${companyId}::uuid AND session_id = ${sessionId}::uuid AND result = 'rejected'`,
      prisma.$queryRaw`
        SELECT a.id, a.result, a.reason, a.method, a.device_id, a.scanned_at, p.display_name AS operator_name,
               CASE WHEN a.reason <> 'unknown' AND ts.event_id = ${session.event_id}::uuid THEN t.code END AS code,
               CASE WHEN a.reason <> 'unknown' AND ts.event_id = ${session.event_id}::uuid THEN t.holder_name END AS holder_name,
               CASE WHEN a.reason <> 'unknown' AND ts.event_id = ${session.event_id}::uuid THEN ty.name END AS type_name
          FROM ticket_admission a
          LEFT JOIN ticket t ON t.id = a.ticket_id
          LEFT JOIN ticket_type ty ON ty.id = t.type_id
          LEFT JOIN ticket_session ts ON ts.id = t.session_id
          LEFT JOIN user_profile p ON p.id = a.operator_id
         WHERE a.company_id = ${companyId}::uuid AND a.session_id = ${sessionId}::uuid
         ORDER BY a.scanned_at DESC, a.id DESC LIMIT 30`,
    ])
    return {
      session: serializeSession(session),
      stats: { admitted: counts[0].admitted, pending: counts[0].pending, rejected: rejected[0].n },
      recent: recent.map((r) => ({ id: r.id, result: r.result, reason: r.reason, method: r.method, deviceId: r.device_id, at: r.scanned_at, operatorName: r.operator_name, code: r.code, holderName: r.holder_name, typeName: r.type_name })),
    }
  }

  // Functions this person may control: of events they work in (or all, for ticketing
  // admins), from yesterday on, so a late session is still listed after midnight.
  async function checkinSessions({ companyId, userId, all }) {
    const rows = await prisma.$queryRaw`
      SELECT s.*, b.starts_at, b.ends_at, b.capacity, e.title, e.venue, sp.timezone FROM ticket_session s
        JOIN ticket_event e ON e.id = s.event_id AND e.company_id = s.company_id
        JOIN booking_space sp ON sp.id = e.space_id AND sp.company_id = s.company_id
        JOIN booking_session b ON b.id = s.booking_session_id AND b.company_id = s.company_id
       WHERE s.company_id = ${companyId}::uuid AND e.enabled AND s.status = 'scheduled'
         AND b.starts_at + make_interval(mins => s.admit_after_minutes) > ${new Date(now() - 86400000)}
         AND (${all}::boolean OR EXISTS (SELECT 1 FROM booking_space_member m WHERE m.space_id = e.space_id AND m.company_id = e.company_id AND m.user_id = ${userId}::uuid))
       ORDER BY b.starts_at, s.id LIMIT 200`
    return rows.map(serializeSession)
  }

  return { scan, sessionBoard, checkinSessions }
}
