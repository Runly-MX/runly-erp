// runly.lms course share links, manager side (lms.course.manage): read, enable
// and configure, rotate. The token is created the first time the link is enabled.
import { resolveAppBaseUrl } from '../../services/email-templates.js'
import { LmsError } from './lms-error.js'
import { newShareToken, normalizeShareInput, normalizeShareSettings, sharePath } from './lms-share-core.js'

const SHARE_SELECT = { id: true, status: true, shareEnabled: true, shareToken: true, shareSettings: true, certificateTemplateId: true }

export function createLmsShareService({ prisma, appBaseUrl = () => resolveAppBaseUrl(process.env), newToken = newShareToken }) {
  async function findCourse(companyId, courseId) {
    const course = await prisma.lmsCourse.findFirst({ where: { id: courseId, companyId, enabled: true }, select: SHARE_SELECT })
    if (!course) throw new LmsError('El curso no existe.', 404)
    return course
  }

  // url is absolute when the app URL is configured; otherwise the client prefixes its origin.
  function shape(course) {
    const path = course.shareToken ? sharePath(course.shareToken) : null
    const base = appBaseUrl()
    return {
      enabled: course.shareEnabled === true,
      url: path ? (base ? `${base}${path}` : path) : null,
      path,
      published: course.status === 'published',
      hasCertificateTemplate: Boolean(course.certificateTemplateId),
      settings: normalizeShareSettings(course.shareSettings),
    }
  }

  async function getShare(companyId, courseId) {
    return shape(await findCourse(companyId, courseId))
  }

  async function updateShare(companyId, courseId, body = {}) {
    const course = await findCourse(companyId, courseId)
    const { enabled, settings } = normalizeShareInput(body, course.shareSettings)
    const data = { shareSettings: settings }
    if (enabled !== null) data.shareEnabled = enabled
    if ((enabled ?? course.shareEnabled) && !course.shareToken) data.shareToken = newToken()
    return shape(await prisma.lmsCourse.update({ where: { id: course.id }, data, select: SHARE_SELECT }))
  }

  // A new token: the previous link stops working at once.
  async function rotateShare(companyId, courseId) {
    const course = await findCourse(companyId, courseId)
    return shape(await prisma.lmsCourse.update({ where: { id: course.id }, data: { shareToken: newToken() }, select: SHARE_SELECT }))
  }

  return { getShare, updateShare, rotateShare }
}
