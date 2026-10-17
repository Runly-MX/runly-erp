// POST /public/lms/share/:token/access — invited guests enter with their access
// code (spec §17.5): with the personal link (`i`) or with email + code.
//  - first entry: answers { needsProfile } until the intake form comes along
//    (name + answers, same code), then creates the guest learner and links it
//    to the invite in one transaction;
//  - later entries (any device): a fresh guest token for the same learner. The
//    token hash is rotated, so the previous device is signed out.
// The code is checked in constant time; failures are counted per invite and
// lock it for a while (createAttemptGuard). Unknown email, wrong link and wrong
// code all answer the same 401.
import { LmsError } from './lms-error.js'
import {
  accessDenied, createAttemptGuard, hashAccessCode, inviteLocked, inviteRevoked, normalizeAccessInput, verifyAccessCode,
} from './lms-invite-core.js'
import { EMAIL_FIELD_KEY } from './lms-intake-core.js'
import { hashGuestToken, newGuestToken, normalizeJoinInput } from './lms-share-core.js'

const DUMMY_HASH = hashAccessCode('AAAAAAAA', 'dummy')
const guestRemoved = () => new LmsError('Tu acceso a este curso fue retirado.', 403, 'GUEST_REMOVED')
const alreadyActive = () => new LmsError('Tu acceso ya se activó. Vuelve a entrar con tu código.', 409, 'INVITE_ACTIVE')

export function createLmsGuestAccess({ prisma, sharedCourse, createGuestLearner, guard = createAttemptGuard(), openStatuses = ['active', 'completed'] }) {
  async function findInvite(course, input) {
    const invite = input.linkToken
      ? await prisma.lmsGuestInvite.findUnique({ where: { linkToken: input.linkToken } })
      : await prisma.lmsGuestInvite.findUnique({ where: { courseId_email: { courseId: course.id, email: input.email } } })
    return invite && invite.courseId === course.id && invite.companyId === course.companyId ? invite : null
  }

  // The invite's learner and enrollment when both still exist, else null.
  async function linkedGuest(course, invite) {
    if (!invite.learnerId) return null
    const learner = await prisma.lmsLearner.findUnique({ where: { id: invite.learnerId } })
    if (!learner || !learner.enabled || learner.companyId !== course.companyId) return null
    const enrollment = await prisma.lmsEnrollment.findUnique({ where: { courseId_learnerId: { courseId: course.id, learnerId: learner.id } } })
    return enrollment ? { learner, enrollment } : null
  }

  async function access(token, body = {}) {
    const { course, settings } = await sharedCourse(token)
    const input = normalizeAccessInput(body)
    const invite = await findInvite(course, input)
    if (!invite) {
      verifyAccessCode(input.code, 'dummy', DUMMY_HASH) // same work as a real check
      throw accessDenied()
    }
    const locked = guard.lockedFor(invite.id)
    if (locked) throw inviteLocked(locked)
    if (!verifyAccessCode(input.code, invite.linkToken, invite.codeHash)) {
      guard.fail(invite.id)
      throw accessDenied()
    }
    guard.clear(invite.id)
    // Checked after the code so a revoked invite is not revealed without it.
    if (invite.revokedAt) throw inviteRevoked()
    const now = new Date()

    const linked = await linkedGuest(course, invite)
    if (linked) {
      if (!openStatuses.includes(linked.enrollment.status)) throw guestRemoved()
      const guestToken = newGuestToken()
      await prisma.lmsLearner.update({ where: { id: linked.learner.id }, data: { guestTokenHash: hashGuestToken(guestToken) } })
      await prisma.lmsGuestInvite.update({ where: { id: invite.id }, data: { lastUsedAt: now } })
      return { guestToken, guest: { name: linked.learner.displayName, email: linked.learner.email }, resumed: true }
    }

    // First entry: the intake form (the invited email is fixed).
    if (body.name === undefined) return { needsProfile: true, guest: { name: invite.name, email: invite.email } }
    const joinInput = normalizeJoinInput(body, settings.intakeFields, { [EMAIL_FIELD_KEY]: invite.email })
    const { guestToken } = await createGuestLearner({
      course,
      name: joinInput.name,
      email: invite.email,
      profile: joinInput.profile,
      // Guards two first entries racing: only one links its learner.
      afterCreate: async (tx, learner) => {
        const result = await tx.lmsGuestInvite.updateMany({
          where: { id: invite.id, learnerId: invite.learnerId ?? null, revokedAt: null },
          data: { learnerId: learner.id, lastUsedAt: now },
        })
        if (!result.count) throw alreadyActive()
      },
    })
    return { guestToken, guest: { name: joinInput.name, email: invite.email }, resumed: false }
  }

  return { access }
}
