// runly.lms: "your work was graded" email for invited share-link guests. A guest
// has no user, so in-app notifications skip them; when the guest came from an
// email invitation and SMTP is configured, a short email goes out instead.
// Best effort: graded() never throws and resolves to whether a mail was sent.
import { buildLmsGradedEmail, resolveAppBaseUrl } from '../../services/email-templates.js'
import { sharePath } from './lms-share-core.js'

// sendMail({ to, subject, html, text, fromName, companyId }), isMailConfigured(companyId),
// getBrand(companyId): the same deps the invitation email uses (createCompanyMailer).
export function createLmsGuestGradeMailer({
  prisma, sendMail = null, isMailConfigured = null, getBrand = null, buildMail = buildLmsGradedEmail, appBaseUrl = () => resolveAppBaseUrl(process.env),
}) {
  async function graded({ enrollment, course, lesson, type = 'submission', detail }) {
    try {
      const learner = enrollment?.learner
      if (!sendMail || !learner || learner.userProfileId || !learner.guestTokenHash) return false
      if (!course?.shareEnabled || !course.shareToken) return false
      const invite = await prisma.lmsGuestInvite.findFirst({ where: { courseId: course.id, learnerId: learner.id, revokedAt: null } })
      if (!invite?.email) return false
      const base = appBaseUrl()
      if (!base) return false
      if (isMailConfigured && !(await isMailConfigured(course.companyId))) return false
      const brand = getBrand ? await getBrand(course.companyId).catch(() => null) : null
      const mail = buildMail({
        courseTitle: course.title,
        lessonTitle: lesson.title,
        detail,
        courseUrl: `${base}${sharePath(course.shareToken)}`,
        name: learner.displayName,
        kind: type,
        brand,
      })
      await sendMail({ to: invite.email, subject: mail.subject, html: mail.html, text: mail.text, fromName: brand?.name ?? undefined, companyId: course.companyId })
      return true
    } catch (error) {
      console.error('[runly.lms] guest grade mail failed', { error: error?.message ?? String(error) })
      return false
    }
  }

  return { graded }
}
