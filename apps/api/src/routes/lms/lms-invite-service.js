// runly.lms guest invitations, manager side (lms.course.manage): list, invite
// by email, resend (new code) and revoke. Only sha256 of each access code is
// stored, so the plain code exists only in the email and in the create/resend
// response (shown once in the dialog for manual delivery when mail is off).
import { resolveAppBaseUrl } from '../../services/email-templates.js'
import { LmsError } from './lms-error.js'
import { isUuid } from './lms-eval-shared.js'
import {
  formatAccessCode, hashAccessCode, inviteStatus, inviteUrl, newAccessCode, newInviteLinkToken, normalizeInviteList,
} from './lms-invite-core.js'
import { hashGuestToken, newGuestToken } from './lms-share-core.js'

const iso = (value) => (value ? new Date(value).toISOString() : null)
const MAIL_ERRORS = {
  MAIL_OFF: 'El envío de correo no está configurado. Copia el enlace y el código y envíalos tú.',
  NO_BASE_URL: 'No se conoce la dirección pública de la aplicación. Copia el enlace y el código y envíalos tú.',
  MAIL_FAILED: 'No se pudo enviar el correo. Copia el enlace y el código y envíalos tú.',
}

// sendMail({ to, subject, html, text, fromName, companyId }), buildMail (email
// template), getBrand(companyId): all optional; without them invites are still
// created and the response carries the link and code to share by hand.
export function createLmsInviteService({
  prisma, sendMail = null, buildMail = null, getBrand = null, appBaseUrl = () => resolveAppBaseUrl(process.env),
  newCode = newAccessCode, newLink = newInviteLinkToken, isMailConfigured = null,
}) {
  // isMailConfigured(companyId) checks real SMTP settings (company, website or
  // platform); without it, having a sender is taken as configured.
  const mailConfigured = async (companyId) => {
    if (!sendMail || !buildMail) return false
    if (!isMailConfigured) return true
    return Boolean(await isMailConfigured(companyId).catch(() => false))
  }

  async function findCourse(companyId, courseId) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, select: { id: true, companyId: true, title: true, shareToken: true } })
    if (!course) throw new LmsError('El curso no existe.', 404)
    return course
  }

  async function findInvite(course, inviteId) {
    const invite = isUuid(inviteId) ? await prisma.lmsGuestInvite.findFirst({ where: { id: inviteId, courseId: course.id, companyId: course.companyId } }) : null
    if (!invite) throw new LmsError('La invitación no existe.', 404)
    return invite
  }

  const requireLink = (course) => {
    if (!course.shareToken) throw new LmsError('Activa el enlace público del curso antes de invitar.', 409, 'SHARE_DISABLED')
  }

  async function serialize(rows) {
    const ids = [...new Set(rows.map((row) => row.learnerId).filter(Boolean))]
    const learners = ids.length ? await prisma.lmsLearner.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : []
    const names = new Map(learners.map((row) => [row.id, row.displayName]))
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      learnerName: row.learnerId ? names.get(row.learnerId) ?? null : null,
      status: inviteStatus(row),
      sentAt: iso(row.sentAt),
      lastUsedAt: iso(row.lastUsedAt),
      revokedAt: iso(row.revokedAt),
      createdAt: iso(row.createdAt),
    }))
  }
  const serializeOne = async (row) => (await serialize([row]))[0]

  // Sends one invite. Never throws: a mail failure leaves sentAt empty and the
  // caller shows the link and code instead.
  async function deliver(course, invite, code, brand) {
    const base = appBaseUrl()
    const link = inviteUrl(base, course.shareToken, invite.linkToken)
    const manual = (reason) => ({ sent: false, link, code: formatAccessCode(code), mailError: { code: reason, message: MAIL_ERRORS[reason] } })
    if (!(await mailConfigured(course.companyId))) return { row: invite, ...manual('MAIL_OFF') }
    if (!base) return { row: invite, ...manual('NO_BASE_URL') }
    try {
      const mail = buildMail({ courseTitle: course.title, inviteUrl: link, accessCode: formatAccessCode(code), name: invite.name, brand })
      await sendMail({ to: invite.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: brand?.name ?? undefined, companyId: course.companyId })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error('[runly.lms] invite mail failed', error?.message)
      return { row: invite, ...manual(/no configurado/i.test(error?.message ?? '') ? 'MAIL_OFF' : 'MAIL_FAILED') }
    }
    const row = await prisma.lmsGuestInvite.update({ where: { id: invite.id }, data: { sentAt: new Date() } })
    return { row, sent: true, link, code: formatAccessCode(code), mailError: null }
  }

  const brandFor = async (companyId) => (getBrand ? getBrand(companyId).catch(() => null) : null)

  async function listInvites(companyId, courseId) {
    const course = await findCourse(companyId, courseId)
    const rows = await prisma.lmsGuestInvite.findMany({ where: { courseId: course.id, companyId }, orderBy: { createdAt: 'desc' } })
    return { invites: await serialize(rows), mailConfigured: await mailConfigured(companyId) }
  }

  // Already invited (not revoked) emails are skipped; a revoked one is invited
  // again with a new link and code (and keeps its learner, so progress stays).
  async function createInvites(companyId, actorId, courseId, body) {
    const course = await findCourse(companyId, courseId)
    requireLink(course)
    const list = normalizeInviteList(body)
    const existing = await prisma.lmsGuestInvite.findMany({ where: { courseId: course.id, email: { in: list.map((item) => item.email) } } })
    const byEmail = new Map(existing.map((row) => [row.email, row]))
    const brand = await brandFor(companyId)
    const created = [], skipped = []
    for (const item of list) {
      const current = byEmail.get(item.email)
      if (current && !current.revokedAt) {
        skipped.push({ email: item.email, reason: 'Ya tenía una invitación vigente.' })
        continue
      }
      const code = newCode(), linkToken = newLink()
      const data = { name: item.name ?? current?.name ?? null, codeHash: hashAccessCode(code, linkToken), linkToken, invitedById: actorId, sentAt: null, revokedAt: null }
      const row = current
        ? await prisma.lmsGuestInvite.update({ where: { id: current.id }, data })
        : await prisma.lmsGuestInvite.create({ data: { ...data, companyId, courseId: course.id, email: item.email } })
      const result = await deliver(course, row, code, brand)
      created.push({ invite: await serializeOne(result.row), link: result.link, code: result.code, sent: result.sent, mailError: result.mailError })
    }
    return { created, skipped, mailConfigured: await mailConfigured(companyId) }
  }

  // A new code (the old one stops working); the personal link stays the same.
  async function resendInvite(companyId, courseId, inviteId) {
    const course = await findCourse(companyId, courseId)
    requireLink(course)
    const invite = await findInvite(course, inviteId)
    if (invite.revokedAt) throw new LmsError('La invitación está revocada. Invita de nuevo ese correo.', 409, 'INVITE_REVOKED')
    const code = newCode()
    const row = await prisma.lmsGuestInvite.update({ where: { id: invite.id }, data: { codeHash: hashAccessCode(code, invite.linkToken) } })
    const result = await deliver(course, row, code, await brandFor(companyId))
    return { invite: await serializeOne(result.row), link: result.link, code: result.code, sent: result.sent, mailError: result.mailError }
  }

  // Immediate: the guest's current token is replaced by a random one nobody
  // holds, and every guest request checks the invite anyway.
  async function revokeInvite(companyId, courseId, inviteId) {
    const course = await findCourse(companyId, courseId)
    const invite = await findInvite(course, inviteId)
    if (invite.revokedAt) return serializeOne(invite)
    const row = await prisma.lmsGuestInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } })
    if (invite.learnerId) {
      await prisma.lmsLearner.updateMany({ where: { id: invite.learnerId, companyId, guestTokenHash: { not: null } }, data: { guestTokenHash: hashGuestToken(newGuestToken()) } })
    }
    return serializeOne(row)
  }

  return { listInvites, createInvites, resendInvite, revokeInvite, mailConfigured }
}
