import { buildCompanyDeletionEmail } from './email-templates.js'
import { createSmtpService } from './smtp-service.js'

// Optional heads-up so members can back up their data. Never throws: a mail
// failure must not undo an already-scheduled deletion.
export function createCompanyDeletionNotifier({ prisma, companyBrandService, createSmtp = createSmtpService }) {
  async function recipients(companyId) {
    const rows = await prisma.membership.findMany({
      where: { companyId, enabled: true, user: { enabled: true, isBot: false } },
      select: { user: { select: { email: true } } },
    })
    return [...new Set(rows.map(row => String(row.user?.email ?? '').trim().toLowerCase()).filter(Boolean))]
  }

  async function send(smtp, mail) {
    try { await smtp.company.sendEmail(mail) } catch { await smtp.instance.sendEmail(mail) }
  }

  function failureReason(error) {
    if (error?.reason === 'undecryptable_password') return 'smtp_secret_unreadable'
    if (error?.code === 'ENOENT') return 'smtp_attachment_unavailable'
    if (error?.code === 'EAUTH') return 'smtp_auth_failed'
    if (['ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND'].includes(error?.code)) return 'smtp_connection_failed'
    if (error?.message === 'SMTP no configurado') return 'smtp_not_configured'
    return 'smtp_send_failed'
  }

  async function notify({ companyId, companyName, purgeAfter, requestedByName }) {
    const result = { sent: 0, failed: 0 }
    const reasons = new Set()
    try {
      const to = await recipients(companyId)
      const brand = await companyBrandService?.getBrandForCompany(companyId)
      const content = buildCompanyDeletionEmail({ companyName, purgeAfter, requestedByName, brand })
      const smtp = { company: createSmtp({ prisma, companyId }), instance: createSmtp({ prisma }) }
      for (const address of to) {
        try { await send(smtp, { to: address, ...content, fromName: companyBrandService?.fromNameFor(brand) }); result.sent += 1 }
        catch (error) { result.failed += 1; reasons.add(failureReason(error)) }
      }
    } catch (error) {
      reasons.add(failureReason(error))
      result.failed += 1
    }
    return reasons.size ? { ...result, reasons: [...reasons] } : result
  }

  return { notify }
}
