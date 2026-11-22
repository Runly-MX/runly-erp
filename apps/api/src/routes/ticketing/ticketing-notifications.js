// runly.ticketing F6E ticket emails, sent by the worker from ticket_notification (written in
// the issuing transaction). A row is claimed atomically, rendered and sent outside any
// transaction, then marked sent, retried with backoff, failed or skipped (no SMTP).
// This is the only place that opens the sealed QR secrets (ticketing-vault.js): the QR goes
// into the email as an inline image and is never logged, stored elsewhere or returned.
import QRCode from 'qrcode'
import { escapeHtml, renderRunlyEmailLayout } from '../../services/email-templates.js'
import { qrText } from './ticketing-core.js'
import { orderToken, orderUrl } from './ticketing-links.js'
import { createTicketingVault } from './ticketing-vault.js'

const MAX_ATTEMPTS = 6
const backoffMs = (attempts) => Math.min(6 * 3600000, 60000 * 2 ** Math.max(0, attempts - 1))

const COPY = {
  issued: { heading: 'Tus boletos están listos', lead: 'Aquí tienes tus boletos. Muestra el código QR de cada uno en la entrada.', subject: 'Tus boletos' },
  resend: { heading: 'Te reenviamos tus boletos', lead: 'Estos son los mismos boletos que ya tenías; siguen siendo válidos.', subject: 'Tus boletos (reenvío)' },
  reissued: { heading: 'Tu boleto tiene un QR nuevo', lead: 'Reemplazamos el QR de tu boleto. Usa este; el anterior ya no sirve para entrar.', subject: 'QR nuevo de tu boleto' },
  transferred: { heading: 'Te transfirieron un boleto', lead: 'Ahora este boleto está a tu nombre. Usa este QR para entrar.', subject: 'Te transfirieron un boleto' },
}

function when(date, timeZone) {
  return new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date))
}

// tickets: [{ id, code, type, holderName, qr (text or null) }]. Pure, so tests can render it.
export async function buildTicketEmail({ kind, order, event, session, tickets, link, brand = null, env = process.env }) {
  const copy = COPY[kind]
  const attachments = []
  const cards = []
  for (const [index, t] of tickets.entries()) {
    let image = ''
    if (t.qr) {
      const cid = `ticket-qr-${index + 1}@runly`
      attachments.push({ filename: `boleto-${t.code}.png`, content: await QRCode.toBuffer(t.qr, { type: 'png', width: 360, margin: 2, errorCorrectionLevel: 'M' }), cid, contentType: 'image/png', contentDisposition: 'inline' })
      image = `<img src="cid:${cid}" width="180" height="180" alt="Código QR del boleto ${escapeHtml(t.code)}" style="display:block;width:180px;height:180px;border:0;margin:0 auto 8px auto" />`
    }
    cards.push(`
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 14px 0;border:1px solid #e2e8f0;border-radius:10px">
        <tr><td style="padding:16px;text-align:center">
          <p style="margin:0 0 10px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#64748b">Boleto ${index + 1} de ${tickets.length} · ${escapeHtml(t.type)}</p>
          ${image || '<p style="margin:0 0 8px 0;font-size:13px;color:#64748b">Este boleto no trae QR en este correo; pide al organizador que lo reemita.</p>'}
          <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a">${escapeHtml(t.holderName || order.buyer_name || '')}</p>
          <p style="margin:4px 0 0 0;font-size:13px;color:#64748b">Folio del boleto: <strong style="font-family:monospace;color:#0f172a">${escapeHtml(t.code)}</strong></p>
        </td></tr>
      </table>`)
  }
  const rows = [
    ['Evento', event.title],
    ['Fecha y hora', `${when(session.starts_at, event.timezone)} (${event.timezone})`],
    ['Lugar', event.venue],
    ['Orden', order.reference],
  ].filter(([, v]) => v)
  const bodyHtml = `
    <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#334155">Hola ${escapeHtml(order.buyer_name ?? '')}, ${copy.lead}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px 0;font-size:14px;color:#334155">
      ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#64748b;width:34%">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(v)}</td></tr>`).join('')}
    </table>
    ${cards.join('')}
    <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#64748b">Cada QR deja entrar una sola vez. Llega con tiempo y ten el brillo de tu pantalla alto; si no puedes mostrar el QR, da el folio del boleto en la entrada.</p>`
  const html = renderRunlyEmailLayout({
    kicker: 'Boletos', heading: copy.heading, bodyHtml,
    cta: link ? { label: 'Ver mis boletos', url: link } : null,
    footnote: 'No compartas tus códigos QR: quien los tenga puede entrar con ellos. El enlace "Ver mis boletos" es personal.',
    brand, env,
  })
  const text = [
    copy.heading, '', ...rows.map(([k, v]) => `${k}: ${v}`), '',
    ...tickets.map((t, i) => `Boleto ${i + 1} de ${tickets.length} (${t.type}) - ${t.holderName || order.buyer_name || ''} - folio ${t.code}${t.qr ? ' - el código QR viene como imagen en este correo' : ''}`),
    '', 'Cada QR deja entrar una sola vez.', ...(link ? ['', `Ver mis boletos: ${link}`] : []),
  ].join('\n')
  return { subject: `${copy.subject} · ${event.title}`, html, text, attachments }
}

export function createTicketingNotifier({ prisma, sendMail, getBrand = async () => null, env = process.env, vault = createTicketingVault({ env }) }) {
  async function claim(limit) {
    return prisma.$queryRaw`
      UPDATE ticket_notification SET status = 'sending', attempts = attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now()
       WHERE id IN (SELECT id FROM ticket_notification
                     WHERE (status = 'pending' AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now())
                     ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
      RETURNING *`
  }

  async function render(n) {
    const order = (await prisma.$queryRaw`SELECT * FROM ticket_order WHERE id = ${n.order_id}::uuid AND company_id = ${n.company_id}::uuid`)[0]
    if (!order) return null
    const event = (await prisma.$queryRaw`SELECT e.title, e.venue, sp.timezone FROM ticket_event e JOIN booking_space sp ON sp.id = e.space_id WHERE e.id = ${order.event_id}::uuid`)[0]
    const session = (await prisma.$queryRaw`SELECT b.starts_at FROM ticket_session s JOIN booking_session b ON b.id = s.booking_session_id WHERE s.id = ${order.session_id}::uuid`)[0]
    const rows = await prisma.$queryRaw`
      SELECT t.id, t.code, t.status, t.holder_name, ty.name AS type_name FROM ticket t JOIN ticket_type ty ON ty.id = t.type_id
       WHERE t.id = ANY(${n.ticket_ids}::uuid[]) AND t.company_id = ${n.company_id}::uuid ORDER BY t.created_at, t.id`
    // Only tickets still valid at send time: a cancelled or used one is never mailed.
    const live = rows.filter((t) => t.status === 'ISSUED')
    if (!live.length) return { skip: 'Los boletos ya no están vigentes' }
    const tickets = []
    for (const t of live) {
      const secret = await vault.reveal(prisma, { companyId: n.company_id, ticketId: t.id })
      tickets.push({ id: t.id, code: t.code, type: t.type_name, holderName: t.holder_name, qr: secret ? qrText(t.id, secret) : null })
    }
    const link = order.manage_token_version > 0 && order.manage_token_expires_at && new Date(order.manage_token_expires_at) > new Date()
      ? orderUrl(orderToken(order.id, order.manage_token_version, env), env) : null
    const brand = await getBrand(n.company_id).catch(() => null)
    return buildTicketEmail({ kind: n.kind, order, event, session, tickets, link, brand, env })
  }

  async function processDue({ limit = 20 } = {}) {
    const rows = await claim(limit)
    const result = { processed: rows.length, sent: 0, retrying: 0, failed: 0, skipped: 0 }
    for (const n of rows) {
      try {
        const mail = await render(n)
        if (!mail) throw Object.assign(new Error('Orden no encontrada'), { permanent: true })
        if (mail.skip) {
          await prisma.$executeRaw`UPDATE ticket_notification SET status = 'skipped', last_error = ${mail.skip}, locked_until = NULL, updated_at = now() WHERE id = ${n.id}::uuid`
          result.skipped++
          continue
        }
        await sendMail({ companyId: n.company_id, to: n.recipient, ...mail })
        await prisma.$executeRaw`UPDATE ticket_notification SET status = 'sent', sent_at = now(), locked_until = NULL, last_error = NULL, updated_at = now() WHERE id = ${n.id}::uuid`
        result.sent++
      } catch (error) {
        // Error text only (never the rendered mail or a QR).
        const message = String(error?.message ?? error).slice(0, 300)
        const noSmtp = /SMTP no configurado/i.test(message)
        const status = noSmtp ? 'skipped' : error?.permanent || n.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
        await prisma.$executeRaw`
          UPDATE ticket_notification SET status = ${status}, last_error = ${message}, locked_until = NULL,
                 next_attempt_at = ${new Date(Date.now() + backoffMs(n.attempts))}, updated_at = now()
           WHERE id = ${n.id}::uuid`
        result[status === 'pending' ? 'retrying' : status]++
      }
    }
    return result
  }

  return { processDue, render }
}
