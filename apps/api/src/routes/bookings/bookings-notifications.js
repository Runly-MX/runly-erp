// Customer emails of runly.bookings, sent by the worker from booking_notification
// (written in each booking transaction). A row is claimed atomically, sent outside
// any transaction, then marked sent, retried with backoff, failed, or skipped
// (no SMTP). "sent" means the SMTP server accepted it, not that it was read.
import { escapeHtml, renderRunlyEmailLayout } from '../../services/email-templates.js'
import { manageToken, manageUrl } from './bookings-links.js'

const MAX_ATTEMPTS = 6
const backoffMs = (attempts) => Math.min(6 * 3600000, 60000 * 2 ** Math.max(0, attempts - 1))

const COPY = {
  pending: { kicker: 'Reservaciones', heading: 'Recibimos tu solicitud', lead: 'Tu solicitud de reservación está <strong>pendiente de confirmación</strong>. Te escribiremos cuando el negocio la confirme.', subject: 'Solicitud de reservación recibida' },
  confirmed: { kicker: 'Reservaciones', heading: 'Tu reservación está confirmada', lead: 'Tu reservación quedó <strong>confirmada</strong>.', subject: 'Reservación confirmada' },
  rescheduled: { kicker: 'Reservaciones', heading: 'Tu reservación cambió de horario', lead: 'Tu reservación se <strong>reprogramó</strong>. Este es el nuevo horario.', subject: 'Reservación reprogramada' },
  cancelled: { kicker: 'Reservaciones', heading: 'Tu reservación fue cancelada', lead: 'Tu reservación quedó <strong>cancelada</strong> y el horario se liberó.', subject: 'Reservación cancelada' },
  rejected: { kicker: 'Reservaciones', heading: 'No pudimos confirmar tu reservación', lead: 'El negocio <strong>no pudo confirmar</strong> tu solicitud. Puedes elegir otro horario.', subject: 'Solicitud de reservación no confirmada' },
  manage_link: { kicker: 'Reservaciones', heading: 'Tu nuevo enlace para gestionar la reservación', lead: 'Generamos un enlace nuevo; el anterior dejó de funcionar.', subject: 'Nuevo enlace de tu reservación' },
}

function when(date, timeZone) {
  return new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))
}

// Emails that carry the way in to an online appointment (never cancel/reject ones).
const MEETING_KINDS = new Set(['confirmed', 'rescheduled', 'manage_link'])

export function buildBookingEmail({ kind, booking, serviceName, spaceName, location, timezone, link, meeting = null, brand = null, env = process.env }) {
  const copy = COPY[kind]
  const online = meeting && MEETING_KINDS.has(kind) ? meeting : null
  const rows = [
    ['Folio', booking.reference],
    ['Servicio', serviceName],
    ['Fecha y hora', `${when(booking.starts_at, timezone)} (${timezone})`],
    ['Lugar', online ? 'En línea' : location || spaceName],
    ['Personas', String(booking.party_size)],
  ].filter(([, v]) => v)
  const lobbyNote = online?.kind === 'runly' ? ' Entrarás a una sala de espera y el negocio te admitirá.' : ''
  const bodyHtml = `
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#334155">Hola ${escapeHtml(booking.guest_name ?? '')}, ${copy.lead}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px 0;font-size:14px;color:#334155">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;width:38%">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}
    </table>
    ${online ? `<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#334155"><strong>Unirse a la reunión:</strong> <a href="${escapeHtml(online.url)}" style="color:#0f766e;word-break:break-all">${escapeHtml(online.url)}</a><br /><span style="font-size:13px;color:#64748b">Usa este enlace a la hora de tu cita.${lobbyNote}</span></p>` : ''}
    ${link ? `<p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#64748b">Si el botón no funciona, copia este enlace:<br /><span style="word-break:break-all;color:#334155">${escapeHtml(link)}</span></p>` : ''}`
  const html = renderRunlyEmailLayout({
    kicker: copy.kicker, heading: copy.heading, bodyHtml,
    cta: link && kind !== 'cancelled' && kind !== 'rejected' ? { label: 'Ver o gestionar mi reservación', url: link } : null,
    footnote: 'El enlace es personal: cualquiera que lo tenga puede ver y cambiar tu reservación. No lo compartas.',
    brand, env,
  })
  const text = [copy.heading, '', ...rows.map(([k, v]) => `${k}: ${v}`), ...(online ? ['', `Unirse a la reunión: ${online.url}`] : []), ...(link ? ['', `Gestionar: ${link}`] : [])].join('\n')
  return { subject: `${copy.subject} · ${booking.reference}`, html, text }
}

export function createBookingsNotifier({ prisma, sendMail, getBrand = async () => null, env = process.env, meetings = null }) {
  async function claim(limit) {
    return prisma.$queryRaw`
      UPDATE booking_notification SET status = 'sending', attempts = attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now()
       WHERE id IN (SELECT id FROM booking_notification
                     WHERE (status = 'pending' AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now())
                     ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING *`
  }

  async function render(n) {
    const row = (await prisma.$queryRaw`
      SELECT b.*, sv.name AS service_name, s.name AS space_name, s.timezone, p.location
        FROM booking b JOIN booking_service sv ON sv.id = b.service_id JOIN booking_space s ON s.id = b.space_id
        LEFT JOIN booking_page p ON p.id = b.page_id
       WHERE b.id = ${n.booking_id}::uuid AND b.company_id = ${n.company_id}::uuid`)[0]
    if (!row) return null
    const link = row.manage_token_version > 0 && row.manage_token_expires_at && new Date(row.manage_token_expires_at) > new Date()
      ? manageUrl(manageToken(row.id, row.manage_token_version, env), env) : null
    const brand = await getBrand(n.company_id).catch(() => null)
    // ensure: the room is prepared before the email goes out, even if the projection has not run yet.
    const meeting = meetings && MEETING_KINDS.has(n.kind) ? await meetings.guestJoin(row.id, { ensure: true }) : null
    return buildBookingEmail({ kind: n.kind, booking: row, serviceName: row.service_name, spaceName: row.space_name, location: row.location, timezone: row.timezone, link, meeting, brand, env })
  }

  async function processDue({ limit = 25 } = {}) {
    const rows = await claim(limit)
    const result = { processed: rows.length, sent: 0, retrying: 0, failed: 0, skipped: 0 }
    for (const n of rows) {
      try {
        const mail = await render(n)
        if (!mail) throw Object.assign(new Error('Reservación no encontrada'), { permanent: true })
        await sendMail({ companyId: n.company_id, to: n.recipient, ...mail })
        await prisma.$executeRaw`UPDATE booking_notification SET status = 'sent', sent_at = now(), locked_until = NULL, last_error = NULL, updated_at = now() WHERE id = ${n.id}::uuid`
        result.sent++
      } catch (error) {
        const message = String(error?.message ?? error).slice(0, 300)
        const noSmtp = /SMTP no configurado/i.test(message)
        const status = noSmtp ? 'skipped' : error?.permanent || n.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
        await prisma.$executeRaw`
          UPDATE booking_notification SET status = ${status}, last_error = ${message}, locked_until = NULL,
                 next_attempt_at = ${new Date(Date.now() + backoffMs(n.attempts))}, updated_at = now()
           WHERE id = ${n.id}::uuid`
        result[status === 'pending' ? 'retrying' : status]++
      }
    }
    return result
  }

  return { processDue }
}
