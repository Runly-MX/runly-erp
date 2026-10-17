// runly.lms notifications (evaluation and social). Failures are logged and never fail the request.
const LEARN_LINK = (courseId) => `/app/m/runly.lms/learn/${courseId}`
const QUESTIONS_LINK = (courseId, lessonId) => `${LEARN_LINK(courseId)}?lesson=${lessonId}&tab=preguntas`
const ANNOUNCEMENTS_LINK = (courseId) => `${LEARN_LINK(courseId)}?tab=anuncios`
const excerpt = (text, max = 200) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
const REVIEW_LINK = '/app/m/runly.lms/review'

export function createLmsNotifier({ notificationService = null } = {}) {
  // recipientIds: several recipients in one publish; recipientId: just one.
  async function send({ companyId, actorId, recipientId, recipientIds, eventType, title, body, link, sourceType, sourceId }) {
    const userIds = [...new Set(recipientIds ?? [recipientId])].filter((id) => id && id !== actorId)
    if (!notificationService?.publish || !userIds.length) return
    try {
      await notificationService.publish({
        companyId,
        actorId,
        input: {
          eventType,
          title,
          body: body?.slice(0, 1000),
          link,
          recipients: { userIds },
          channels: ['in_app', 'web_push'],
          priority: 'medium',
          sourceType,
          sourceId,
          dedupeKey: `${eventType}:${sourceId}:${userIds.length === 1 ? userIds[0] : 'many'}:${Date.now()}`,
        },
      })
    } catch (error) {
      console.error('[runly.lms] notification failed', { eventType, error: error?.message })
    }
  }

  // To the course creator: a submission or an attempt needing review arrived.
  function received({ companyId, actorId, course, lesson, learnerName, type, sourceId }) {
    const what = type === 'attempt' ? 'un examen con respuestas abiertas' : 'una tarea'
    return send({
      companyId,
      actorId,
      recipientId: course.createdById,
      eventType: 'lms.submission.received',
      title: 'Nueva entrega por revisar',
      body: `${learnerName} envió ${what} en «${lesson.title}» (${course.title}).`,
      link: REVIEW_LINK,
      sourceType: type === 'attempt' ? 'lms_quiz_attempt' : 'lms_submission',
      sourceId,
    })
  }

  // To the learner: an assignment was approved/returned or an attempt was graded.
  function graded({ companyId, actorId, recipientId, course, lesson, type, sourceId, detail }) {
    return send({
      companyId,
      actorId,
      recipientId,
      eventType: 'lms.submission.graded',
      title: 'Actividad calificada',
      body: `«${lesson.title}» (${course.title}): ${detail}`,
      link: LEARN_LINK(course.id),
      sourceType: type === 'attempt' ? 'lms_quiz_attempt' : 'lms_submission',
      sourceId,
    })
  }

  // ---- social --------------------------------------------------------------
  // To the root author and earlier repliers.
  function commentReplied({ companyId, actorId, recipientIds, course, lesson, actorName, commentId, body }) {
    return send({
      companyId,
      actorId,
      recipientIds,
      eventType: 'lms.comment.replied',
      title: 'Respuesta en una pregunta',
      body: `${actorName} respondió en «${lesson.title}» (${course.title}): ${excerpt(body)}`,
      link: QUESTIONS_LINK(course.id, lesson.id),
      sourceType: 'lms_comment',
      sourceId: commentId,
    })
  }

  // To the course creator, on a new root question.
  function commentQuestion({ companyId, actorId, course, lesson, actorName, commentId, body }) {
    return send({
      companyId,
      actorId,
      recipientId: course.createdById,
      eventType: 'lms.comment.question',
      title: 'Nueva pregunta en un curso',
      body: `${actorName} preguntó en «${lesson.title}» (${course.title}): ${excerpt(body)}`,
      link: QUESTIONS_LINK(course.id, lesson.id),
      sourceType: 'lms_comment',
      sourceId: commentId,
    })
  }

  // To every active learner of the course.
  function announcementPublished({ companyId, actorId, recipientIds, course, announcement }) {
    return send({
      companyId,
      actorId,
      recipientIds,
      eventType: 'lms.announcement.published',
      title: 'Nuevo anuncio del curso',
      body: `${course.title}: ${announcement.title}`,
      link: ANNOUNCEMENTS_LINK(course.id),
      sourceType: 'lms_announcement',
      sourceId: announcement.id,
    })
  }

  // To the review author.
  function reviewReplied({ companyId, actorId, recipientId, course, reviewId, body }) {
    return send({
      companyId,
      actorId,
      recipientId,
      eventType: 'lms.review.replied',
      title: 'Respuesta a tu reseña',
      body: `${course.title}: ${excerpt(body)}`,
      link: LEARN_LINK(course.id),
      sourceType: 'lms_review',
      sourceId: reviewId,
    })
  }

  return { received, graded, commentReplied, commentQuestion, announcementPublished, reviewReplied }
}
