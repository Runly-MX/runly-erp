// Course page promo video ("Video de presentación"): an enabled video or embed
// lesson of the course that opens without enrolling (free section or preview).
import { LmsError } from './lms-error.js'
import { isOpenPreview } from './lms-share-core.js'

export const PROMO_KINDS = new Set(['video', 'embed'])

const withSectionFree = (lesson) => ({ ...lesson, sectionFree: lesson.section?.free === true })

// Pure: can this lesson (with sectionFree) be the promo of courseId?
export function isPromoEligible(lesson, courseId) {
  return Boolean(lesson) && lesson.enabled !== false && lesson.courseId === courseId && PROMO_KINDS.has(lesson.kind) && isOpenPreview(lesson)
}

const findLesson = (prisma, where) => prisma.lmsLesson.findFirst({ where: { ...where, enabled: true }, include: { section: { select: { free: true } } } })

// Course PATCH: 400 unless the lesson is an eligible promo of this course.
export async function assertPromoLesson(prisma, companyId, courseId, lessonId) {
  if (!lessonId) return
  const lesson = await findLesson(prisma, { id: lessonId, companyId })
  if (!lesson || !isPromoEligible(withSectionFree(lesson), courseId)) {
    throw new LmsError('El video de presentación debe ser una lección de video o enlace de este curso, en una sección gratis o marcada como vista previa.', 400)
  }
}

// { lessonId, title, kind, media, poster, embedUrl } or null. resolveMedia: the learn
// service's signer (file or HLS, same as an opened lesson). allow: extra filter
// (share links pass their scope). Watching it never records progress.
export async function loadPromo(prisma, course, resolveMedia, { allow = () => true } = {}) {
  if (!course?.promoLessonId) return null
  const row = await findLesson(prisma, { id: course.promoLessonId, courseId: course.id })
  const lesson = row ? withSectionFree(row) : null
  if (!isPromoEligible(lesson, course.id) || !allow(lesson)) return null
  const resolved = resolveMedia ? await resolveMedia(row).catch(() => ({})) : {}
  return {
    lessonId: lesson.id,
    title: lesson.title,
    kind: lesson.kind,
    media: lesson.kind === 'video' ? resolved.media ?? null : null,
    mediaUrl: lesson.kind === 'video' ? resolved.mediaUrl ?? null : null,
    poster: resolved.poster ?? null,
    embedUrl: lesson.kind === 'embed' ? lesson.embedUrl : null,
  }
}
